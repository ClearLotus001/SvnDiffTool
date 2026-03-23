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
