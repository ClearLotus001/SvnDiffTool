import type { Theme, WorkbookRowDeltaTone } from '@/types';
import { resolveLineNumberColor, type LineNumberTone } from '@/utils/diff/lineNumberTone';

type WorkbookRowSideAccent = 'base' | 'mine' | null;
export type WorkbookRowSemanticTone = WorkbookRowDeltaTone | 'neutral';

function normalizeWorkbookRowTone(tone: WorkbookRowSemanticTone): WorkbookRowDeltaTone {
  return tone === 'neutral' ? 'equal' : tone;
}

function getWorkbookSideAccent(theme: Theme, sideAccent: Exclude<WorkbookRowSideAccent, null>): string {
  return sideAccent === 'base' ? theme.acc2 : theme.acc;
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
  theme: Theme;
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
  if (isSearchMatch) return `${theme.searchHl}28`;
  return theme.bg0;
}

export function resolveWorkbookRowSelectionAccent(
  theme: Theme,
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
  theme: Theme,
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
  theme: Theme;
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
  theme: Theme,
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
  theme: Theme,
  tone: WorkbookRowSemanticTone,
  sideAccent: WorkbookRowSideAccent = null,
): string {
  if (!sideAccent) return resolveWorkbookRowBorderColor(theme, tone, sideAccent);
  return `${getWorkbookSideAccent(theme, sideAccent)}66`;
}

export function resolveWorkbookRowLineNumberColor(params: {
  theme: Theme;
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
  return resolveLineNumberColor(theme, fallbackTone, active);
}

export function resolveWorkbookMiniMapColor(
  theme: Theme,
  tone: WorkbookRowSemanticTone,
): string {
  const semanticTone = normalizeWorkbookRowTone(tone);
  if (semanticTone === 'add') return theme.miniAdd;
  if (semanticTone === 'delete') return theme.miniDel;
  if (semanticTone === 'mixed') return theme.chgTx;
  return theme.bg3;
}

export function resolveWorkbookOverlayPalette(
  theme: Theme,
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
