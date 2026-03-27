import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export type InstallerDiffViewerMode = 'keep' | 'excel-only' | 'all-files';

export interface InstallerBootstrapConfig {
  version: number;
  diffViewerMode: InstallerDiffViewerMode;
  cacheRoot: string;
}

export const INSTALLER_BOOTSTRAP_VERSION = 1;
export const INSTALLER_BOOTSTRAP_FILE_NAME = 'installer-bootstrap.properties';
export const INSTALLER_BOOTSTRAP_PREVIOUS_FILE_NAME = 'installer-bootstrap.previous.properties';
export const CACHE_CONTAINER_DIR_NAME = 'SvnDiffTool';
export const CACHE_LEAF_DIR_NAME = 'Cache';

function resolveLocalAppDataRoot(): string {
  const localAppData = process.env.LOCALAPPDATA?.trim();
  if (localAppData) return localAppData;
  return path.join(os.homedir(), 'AppData', 'Local');
}

export function getDefaultInstallerCacheRoot(): string {
  return path.join(resolveLocalAppDataRoot(), CACHE_CONTAINER_DIR_NAME, CACHE_LEAF_DIR_NAME);
}

export function getInstallerDirectory(execPath: string = process.execPath): string {
  return path.dirname(execPath);
}

export function getInstallerBootstrapPath(execPath: string = process.execPath): string {
  return path.join(getInstallerDirectory(execPath), INSTALLER_BOOTSTRAP_FILE_NAME);
}

export function getPreviousInstallerBootstrapPath(execPath: string = process.execPath): string {
  return path.join(getInstallerDirectory(execPath), INSTALLER_BOOTSTRAP_PREVIOUS_FILE_NAME);
}

export function isInstallerDiffViewerMode(value: string): value is InstallerDiffViewerMode {
  return value === 'keep' || value === 'excel-only' || value === 'all-files';
}

export function isControlledCacheRoot(cacheRoot: string): boolean {
  const normalized = path.resolve(cacheRoot);
  return path.basename(normalized).toLowerCase() === CACHE_LEAF_DIR_NAME.toLowerCase()
    && path.basename(path.dirname(normalized)).toLowerCase() === CACHE_CONTAINER_DIR_NAME.toLowerCase();
}

function normalizeCacheRoot(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return getDefaultInstallerCacheRoot();
  return path.resolve(trimmed);
}

export function normalizeInstallerBootstrapConfig(
  value: Partial<InstallerBootstrapConfig> | null | undefined,
): InstallerBootstrapConfig {
  const rawDiffViewerMode = value?.diffViewerMode ?? '';
  const diffViewerMode: InstallerDiffViewerMode = isInstallerDiffViewerMode(rawDiffViewerMode)
    ? rawDiffViewerMode
    : 'keep';

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
        if (isInstallerDiffViewerMode(value)) {
          parsed.diffViewerMode = value;
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

export function toInstallerBootstrapContent(config: InstallerBootstrapConfig): string {
  return [
    `version=${INSTALLER_BOOTSTRAP_VERSION}`,
    `diffViewerMode=${config.diffViewerMode}`,
    `cacheRoot=${normalizeCacheRoot(config.cacheRoot)}`,
    '',
  ].join('\n');
}
