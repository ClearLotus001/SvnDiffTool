import type { WorkbookRowDeltaTone } from '@/types';
import type { ThemeTokens } from '@/theme/tokens';
import type { LineNumberTone } from '@/utils/diff/lineNumberTone';

type WorkbookRowSideAccent = 'base' | 'mine' | null;
export type WorkbookRowSemanticTone = WorkbookRowDeltaTone | 'neutral';

interface ParsedColor {
  red: number;
  green: number;
  blue: number;
  alpha: number;
}

function normalizeWorkbookRowTone(tone: WorkbookRowSemanticTone): WorkbookRowDeltaTone {
  return tone === 'neutral' ? 'equal' : tone;
}

function parseHexColor(color: string): ParsedColor | null {
  const hex = color.trim();
  if (!hex.startsWith('#')) return null;

  const raw = hex.slice(1);
  if (raw.length === 3 || raw.length === 4) {
    const [r = '', g = '', b = '', a = 'f'] = raw.split('');
    return {
      red: Number.parseInt(`${r}${r}`, 16),
      green: Number.parseInt(`${g}${g}`, 16),
      blue: Number.parseInt(`${b}${b}`, 16),
      alpha: Number.parseInt(`${a}${a}`, 16) / 255,
    };
  }

  if (raw.length === 6 || raw.length === 8) {
    return {
      red: Number.parseInt(raw.slice(0, 2), 16),
      green: Number.parseInt(raw.slice(2, 4), 16),
      blue: Number.parseInt(raw.slice(4, 6), 16),
      alpha: raw.length === 8 ? Number.parseInt(raw.slice(6, 8), 16) / 255 : 1,
    };
  }

  return null;
}

function parseRgbColor(color: string): ParsedColor | null {
  const match = color.trim().match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/i,
  );
  if (!match) return null;

  return {
    red: Number(match[1]),
    green: Number(match[2]),
    blue: Number(match[3]),
    alpha: match[4] !== undefined ? Number(match[4]) : 1,
  };
}

function mixCanvasColors(primary: string, secondary: string, primaryWeight = 0.62): string {
  const first = parseHexColor(primary) ?? parseRgbColor(primary);
  const second = parseHexColor(secondary) ?? parseRgbColor(secondary);
  if (!first || !second) return primary;

  const weight = Math.max(0, Math.min(1, primaryWeight));
  const inverseWeight = 1 - weight;
  const red = Math.round((first.red * weight) + (second.red * inverseWeight));
  const green = Math.round((first.green * weight) + (second.green * inverseWeight));
  const blue = Math.round((first.blue * weight) + (second.blue * inverseWeight));
  const alpha = (first.alpha * weight) + (second.alpha * inverseWeight);
  return `rgba(${red}, ${green}, ${blue}, ${alpha.toFixed(3)})`;
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
  if (isSearchMatch) return `${theme.searchHl}28`;
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

export function resolveWorkbookMiniMapColor(
  theme: ThemeTokens,
  tone: WorkbookRowSemanticTone,
): string {
  const semanticTone = normalizeWorkbookRowTone(tone);
  if (semanticTone === 'add') {
    return mixCanvasColors(
      mixCanvasColors(theme.addBg, theme.addHl, 0.52),
      theme.addTx,
      0.74,
    );
  }
  if (semanticTone === 'delete') {
    return mixCanvasColors(
      mixCanvasColors(theme.delBg, theme.delHl, 0.52),
      theme.delTx,
      0.74,
    );
  }
  if (semanticTone === 'mixed') {
    return mixCanvasColors(
      mixCanvasColors(theme.chgBg, theme.chgHl, 0.48),
      theme.chgTx,
      0.72,
    );
  }
  return theme.bg2;
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
