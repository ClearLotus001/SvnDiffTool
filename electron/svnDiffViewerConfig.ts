import { app } from 'electron';
import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { promisify } from 'node:util';
import {
  canRestoreSvnDefaultDiffViewer,
  getOwnedSvnDiffRegistryEntries,
  normalizeSvnDiffViewerCommand,
  resolveSvnDiffViewerMode,
} from './svnDiffViewerConfigShared';

export type SvnDiffViewerScope = 'all-files' | 'text-only' | 'workbook-only';
export type SvnDiffViewerMode = SvnDiffViewerScope | 'mixed' | 'unconfigured' | 'unsupported';
export type SvnDiffViewerAvailabilityReason = 'ready' | 'windows-only' | 'packaged-only';

export interface SvnDiffViewerStatus {
  available: boolean;
  reason: SvnDiffViewerAvailabilityReason;
  executablePath: string | null;
  command: string | null;
  currentMode: SvnDiffViewerMode;
  canRestoreDefault: boolean;
  globalDiffCommand: string | null;
  workbookDiffCommands: Record<string, string | null>;
  workbookExtensions: string[];
}

interface SvnDiffViewerBackup {
  globalDiffCommand?: string | null;
  diffToolCommands?: Record<string, string | null>;
}

const execFileAsync = promisify(execFile);
const REG_MAX_BUFFER = 1024 * 1024;
const TORTOISE_REG_PATH = 'HKCU\\Software\\TortoiseSVN';
const TORTOISE_DIFF_TOOLS_REG_PATH = `${TORTOISE_REG_PATH}\\DiffTools`;
const WORKBOOK_EXTENSIONS = ['.xls', '.xlsx', '.xlsm', '.xlsb', '.xltx', '.xltm'] as const;
const WORKBOOK_EXTENSION_SET = new Set<string>(WORKBOOK_EXTENSIONS);
const DIFF_COMMAND_ARGUMENTS = ['%base', '%mine', '%bname', '%yname', '%burl', '%yurl', '%brev', '%yrev', '%peg', '%fname'];

export function normalizeSvnDiffViewerScope(value: string | null | undefined): SvnDiffViewerScope | null {
  switch (value) {
    case 'workbook-only':
      return 'workbook-only';
    case 'all-files':
    case 'text-only':
      return value;
    default:
      return null;
  }
}

function getBackupFilePath() {
  return path.join(app.getPath('userData'), 'svn-diff-viewer-backup.json');
}

function normalizeKeyName(value: string) {
  return value.trim().toLowerCase();
}

const normalizeCommand = normalizeSvnDiffViewerCommand;

function isWorkbookKey(value: string) {
  return WORKBOOK_EXTENSION_SET.has(normalizeKeyName(value));
}

function getAvailabilityReason(): SvnDiffViewerAvailabilityReason {
  if (process.platform !== 'win32') return 'windows-only';
  if (!app.isPackaged) return 'packaged-only';
  return 'ready';
}

function getDiffLauncherPath(): string | null {
  if (getAvailabilityReason() !== 'ready') return null;
  const launcherPath = path.join(process.resourcesPath, 'bin', 'svn_diff_launcher.exe');
  if (!fs.existsSync(launcherPath)) return null;
  return launcherPath;
}

function buildDiffCommand(): string | null {
  const launcherPath = getDiffLauncherPath();
  if (!launcherPath) return null;
  return `"${launcherPath}" ${DIFF_COMMAND_ARGUMENTS.join(' ')}`;
}

async function execReg(args: string[]): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  try {
    const result = await execFileAsync('reg', args, {
      encoding: 'utf-8',
      windowsHide: true,
      maxBuffer: REG_MAX_BUFFER,
    }) as { stdout: string; stderr: string };

    return {
      ok: true,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
    };
  } catch (error) {
    const execError = error as Error & { stdout?: string; stderr?: string };
    return {
      ok: false,
      stdout: execError.stdout ?? '',
      stderr: execError.stderr ?? execError.message,
    };
  }
}

function parseRegistryStringMap(stdout: string): Record<string, string> {
  const result: Record<string, string> = {};

  stdout.split(/\r?\n/).forEach((line) => {
    const match = line.match(/^\s*([^\s]+)\s+REG_\w+\s+(.*)$/);
    if (!match) return;

    const rawName = match[1]?.trim();
    const rawValue = match[2] ?? '';
    if (!rawName) return;
    result[normalizeKeyName(rawName)] = rawValue.trim();
  });

  return result;
}

async function readRegistryStringMap(key: string): Promise<Record<string, string>> {
  const result = await execReg(['query', key]);
  if (!result.ok) return {};
  return parseRegistryStringMap(result.stdout);
}

