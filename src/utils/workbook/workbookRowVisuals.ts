import type { WorkbookRowDeltaTone } from '@/types';
import type { ThemeTokens } from '@/theme/tokens';
import type { LineNumberTone } from '@/utils/diff/lineNumberTone';
import {
  resolveDiffMiniMapPaint,
} from '@/utils/diff/minimapColors';

type WorkbookRowSideAccent = 'base' | 'mine' | null;
export type WorkbookRowSemanticTone = WorkbookRowDeltaTone | 'neutral';
export type WorkbookMiniMapSemanticTone = WorkbookRowSemanticTone | 'modify' | 'strict-only';

export interface WorkbookMiniMapPaint {
  kind: 'solid' | 'gradient';
  color?: string;
  stops?: Array<{ offset: number; color: string }>;
}

function normalizeWorkbookRowTone(tone: WorkbookRowSemanticTone): WorkbookRowDeltaTone {
  return tone === 'neutral' ? 'equal' : tone;
}

function getWorkbookSideAccent(theme: ThemeTokens, sideAccent: Exclude<WorkbookRowSideAccent, null>): string {
  return sideAccent === 'base' ? theme.acc2 : theme.acc;
}

function withHexAlpha(color: string, hexAlpha: string): string {
  return color.startsWith('#') && color.length === 7 ? `${color}${hexAlpha}` : color;
}

export function mergeWorkbookSemanticTone(
  left: WorkbookRowSemanticTone | undefined,
  right: WorkbookRowSemanticTone | undefined,
): WorkbookRowSemanticTone | undefined {
  if (!left) return right;
  if (!right) return left;
  const normalizedLeft = normalizeWorkbookRowTone(left);
  const normalizedRight = normalizeWorkbookRowTone(right);
  if (normalizedLeft === normalizedRight) return normalizedLeft;
  if (normalizedLeft === 'equal') return normalizedRight;
  if (normalizedRight === 'equal') return normalizedLeft;
  return 'mixed';
}

export function resolveWorkbookRegionTone(
  hasBaseSide: boolean,
  hasMineSide: boolean,
): WorkbookRowDeltaTone {
  if (hasBaseSide && hasMineSide) return 'mixed';
  if (hasMineSide) return 'add';
  if (hasBaseSide) return 'delete';
  return 'equal';
}

export function resolveWorkbookRowSurfaceBackground(params: {
  theme: ThemeTokens;
  isGuided: boolean;
  isActiveSearch: boolean;
  isSearchMatch: boolean;
}): string {
  const {
    theme,
    isGuided,
    isActiveSearch,
    isSearchMatch,
  } = params;

  if (isGuided) return `${theme.acc2}08`;
  if (isActiveSearch) return theme.searchActiveBg;
  if (isSearchMatch) return `${theme.searchHl}24`;
  return theme.bg0;
}

export function resolveWorkbookRowSelectionAccent(
  theme: ThemeTokens,
  side: 'base' | 'mine',
): string {
  return side === 'base' ? theme.acc2 : theme.acc;
}

export interface WorkbookAccentSurfaceVisual {
  background: string;
  border: string;
  textColor: string;
}

export function resolveWorkbookAccentSurfaceVisual(
  accent: string,
  variant: 'badge' | 'button' = 'badge',
): WorkbookAccentSurfaceVisual {
  if (variant === 'button') {
    return {
      background: `${accent}16`,
      border: `${accent}55`,
      textColor: accent,
    };
  }

  return {
    background: `${accent}18`,
    border: 'transparent',
    textColor: accent,
  };
}

export function resolveWorkbookAuxBarPalette(
  theme: ThemeTokens,
  tone: WorkbookRowSemanticTone = 'mixed',
): {
  background: string;
  border: string;
  accent: string;
  buttonBorder: string;
  buttonText: string;
  labelText: string;
  subduedText: string;
} {
  const semanticTone = normalizeWorkbookRowTone(tone);
  if (semanticTone === 'add') {
    return {
      background: `linear-gradient(180deg, ${theme.bg2} 0%, ${theme.bg1} 100%)`,
      border: `${theme.addBrd}66`,
      accent: theme.addBrd,
      buttonBorder: `${theme.addBrd}55`,
      buttonText: theme.addTx,
      labelText: theme.addTx,
      subduedText: theme.t2,
    };
  }
  if (semanticTone === 'delete') {
    return {
      background: `linear-gradient(180deg, ${theme.bg2} 0%, ${theme.bg1} 100%)`,
      border: `${theme.delBrd}66`,
      accent: theme.delBrd,
      buttonBorder: `${theme.delBrd}55`,
      buttonText: theme.delTx,
      labelText: theme.delTx,
      subduedText: theme.t2,
    };
  }
  if (semanticTone === 'mixed') {
    return {
      background: `linear-gradient(180deg, ${theme.bg2} 0%, ${theme.bg1} 100%)`,
      border: `${theme.chgTx}66`,
      accent: theme.chgTx,
      buttonBorder: `${theme.chgTx}55`,
      buttonText: theme.chgTx,
      labelText: theme.chgTx,
      subduedText: theme.t2,
    };
  }
  return {
    background: `linear-gradient(180deg, ${theme.bg2} 0%, ${theme.bg1} 100%)`,
    border: `${theme.border}66`,
    accent: theme.acc2,
    buttonBorder: `${theme.border}88`,
    buttonText: theme.t1,
    labelText: theme.t1,
    subduedText: theme.t2,
  };
}

