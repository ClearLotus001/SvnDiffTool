import * as path from 'node:path';

export interface CliArgs {
  basePath: string;
  minePath: string;
  baseName: string;
  mineName: string;
  baseUrl: string;
  mineUrl: string;
  baseRevision: string;
  mineRevision: string;
  pegRevision: string;
  fileName: string;
}

export const EMPTY_CLI_ARGS: CliArgs = {
  basePath: '',
  minePath: '',
  baseName: 'Base',
  mineName: 'Mine',
  baseUrl: '',
  mineUrl: '',
  baseRevision: '',
  mineRevision: '',
  pegRevision: '',
  fileName: '',
};

const SCRIPT_SUFFIXES = ['.js', '.cjs', '.mjs', '.asar'];

function normalizeComparablePath(value: string): string {
  return path.normalize(value).toLowerCase();
}

function isExecPathToken(value: string, execPath: string): boolean {
  const candidate = value.trim();
  const runtimePath = execPath.trim();
  if (!candidate || !runtimePath) return false;
  return normalizeComparablePath(candidate) === normalizeComparablePath(runtimePath);
}

function isAppEntryToken(value: string): boolean {
  const candidate = value.trim().toLowerCase();
  if (!candidate) return false;
  if (candidate === '.') return true;
  return SCRIPT_SUFFIXES.some((suffix) => candidate.endsWith(suffix));
}

function stripLaunchTokens(argv: string[], execPath: string): string[] {
  const positional = [...argv];

  if (positional[0] && isExecPathToken(positional[0], execPath)) {
    positional.shift();
  }

  if (positional[0] && isAppEntryToken(positional[0])) {
    positional.shift();
  }

  return positional.filter((value) => !value.startsWith('--'));
}

function normalizeCliToken(value: string | undefined): string {
  const normalized = value?.trim() ?? '';
  if (!normalized) return '';
  if (normalized.toUpperCase() === 'UNSPECIFIED') return '';
  return normalized;
}

function looksLikeUrlOrPath(value: string): boolean {
  const normalized = value.trim();
  if (!normalized) return false;
  return normalized.includes(':') || normalized.includes('\\') || normalized.includes('/');
}

function looksLikeRemoteRepositoryUrl(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  return normalized.startsWith('http://')
    || normalized.startsWith('https://')
    || normalized.startsWith('svn://')
    || normalized.startsWith('svn+ssh://')
    || normalized.startsWith('file://');
}

export function parseCliArgsFromArgv(argv: string[], execPath: string): CliArgs | null {
  const positional = stripLaunchTokens(argv, execPath);
  if (positional.length === 0) return null;

  const basePath = normalizeCliToken(positional[0]);
  const minePath = normalizeCliToken(positional[1]);
  if (!basePath && !minePath) return null;

  const baseName = normalizeCliToken(positional[2]) || EMPTY_CLI_ARGS.baseName;
  const mineName = normalizeCliToken(positional[3]) || EMPTY_CLI_ARGS.mineName;

  if (positional.length >= 10) {
    return {
      basePath,
      minePath,
      baseName,
      mineName,
      baseUrl: normalizeCliToken(positional[4]),
      mineUrl: normalizeCliToken(positional[5]),
      baseRevision: normalizeCliToken(positional[6]),
      mineRevision: normalizeCliToken(positional[7]),
      pegRevision: normalizeCliToken(positional[8]),
      fileName: normalizeCliToken(positional[9]),
    };
  }

  const tail = positional.slice(4).map(value => normalizeCliToken(value));
  const urlLikeValues = tail.filter(looksLikeUrlOrPath);
  const revisionLikeValues = tail.filter(value => !looksLikeUrlOrPath(value));

  if (tail.length === 0) {
    return {
      basePath,
      minePath,
      baseName,
      mineName,
      baseUrl: '',
      mineUrl: '',
      baseRevision: '',
      mineRevision: '',
      pegRevision: '',
      fileName: '',
    };
  }

  const rawTail = positional.slice(4);
  const allSparsePlaceholders = rawTail.every((value) => {
    const normalized = value?.trim() ?? '';
    return !normalized || normalized.toUpperCase() === 'UNSPECIFIED';
  });

  if (tail.length <= 4 && allSparsePlaceholders) {
    return {
      basePath,
      minePath,
      baseName,
      mineName,
      baseUrl: urlLikeValues[0] ?? '',
      mineUrl: urlLikeValues[1] ?? '',
      baseRevision: revisionLikeValues[0] ?? '',
      mineRevision: revisionLikeValues[1] ?? '',
      pegRevision: revisionLikeValues[2] ?? '',
      fileName: '',
    };
  }

  if (positional.length <= 6) {
    const candidate5 = normalizeCliToken(positional[4]);
    const candidate6 = normalizeCliToken(positional[5]);
    const mineUrl = looksLikeRemoteRepositoryUrl(candidate5) ? candidate5 : '';
    const fileName = candidate6 || (!mineUrl ? candidate5 : '') || path.basename(minePath || basePath);

    return {
      basePath,
      minePath,
      baseName,
      mineName,
      baseUrl: '',
      mineUrl,
      baseRevision: '',
      mineRevision: '',
      pegRevision: '',
      fileName,
    };
  }

  return null;
}