async function writeRegistryStringValue(key: string, valueName: string, value: string) {
  const result = await execReg(['add', key, '/v', valueName, '/t', 'REG_SZ', '/d', value, '/f']);
  if (result.ok) return;
  throw new Error(result.stderr || result.stdout || `Failed to write registry value: ${key}\\${valueName}`);
}

async function deleteRegistryValue(key: string, valueName: string) {
  const result = await execReg(['delete', key, '/v', valueName, '/f']);
  if (result.ok) return;
  const details = `${result.stdout}\n${result.stderr}`.toLowerCase();
  if (
    details.includes('unable to find')
    || details.includes('cannot find')
    || details.includes('找不到')
    || details.includes('无法找到')
  ) {
    return;
  }
  throw new Error(result.stderr || result.stdout || `Failed to delete registry value: ${key}\\${valueName}`);
}

async function readBackup(): Promise<SvnDiffViewerBackup> {
  try {
    const raw = await fs.promises.readFile(getBackupFilePath(), 'utf-8');
    const parsed = JSON.parse(raw) as SvnDiffViewerBackup;
    return {
      globalDiffCommand: parsed.globalDiffCommand ?? null,
      diffToolCommands: parsed.diffToolCommands && typeof parsed.diffToolCommands === 'object'
        ? Object.fromEntries(
            Object.entries(parsed.diffToolCommands).map(([key, value]) => [normalizeKeyName(key), value ?? null]),
          )
        : {},
    };
  } catch {
    return {
      diffToolCommands: {},
    };
  }
}

async function writeBackup(backup: SvnDiffViewerBackup) {
  const backupPath = getBackupFilePath();
  await fs.promises.mkdir(path.dirname(backupPath), { recursive: true });
  await fs.promises.writeFile(backupPath, JSON.stringify(backup, null, 2), 'utf-8');
}

async function clearBackupEntries(options: {
  clearGlobal?: boolean;
  keys?: string[];
}) {
  const backup = await readBackup();
  let changed = false;

  if (options.clearGlobal && backup.globalDiffCommand !== undefined) {
    delete backup.globalDiffCommand;
    changed = true;
  }

  if (options.keys?.length) {
    if (!backup.diffToolCommands) backup.diffToolCommands = {};

    for (const rawKey of options.keys) {
      const key = normalizeKeyName(rawKey);
      if (backup.diffToolCommands[key] === undefined) continue;
      delete backup.diffToolCommands[key];
      changed = true;
    }

    if (Object.keys(backup.diffToolCommands).length === 0) {
      delete backup.diffToolCommands;
    }
  }

  if (!changed) return;

  const nextBackup: SvnDiffViewerBackup = {};

  if (backup.globalDiffCommand !== undefined) {
    nextBackup.globalDiffCommand = backup.globalDiffCommand;
  }
  if (backup.diffToolCommands !== undefined) {
    nextBackup.diffToolCommands = backup.diffToolCommands;
  }

  await writeBackup(nextBackup);
}

async function rememberBackupIfNeeded(
  currentGlobalDiffCommand: string | null,
  currentDiffToolCommands: Record<string, string>,
  keysToRemember: string[],
  ourCommand: string,
): Promise<SvnDiffViewerBackup> {
  const backup = await readBackup();
  const normalizedOurCommand = normalizeCommand(ourCommand);
  let changed = false;

  if (
    backup.globalDiffCommand === undefined
    && normalizeCommand(currentGlobalDiffCommand) !== normalizedOurCommand
  ) {
    backup.globalDiffCommand = currentGlobalDiffCommand ?? null;
    changed = true;
  }

  if (!backup.diffToolCommands) backup.diffToolCommands = {};

  keysToRemember.forEach((rawKey) => {
    const key = normalizeKeyName(rawKey);
    if (backup.diffToolCommands![key] !== undefined) return;

    const currentValue = currentDiffToolCommands[key] ?? null;
    if (normalizeCommand(currentValue) === normalizedOurCommand) return;

    backup.diffToolCommands![key] = currentValue;
    changed = true;
  });

  if (changed) {
    await writeBackup(backup);
  }

  return backup;
}

function createWorkbookDiffCommandMap(
  currentDiffToolCommands: Record<string, string>,
): Record<string, string | null> {
  return Object.fromEntries(
    WORKBOOK_EXTENSIONS.map((extension) => [extension, currentDiffToolCommands[extension] ?? null]),
  );
}

async function getCurrentRegistryState() {
  const [rootValues, diffToolValues] = await Promise.all([
    readRegistryStringMap(TORTOISE_REG_PATH),
    readRegistryStringMap(TORTOISE_DIFF_TOOLS_REG_PATH),
  ]);

  return {
    globalDiffCommand: rootValues.diff ?? null,
    diffToolCommands: diffToolValues,
  };
}

