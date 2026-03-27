import { app } from 'electron';
import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { promisify } from 'node:util';

export type SvnDiffViewerScope = 'all-files' | 'excel-only';
export type SvnDiffViewerMode = SvnDiffViewerScope | 'mixed' | 'unconfigured' | 'unsupported';
export type SvnDiffViewerAvailabilityReason = 'ready' | 'windows-only' | 'packaged-only';

export interface SvnDiffViewerStatus {
  available: boolean;
  reason: SvnDiffViewerAvailabilityReason;
  executablePath: string | null;
  command: string | null;
  currentMode: SvnDiffViewerMode;
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

function getBackupFilePath() {
  return path.join(app.getPath('userData'), 'svn-diff-viewer-backup.json');
}

function normalizeKeyName(value: string) {
  return value.trim().toLowerCase();
}

function normalizeCommand(value: string | null | undefined) {
  return (value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function isWorkbookKey(value: string) {
  return WORKBOOK_EXTENSION_SET.has(normalizeKeyName(value));
}

function getAvailabilityReason(): SvnDiffViewerAvailabilityReason {
  if (process.platform !== 'win32') return 'windows-only';
  if (!app.isPackaged) return 'packaged-only';
  return 'ready';
}

function buildDiffCommand(): string | null {
  if (getAvailabilityReason() !== 'ready') return null;
  return `"${process.execPath}" ${DIFF_COMMAND_ARGUMENTS.join(' ')}`;
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

function resolveCurrentMode(
  ourCommand: string | null,
  globalDiffCommand: string | null,
  currentDiffToolCommands: Record<string, string>,
): SvnDiffViewerMode {
  if (!ourCommand) return 'unsupported';

  const normalizedOurCommand = normalizeCommand(ourCommand);
  const globalIsOurs = normalizeCommand(globalDiffCommand) === normalizedOurCommand;
  const workbookExplicitConflicts = WORKBOOK_EXTENSIONS.some((extension) => {
    const currentValue = currentDiffToolCommands[extension];
    return currentValue != null && normalizeCommand(currentValue) !== normalizedOurCommand;
  });
  const workbookAllExplicitlyOurs = WORKBOOK_EXTENSIONS.every((extension) => (
    normalizeCommand(currentDiffToolCommands[extension] ?? null) === normalizedOurCommand
  ));
  const nonWorkbookKeys = Object.keys(currentDiffToolCommands).filter((key) => !isWorkbookKey(key));
  const nonWorkbookOwnKeys = nonWorkbookKeys.filter((key) => (
    normalizeCommand(currentDiffToolCommands[key]) === normalizedOurCommand
  ));
  const nonWorkbookConflicts = nonWorkbookKeys.filter((key) => (
    normalizeCommand(currentDiffToolCommands[key]) !== normalizedOurCommand
  ));

  if (globalIsOurs && !workbookExplicitConflicts && nonWorkbookConflicts.length === 0) {
    return 'all-files';
  }

  if (!globalIsOurs && workbookAllExplicitlyOurs && nonWorkbookOwnKeys.length === 0) {
    return 'excel-only';
  }

  if (!globalIsOurs && !workbookAllExplicitlyOurs && nonWorkbookOwnKeys.length === 0) {
    return 'unconfigured';
  }

  return 'mixed';
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

export async function getSvnDiffViewerStatus(): Promise<SvnDiffViewerStatus> {
  const reason = getAvailabilityReason();
  const command = buildDiffCommand();
  const { globalDiffCommand, diffToolCommands } = await getCurrentRegistryState();

  return {
    available: reason === 'ready',
    reason,
    executablePath: process.execPath || null,
    command,
    currentMode: resolveCurrentMode(command, globalDiffCommand, diffToolCommands),
    globalDiffCommand,
    workbookDiffCommands: createWorkbookDiffCommandMap(diffToolCommands),
    workbookExtensions: [...WORKBOOK_EXTENSIONS],
  };
}

export async function configureSvnDiffViewer(scope: SvnDiffViewerScope): Promise<SvnDiffViewerStatus> {
  const command = buildDiffCommand();
  if (!command) {
    return getSvnDiffViewerStatus();
  }

  const { globalDiffCommand, diffToolCommands } = await getCurrentRegistryState();

  if (scope === 'all-files') {
    const keysToRemember = getAllFilesScopeKeys(diffToolCommands);
    await rememberBackupIfNeeded(globalDiffCommand, diffToolCommands, keysToRemember, command);
    await writeRegistryStringValue(TORTOISE_REG_PATH, 'Diff', command);
    for (const key of keysToRemember) {
      await writeRegistryStringValue(TORTOISE_DIFF_TOOLS_REG_PATH, key, command);
    }
    return getSvnDiffViewerStatus();
  }

  const backup = await rememberBackupIfNeeded(globalDiffCommand, diffToolCommands, [...WORKBOOK_EXTENSIONS], command);
  const normalizedOurCommand = normalizeCommand(command);

  if (normalizeCommand(globalDiffCommand) === normalizedOurCommand) {
    await restoreOrDeleteRegistryValue(TORTOISE_REG_PATH, 'Diff', backup.globalDiffCommand);
  }

  for (const extension of WORKBOOK_EXTENSIONS) {
    await writeRegistryStringValue(TORTOISE_DIFF_TOOLS_REG_PATH, extension, command);
  }

  for (const key of Object.keys(diffToolCommands)) {
    if (isWorkbookKey(key)) continue;
    if (normalizeCommand(diffToolCommands[key]) !== normalizedOurCommand) continue;

    const previousValue = backup.diffToolCommands?.[key];
    await restoreOrDeleteRegistryValue(TORTOISE_DIFF_TOOLS_REG_PATH, key, previousValue);
  }

  return getSvnDiffViewerStatus();
}

export async function restoreSvnDiffViewerConfiguration(): Promise<SvnDiffViewerStatus> {
  const command = buildDiffCommand();
  if (!command) {
    return getSvnDiffViewerStatus();
  }

  const backup = await readBackup();
  const { globalDiffCommand, diffToolCommands } = await getCurrentRegistryState();
  const normalizedOurCommand = normalizeCommand(command);

  if (normalizeCommand(globalDiffCommand) === normalizedOurCommand) {
    await restoreOrDeleteRegistryValue(TORTOISE_REG_PATH, 'Diff', backup.globalDiffCommand);
  }

  const keysToRestore = new Set<string>([
    ...Object.keys(diffToolCommands),
    ...Object.keys(backup.diffToolCommands ?? {}),
  ]);

  for (const rawKey of keysToRestore) {
    const key = normalizeKeyName(rawKey);
    const currentValue = diffToolCommands[key] ?? null;
    const backupValue = backup.diffToolCommands?.[key];

    if (normalizeCommand(currentValue) !== normalizedOurCommand && backupValue === undefined) {
      continue;
    }
    if (normalizeCommand(currentValue) !== normalizedOurCommand) {
      continue;
    }

    await restoreOrDeleteRegistryValue(TORTOISE_DIFF_TOOLS_REG_PATH, key, backupValue);
  }

  return getSvnDiffViewerStatus();
}
