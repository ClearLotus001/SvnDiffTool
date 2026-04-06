import type { ThemeTokens } from '@/theme/tokens';
import type { WorkbookCompareMode } from '@/types';
import { resolveDiffIndicatorThemeVisual } from '@/utils/diff/diffIndicatorVisuals';
import type { WorkbookCompareCellState } from '@/utils/workbook/workbookCompare';
import { getWorkbookCellChangeKind } from '@/utils/workbook/workbookCellContract';

export interface WorkbookCompareCellVisual {
  background: string;
  border: string;
  textColor: string;
  maskOverlay: string | null;
}

export interface WorkbookCompareBadgeVisual {
  background: string;
  border: string;
  textColor: string;
}

export type WorkbookCompareSemanticKind = 'equal' | 'add' | 'delete' | 'modify' | 'strict-only';

export type WorkbookCompareHintVisual = WorkbookCompareBadgeVisual;

export interface WorkbookMergeContinuationVisual {
  background: string;
  guideStroke: string;
}

function getWorkbookStrictOnlyVisual(theme: ThemeTokens): WorkbookCompareCellVisual {
  return {
    ...resolveDiffIndicatorThemeVisual(theme, 'strict-only', 'strong'),
    maskOverlay: null,
  };
}

interface ResolveWorkbookCompareCellVisualOptions {
  theme: ThemeTokens;
  compareCell: WorkbookCompareCellState | undefined;
  compareMode?: WorkbookCompareMode;
  side: 'base' | 'mine';
  modifyColorMode?: 'semantic' | 'side-accent';
  hasEntry: boolean;
  hasContent: boolean;
  hasBaseRow: boolean;
  hasMineRow: boolean;
  defaultTextColor: string;
}

function getWorkbookSideAccentVisual(theme: ThemeTokens, side: 'base' | 'mine'): WorkbookCompareCellVisual {
  const accent = side === 'base' ? theme.acc2 : theme.acc;
  return {
    background: `${accent}12`,
    border: `${accent}66`,
    textColor: accent,
    maskOverlay: null,
  };
}

export function resolveWorkbookCompareCellKind(
  compareCell: WorkbookCompareCellState | undefined,
  compareMode: WorkbookCompareMode = 'strict',
): WorkbookCompareSemanticKind {
  if (!compareCell?.changed) return 'equal';
  if (compareCell.strictOnly) return 'strict-only';

  const kind = compareCell.kind ?? (
    getWorkbookCellChangeKind(compareCell.baseCell, compareCell.mineCell, compareMode) === 'mixed'
      ? 'modify'
      : getWorkbookCellChangeKind(compareCell.baseCell, compareCell.mineCell, compareMode)
  );

  if (kind === 'mixed' || kind === 'modify') return 'modify';
  return kind;
}

export function getWorkbookCompareBadgeVisual(
  theme: ThemeTokens,
  kind: WorkbookCompareCellState['kind'],
): WorkbookCompareBadgeVisual {
  return resolveDiffIndicatorThemeVisual(
    theme,
    kind === 'add' || kind === 'delete' ? kind : 'modify',
    'soft',
  );
}

export function getWorkbookCompareHintVisual(
  theme: ThemeTokens,
  kind: Exclude<WorkbookCompareSemanticKind, 'equal'>,
): WorkbookCompareHintVisual {
  return resolveDiffIndicatorThemeVisual(
    theme,
    kind === 'strict-only'
      ? 'strict-only'
      : kind === 'modify'
        ? 'modify'
        : kind,
    'soft',
  );
}

export function getWorkbookMergeContinuationVisual(
  theme: ThemeTokens,
  borderColor: string,
): WorkbookMergeContinuationVisual {
  return {
    background: `${theme.bg0}1c`,
    guideStroke: `${borderColor}66`,
  };
}

export function resolveWorkbookCompareCellVisual({
  theme: T,
  compareCell,
  compareMode = 'strict',
  side,
  modifyColorMode = 'semantic',
  hasEntry,
  hasContent,
  hasBaseRow,
  hasMineRow,
  defaultTextColor,
}: ResolveWorkbookCompareCellVisualOptions): WorkbookCompareCellVisual {
  if (!compareCell?.changed) {
    return {
      background: hasEntry ? (hasContent ? T.bg1 : T.bg0) : T.bg2,
      border: hasEntry ? T.border2 : T.border,
      textColor: defaultTextColor,
      maskOverlay: compareCell?.masked && hasContent ? `${T.bg1}22` : null,
    };
  }

  if (compareCell.strictOnly) {
    return getWorkbookStrictOnlyVisual(T);
  }

  const kind = resolveWorkbookCompareCellKind(compareCell, compareMode);

  if (kind === 'add') {
    return {
      ...resolveDiffIndicatorThemeVisual(T, 'add', 'strong'),
      maskOverlay: null,
    };
  }

  if (kind === 'delete') {
    return {
      ...resolveDiffIndicatorThemeVisual(T, 'delete', 'strong'),
      maskOverlay: null,
    };
  }

  const isSingleSidedRow = hasBaseRow !== hasMineRow;
  if (isSingleSidedRow) {
    const isAddSide = side === 'mine' && hasMineRow;
    return {
      ...resolveDiffIndicatorThemeVisual(T, isAddSide ? 'add' : 'delete', 'strong'),
      maskOverlay: null,
    };
  }

  if (modifyColorMode === 'side-accent') {
    return getWorkbookSideAccentVisual(T, side);
  }

  return {
    ...resolveDiffIndicatorThemeVisual(T, 'modify', 'strong'),
    maskOverlay: null,
  };
}