export function resolveWorkbookRowGutterBackground(params: {
  theme: ThemeTokens;
  selectionAccent: string;
  isSelected: boolean;
}): string {
  const {
    theme,
    selectionAccent,
    isSelected,
  } = params;
  return isSelected ? `${selectionAccent}26` : theme.lnBg;
}

export function resolveWorkbookRowBorderColor(
  theme: ThemeTokens,
  tone: WorkbookRowSemanticTone,
  sideAccent: WorkbookRowSideAccent = null,
): string {
  const semanticTone = normalizeWorkbookRowTone(tone);
  if (sideAccent) return getWorkbookSideAccent(theme, sideAccent);
  if (semanticTone === 'add') return theme.addBrd;
  if (semanticTone === 'delete') return theme.delBrd;
  if (semanticTone === 'mixed') return theme.chgTx;
  return theme.border2;
}

export function resolveWorkbookRowRuleColor(
  theme: ThemeTokens,
  tone: WorkbookRowSemanticTone,
  sideAccent: WorkbookRowSideAccent = null,
): string {
  if (!sideAccent) return resolveWorkbookRowBorderColor(theme, tone, sideAccent);
  return `${getWorkbookSideAccent(theme, sideAccent)}66`;
}

export function resolveWorkbookRowLineNumberColor(params: {
  theme: ThemeTokens;
  tone: WorkbookRowSemanticTone;
  fallbackTone: LineNumberTone;
  active?: boolean;
}): string {
  const {
    theme,
    tone,
    fallbackTone,
    active = false,
  } = params;
  const semanticTone = normalizeWorkbookRowTone(tone);

  if (semanticTone === 'add') return theme.addTx;
  if (semanticTone === 'delete') return theme.delTx;
  if (semanticTone === 'mixed') return theme.chgTx;
  if (fallbackTone === 'base') return active ? theme.acc2 : withHexAlpha(theme.acc2, 'bf');
  if (fallbackTone === 'mine') return active ? theme.acc : withHexAlpha(theme.acc, 'bf');
  return active ? theme.acc2 : theme.lnTx;
}

export function resolveWorkbookMiniMapPaint(
  theme: ThemeTokens,
  tone: WorkbookMiniMapSemanticTone,
): WorkbookMiniMapPaint {
  if (tone === 'strict-only') {
    return {
      kind: 'solid',
      color: theme.acc2,
    };
  }

  if (tone === 'modify') {
    return resolveDiffMiniMapPaint(theme, 'modify');
  }

  const semanticTone = normalizeWorkbookRowTone(tone);
  if (semanticTone === 'mixed') {
    return resolveDiffMiniMapPaint(theme, 'modify');
  }

  if (semanticTone !== 'equal') {
    return resolveDiffMiniMapPaint(theme, semanticTone);
  }

  return {
    kind: 'solid',
    color: theme.bg2,
  };
}

export function resolveWorkbookMiniMapColor(
  theme: ThemeTokens,
  tone: WorkbookMiniMapSemanticTone,
): string {
  const paint = resolveWorkbookMiniMapPaint(theme, tone);
  if (paint.kind === 'solid') return paint.color ?? theme.bg2;
  return paint.stops?.[1]?.color ?? resolveDiffMiniMapPaint(theme, 'modify').color ?? theme.chgTx;
}

export function resolveWorkbookOverlayPalette(
  theme: ThemeTokens,
  tone: WorkbookRowSemanticTone,
): {
  left: string;
  right: string;
  mid: string;
  continuation: string;
  shine: string;
} {
  const semanticTone = normalizeWorkbookRowTone(tone);
  if (semanticTone === 'add') {
    return {
      left: theme.addBrd,
      right: theme.addBrd,
      mid: theme.addTx,
      continuation: `${theme.addBrd}38`,
      shine: `${theme.addTx}44`,
    };
  }
  if (semanticTone === 'delete') {
    return {
      left: theme.delBrd,
      right: theme.delBrd,
      mid: theme.delTx,
      continuation: `${theme.delBrd}38`,
      shine: `${theme.delTx}44`,
    };
  }
  if (semanticTone === 'mixed') {
    return {
      left: theme.acc2,
      right: theme.acc,
      mid: theme.chgTx,
      continuation: `${theme.chgTx}38`,
      shine: `${theme.chgTx}44`,
    };
  }
  return {
    left: theme.border2,
    right: theme.border2,
    mid: theme.t1,
    continuation: `${theme.border2}28`,
    shine: `${theme.t1}2e`,
  };
}
