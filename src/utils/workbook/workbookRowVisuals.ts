import type { WorkbookRowDeltaTone } from '@/types';
import type { ThemeTokens } from '@/theme/tokens';
import { resolveThemeAppearance } from '@/theme';
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

export function resolveWorkbookVersionAccent(
  theme: ThemeTokens,
  side: 'base' | 'mine',
): string {
  return side === 'base' ? theme.versionBase : theme.versionMine;
}

export interface WorkbookVersionIdentityVisual {
  overlay: string | null;
  rail: string | null;
  railWidth: number;
}

export function resolveWorkbookVersionIdentityVisual(
  theme: ThemeTokens,
  side: 'base' | 'mine',
  hasSemanticDiff: boolean,
  surface: 'body' | 'header' = 'body',
): WorkbookVersionIdentityVisual {
  const isHighContrast = resolveThemeAppearance(theme) === 'high-contrast';
  if (hasSemanticDiff || isHighContrast) {
    return {
      overlay: null,
      rail: null,
      railWidth: 0,
    };
  }

  const overlayAlpha = surface === 'header'
    ? (isLightWorkbookTheme(theme) ? '24' : '1a')
    : (isLightWorkbookTheme(theme) ? '12' : '0d');
  return {
    overlay: `${resolveWorkbookVersionAccent(theme, side)}${overlayAlpha}`,
    rail: null,
    railWidth: 0,
  };
}

function getWorkbookSideAccent(theme: ThemeTokens, sideAccent: Exclude<WorkbookRowSideAccent, null>): string {
  return resolveWorkbookVersionAccent(theme, sideAccent);
}

function withHexAlpha(color: string, hexAlpha: string): string {
  return color.startsWith('#') && color.length === 7 ? `${color}${hexAlpha}` : color;
}

function isLightWorkbookTheme(theme: ThemeTokens): boolean {
  return resolveThemeAppearance(theme) === 'light';
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
  isHeaderRow?: boolean;
}): string {
  const {
    theme,
    isGuided,
    isActiveSearch,
    isSearchMatch,
    isHeaderRow = false,
  } = params;

  if (isGuided) return `${theme.acc2}08`;
  if (isActiveSearch) return theme.searchActiveBg;
  if (isSearchMatch) return `${theme.searchHl}24`;
  if (isHeaderRow) return theme.workbookHeaderBg;
  return theme.bg0;
}

export function resolveWorkbookHeaderRowDividerColor(theme: ThemeTokens): string {
  return theme.workbookHeaderBorder;
}

export function formatWorkbookVisibleRowNumber(
  rowNumber: number,
  previousVisibleRowNumber: number | null,
): string {
  if (rowNumber <= 0) return '';
  if (
    previousVisibleRowNumber != null
    && previousVisibleRowNumber > 0
    && rowNumber > previousVisibleRowNumber + 1
  ) {
    return `⋯ ${rowNumber}`;
  }
  return String(rowNumber);
}

export function resolveWorkbookRowSelectionAccent(
  theme: ThemeTokens,
  side: 'base' | 'mine',
): string {
  return resolveWorkbookVersionAccent(theme, side);
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
  isHeaderRow?: boolean;
  versionSide?: 'base' | 'mine' | null;
}): string {
  const {
    theme,
    selectionAccent,
    isSelected,
    isHeaderRow = false,
    versionSide = null,
  } = params;
  if (isSelected) return `${selectionAccent}${isLightWorkbookTheme(theme) ? '40' : '26'}`;
  if (isHeaderRow) return theme.workbookHeaderBg;
  if (versionSide) {
    return `${resolveWorkbookVersionAccent(theme, versionSide)}${isLightWorkbookTheme(theme) ? '32' : '20'}`;
  }
  return theme.lnBg;
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
  return theme.workbookGridBorderStrong;
}

export function resolveWorkbookRowRuleColor(
  theme: ThemeTokens,
  tone: WorkbookRowSemanticTone,
  sideAccent: WorkbookRowSideAccent = null,
): string {
  if (!sideAccent) return resolveWorkbookRowBorderColor(theme, tone, sideAccent);
  return `${getWorkbookSideAccent(theme, sideAccent)}${isLightWorkbookTheme(theme) ? '88' : '66'}`;
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
  const inactiveVersionAlpha = isLightWorkbookTheme(theme) ? 'e6' : 'bf';
  if (fallbackTone === 'base') return active ? theme.versionBase : withHexAlpha(theme.versionBase, inactiveVersionAlpha);
  if (fallbackTone === 'mine') return active ? theme.versionMine : withHexAlpha(theme.versionMine, inactiveVersionAlpha);
  return active ? theme.acc2 : theme.lnTx;
}

export function resolveWorkbookMiniMapPaint(
  theme: ThemeTokens,
  tone: WorkbookMiniMapSemanticTone,
): WorkbookMiniMapPaint {
  if (tone === 'strict-only') {
    return {
      kind: 'solid',
      color: theme.searchHl,
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
      left: theme.versionBase,
      right: theme.versionMine,
      mid: theme.chgTx,
      continuation: `${theme.chgTx}38`,
      shine: `${theme.chgTx}44`,
    };
  }
  return {
    left: theme.workbookGridBorderStrong,
    right: theme.workbookGridBorderStrong,
    mid: theme.t1,
    continuation: `${theme.workbookGridBorderStrong}28`,
    shine: `${theme.t1}2e`,
  };
}