function getAllFilesScopeKeys(currentDiffToolCommands: Record<string, string>) {
  return Array.from(new Set([
    ...Object.keys(currentDiffToolCommands).map(normalizeKeyName),
    ...WORKBOOK_EXTENSIONS,
  ]));
}

async function restoreOrDeleteRegistryValue(key: string, valueName: string, value: string | null | undefined) {
  if (!value) {
    await deleteRegistryValue(key, valueName);
    return;
  }
  await writeRegistryStringValue(key, valueName, value);
}

async function restoreOwnedDiffToolCommands(
  currentDiffToolCommands: Record<string, string>,
  backup: SvnDiffViewerBackup,
  ourCommand: string,
  predicate?: (key: string) => boolean,
) {
  const normalizedOurCommand = normalizeCommand(ourCommand);

  for (const key of Object.keys(currentDiffToolCommands)) {
    if (predicate && !predicate(key)) continue;
    if (normalizeCommand(currentDiffToolCommands[key]) !== normalizedOurCommand) continue;

    const previousValue = backup.diffToolCommands?.[normalizeKeyName(key)];
    await restoreOrDeleteRegistryValue(TORTOISE_DIFF_TOOLS_REG_PATH, key, previousValue);
  }
}

export async function getSvnDiffViewerStatus(): Promise<SvnDiffViewerStatus> {
  const reason = getAvailabilityReason();
  const command = buildDiffCommand();
  const registryState = await getCurrentRegistryState();

  return {
    available: reason === 'ready',
    reason,
    executablePath: getDiffLauncherPath(),
    command,
    currentMode: resolveSvnDiffViewerMode(command, registryState, WORKBOOK_EXTENSIONS) as SvnDiffViewerMode,
    canRestoreDefault: canRestoreSvnDefaultDiffViewer(command, registryState),
    globalDiffCommand: registryState.globalDiffCommand,
    workbookDiffCommands: createWorkbookDiffCommandMap(registryState.diffToolCommands),
    workbookExtensions: [...WORKBOOK_EXTENSIONS],
  };
}

export async function configureSvnDiffViewer(scope: SvnDiffViewerScope): Promise<SvnDiffViewerStatus> {
  const command = buildDiffCommand();
  if (!command) {
    return getSvnDiffViewerStatus();
  }

  const { globalDiffCommand, diffToolCommands } = await getCurrentRegistryState();
  const keysToRemember = getAllFilesScopeKeys(diffToolCommands);
  const backup = await rememberBackupIfNeeded(globalDiffCommand, diffToolCommands, keysToRemember, command);

  if (scope === 'all-files') {
    await writeRegistryStringValue(TORTOISE_REG_PATH, 'Diff', command);
    for (const key of keysToRemember) {
      await writeRegistryStringValue(TORTOISE_DIFF_TOOLS_REG_PATH, key, command);
    }
    return getSvnDiffViewerStatus();
  }

  const normalizedOurCommand = normalizeCommand(command);

  if (scope === 'text-only') {
    await writeRegistryStringValue(TORTOISE_REG_PATH, 'Diff', command);
    await restoreOwnedDiffToolCommands(diffToolCommands, backup, command);
    return getSvnDiffViewerStatus();
  }

  if (normalizeCommand(globalDiffCommand) === normalizedOurCommand) {
    await restoreOrDeleteRegistryValue(TORTOISE_REG_PATH, 'Diff', backup.globalDiffCommand);
  }

  for (const extension of WORKBOOK_EXTENSIONS) {
    await writeRegistryStringValue(TORTOISE_DIFF_TOOLS_REG_PATH, extension, command);
  }

  await restoreOwnedDiffToolCommands(diffToolCommands, backup, command, (key) => !isWorkbookKey(key));

  return getSvnDiffViewerStatus();
}

export async function restoreSvnDefaultDiffViewerConfiguration(): Promise<SvnDiffViewerStatus> {
  const command = buildDiffCommand();
  if (!command) {
    return getSvnDiffViewerStatus();
  }

  const registryState = await getCurrentRegistryState();
  const {
    ownsGlobalDiffCommand,
    ownedDiffToolKeys,
  } = getOwnedSvnDiffRegistryEntries(command, registryState);

  if (ownsGlobalDiffCommand) {
    await deleteRegistryValue(TORTOISE_REG_PATH, 'Diff');
  }

  for (const key of ownedDiffToolKeys) {
    await deleteRegistryValue(TORTOISE_DIFF_TOOLS_REG_PATH, key);
  }

  await clearBackupEntries({
    clearGlobal: ownsGlobalDiffCommand,
    keys: ownedDiffToolKeys,
  });

  return getSvnDiffViewerStatus();
}
