import type { SvnRevisionInfo } from '@/types';

const TRAILING_PAREN_VERSION = /\s*\(([^)]+)\)\s*$/;
const KEYWORD_VERSION = /\b(?:r|rev|revision|ver|version|v)\s*[:#-]?\s*([0-9][\w.-]*)\b/i;
const TRAILING_SIDE_LABEL = /\s*[:：-]\s*(working copy|working base|current|base|mine|head)\s*$/i;
const TRAILING_REVISION_LABEL = /\s*[:：-]\s*(r[0-9][\w.-]*)\s*$/i;

function normalizeSideLabel(label: string): string {
  const lower = label.trim().toLowerCase();
  if (lower === 'working copy') return 'Working Copy';
  if (lower === 'working base') return 'Working Base';
  if (lower === 'current') return 'Current';
  if (lower === 'base') return 'Base';
  if (lower === 'mine') return 'Mine';
  if (lower === 'head') return 'HEAD';
  return label.trim();
}

export function extractVersionLabel(name: string): string {
  const normalized = name.trim();
  if (!normalized) return '';

  const parenMatch = normalized.match(TRAILING_PAREN_VERSION);
  if (parenMatch?.[1]) return parenMatch[1].trim();

  const keywordMatch = normalized.match(KEYWORD_VERSION);
  if (keywordMatch) return keywordMatch[0].trim();

  const revisionMatch = normalized.match(TRAILING_REVISION_LABEL);
  if (revisionMatch?.[1]) return revisionMatch[1].trim();

  const sideMatch = normalized.match(TRAILING_SIDE_LABEL);
  if (sideMatch?.[1]) return normalizeSideLabel(sideMatch[1]);

  return '';
}

export function extractDisplayName(name: string): string {
  const normalized = name.trim();
  if (!normalized) return '';
  return normalized
    .replace(TRAILING_PAREN_VERSION, '')
    .replace(TRAILING_REVISION_LABEL, '')
    .replace(TRAILING_SIDE_LABEL, '')
    .trim();
}

export function resolveDisplayFileName(fileName: string, ...candidates: string[]): string {
  const explicitName = fileName.trim();
  if (explicitName) return explicitName;

  return candidates
    .map(extractDisplayName)
    .find(Boolean) ?? '';
}

export function resolveVersionLabel(
  name: string,
  revisionInfo?: Pick<SvnRevisionInfo, 'revision'> | null,
  fallback = '',
): string {
  return revisionInfo?.revision?.trim() || extractVersionLabel(name) || fallback;
}

export interface TwoFileVersionLabels {
  base: string;
  mine: string;
}

function splitFilePath(value: string): string[] {
  return value
    .trim()
    .replaceAll('\\', '/')
    .split('/')
    .filter(Boolean);
}

function samePathSegment(left: string, right: string): boolean {
  return left.toLocaleLowerCase('en-US') === right.toLocaleLowerCase('en-US');
}

function formatUniqueDirectory(segments: string[]): string {
  if (segments.length <= 2) return segments.join(' / ');
  return `${segments[0]} / … / ${segments[segments.length - 1]}`;
}

export function resolveTwoFileVersionLabels(
  basePath: string,
  minePath: string,
): TwoFileVersionLabels {
  const baseSegments = splitFilePath(basePath);
  const mineSegments = splitFilePath(minePath);
  const baseFileName = baseSegments.at(-1) || basePath.trim();
  const mineFileName = mineSegments.at(-1) || minePath.trim();

  if (!samePathSegment(baseFileName, mineFileName)) {
    return {
      base: baseFileName,
      mine: mineFileName,
    };
  }

  const baseDirectories = baseSegments.slice(0, -1);
  const mineDirectories = mineSegments.slice(0, -1);
  let commonPrefixLength = 0;
  while (
    commonPrefixLength < baseDirectories.length
    && commonPrefixLength < mineDirectories.length
    && samePathSegment(
      baseDirectories[commonPrefixLength]!,
      mineDirectories[commonPrefixLength]!,
    )
  ) {
    commonPrefixLength += 1;
  }

  let commonSuffixLength = 0;
  while (
    commonSuffixLength < baseDirectories.length - commonPrefixLength
    && commonSuffixLength < mineDirectories.length - commonPrefixLength
    && samePathSegment(
      baseDirectories[baseDirectories.length - commonSuffixLength - 1]!,
      mineDirectories[mineDirectories.length - commonSuffixLength - 1]!,
    )
  ) {
    commonSuffixLength += 1;
  }

  const baseUniqueEnd = baseDirectories.length - commonSuffixLength;
  const mineUniqueEnd = mineDirectories.length - commonSuffixLength;
  const baseUniqueDirectories = baseDirectories.slice(commonPrefixLength, baseUniqueEnd);
  const mineUniqueDirectories = mineDirectories.slice(commonPrefixLength, mineUniqueEnd);
  const sharedParent = commonPrefixLength > 0
    ? baseDirectories[commonPrefixLength - 1] ?? ''
    : '';
  const baseDirectoryLabel = formatUniqueDirectory(
    baseUniqueDirectories.length > 0 ? baseUniqueDirectories : [sharedParent].filter(Boolean),
  );
  const mineDirectoryLabel = formatUniqueDirectory(
    mineUniqueDirectories.length > 0 ? mineUniqueDirectories : [sharedParent].filter(Boolean),
  );

  const baseLabel = baseDirectoryLabel ? `${baseDirectoryLabel} · ${baseFileName}` : `01 · ${baseFileName}`;
  const mineLabel = mineDirectoryLabel ? `${mineDirectoryLabel} · ${mineFileName}` : `02 · ${mineFileName}`;
  if (!samePathSegment(baseLabel, mineLabel)) {
    return {
      base: baseLabel,
      mine: mineLabel,
    };
  }

  return {
    base: `01 · ${baseFileName}`,
    mine: `02 · ${mineFileName}`,
  };
}
