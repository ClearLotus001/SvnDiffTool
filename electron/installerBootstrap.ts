import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export type InstallerDiffViewerMode = 'keep' | 'workbook-only' | 'text-only' | 'all-files';

export interface InstallerBootstrapConfig {
  version: number;
  diffViewerMode: InstallerDiffViewerMode;
  cacheRoot: string;
}

const INSTALLER_BOOTSTRAP_VERSION = 1;
const INSTALLER_BOOTSTRAP_FILE_NAME = 'installer-bootstrap.properties';
const INSTALLER_BOOTSTRAP_PREVIOUS_FILE_NAME = 'installer-bootstrap.previous.properties';
const INSTALLER_MAINTENANCE_PENDING_FILE_NAME = 'installer-maintenance.pending';
export const CACHE_CONTAINER_DIR_NAME = 'Versora';
const LEGACY_CACHE_CONTAINER_DIR_NAME = 'SvnDiffTool';
export const CACHE_LEAF_DIR_NAME = 'Cache';

function resolveLocalAppDataRoot(): string {
  const localAppData = process.env.LOCALAPPDATA?.trim();
  if (localAppData) return localAppData;
  return path.join(os.homedir(), 'AppData', 'Local');
}

export function getDefaultInstallerCacheRoot(): string {
  return path.join(resolveLocalAppDataRoot(), CACHE_CONTAINER_DIR_NAME, CACHE_LEAF_DIR_NAME);
}

function getInstallerDirectory(execPath: string = process.execPath): string {
  return path.dirname(execPath);
}

export function getInstallerBootstrapPath(execPath: string = process.execPath): string {
  return path.join(getInstallerDirectory(execPath), INSTALLER_BOOTSTRAP_FILE_NAME);
}

export function getPreviousInstallerBootstrapPath(execPath: string = process.execPath): string {
  return path.join(getInstallerDirectory(execPath), INSTALLER_BOOTSTRAP_PREVIOUS_FILE_NAME);
}

export function getInstallerMaintenancePendingPath(execPath: string = process.execPath): string {
  return path.join(getInstallerDirectory(execPath), INSTALLER_MAINTENANCE_PENDING_FILE_NAME);
}

function normalizeInstallerDiffViewerMode(value: string | null | undefined): InstallerDiffViewerMode | null {
  switch (value) {
    case 'workbook-only':
      return 'workbook-only';
    case 'keep':
    case 'text-only':
    case 'all-files':
      return value;
    default:
      return null;
  }
}

export function isControlledCacheRoot(cacheRoot: string): boolean {
  const normalized = path.resolve(cacheRoot);
  const containerName = path.basename(path.dirname(normalized)).toLowerCase();
  return path.basename(normalized).toLowerCase() === CACHE_LEAF_DIR_NAME.toLowerCase()
    && (
      containerName === CACHE_CONTAINER_DIR_NAME.toLowerCase()
      || containerName === LEGACY_CACHE_CONTAINER_DIR_NAME.toLowerCase()
    );
}

function normalizeCacheRoot(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return getDefaultInstallerCacheRoot();
  return path.resolve(trimmed);
}

export function normalizeInstallerBootstrapConfig(
  value: Partial<InstallerBootstrapConfig> | null | undefined,
): InstallerBootstrapConfig {
  const diffViewerMode = normalizeInstallerDiffViewerMode(value?.diffViewerMode) ?? 'keep';

  return {
    version: Number.isFinite(value?.version) ? Number(value?.version) : INSTALLER_BOOTSTRAP_VERSION,
    diffViewerMode,
    cacheRoot: normalizeCacheRoot(value?.cacheRoot),
  };
}

function parseBootstrapContent(raw: string): Partial<InstallerBootstrapConfig> {
  const parsed: Partial<InstallerBootstrapConfig> = {};

  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) return;

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) return;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();

    switch (key) {
      case 'version':
        parsed.version = Number(value);
        break;
      case 'diffViewerMode':
        {
          const normalizedMode = normalizeInstallerDiffViewerMode(value);
          if (normalizedMode) {
            parsed.diffViewerMode = normalizedMode;
          }
        }
        break;
      case 'cacheRoot':
        parsed.cacheRoot = value;
        break;
      default:
        break;
    }
  });

  return parsed;
}

function readBootstrapFileSync(filePath: string): InstallerBootstrapConfig | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return normalizeInstallerBootstrapConfig(parseBootstrapContent(raw));
  } catch {
    return null;
  }
}

export function readInstallerBootstrapSync(execPath: string = process.execPath): InstallerBootstrapConfig | null {
  return readBootstrapFileSync(getInstallerBootstrapPath(execPath));
}

export function readPreviousInstallerBootstrapSync(execPath: string = process.execPath): InstallerBootstrapConfig | null {
  return readBootstrapFileSync(getPreviousInstallerBootstrapPath(execPath));
}

export function hasInstallerMaintenancePendingSync(execPath: string = process.execPath): boolean {
  return fs.existsSync(getInstallerMaintenancePendingPath(execPath));
}

export function clearInstallerMaintenancePendingSync(execPath: string = process.execPath) {
  try {
    fs.rmSync(getInstallerMaintenancePendingPath(execPath), { force: true });
  } catch {
    // Ignore best-effort cleanup failures.
  }
}

export function toInstallerBootstrapContent(config: InstallerBootstrapConfig): string {
  return [
    `version=${INSTALLER_BOOTSTRAP_VERSION}`,
    `diffViewerMode=${config.diffViewerMode}`,
    `cacheRoot=${normalizeCacheRoot(config.cacheRoot)}`,
    '',
  ].join('\n');
}

async function writeInstallerBootstrapConfig(
  config: InstallerBootstrapConfig,
  execPath: string = process.execPath,
) {
  const bootstrapPath = getInstallerBootstrapPath(execPath);
  await fs.promises.mkdir(path.dirname(bootstrapPath), { recursive: true });
  await fs.promises.writeFile(bootstrapPath, toInstallerBootstrapContent(config), 'utf-8');
}

export async function updateInstallerBootstrapDiffViewerMode(
  diffViewerMode: InstallerDiffViewerMode,
  execPath: string = process.execPath,
) {
  const currentConfig = readInstallerBootstrapSync(execPath)
    ?? normalizeInstallerBootstrapConfig({
      diffViewerMode,
      cacheRoot: getDefaultInstallerCacheRoot(),
    });

  await writeInstallerBootstrapConfig({
    ...currentConfig,
    diffViewerMode,
  }, execPath);
}
