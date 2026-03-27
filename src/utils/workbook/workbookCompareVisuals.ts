import type { Theme } from '@/types';
import type { WorkbookCompareMode } from '@/types';
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

function getWorkbookStrictOnlyVisual(theme: Theme): WorkbookCompareCellVisual {
  return {
    background: `${theme.acc2}16`,
    border: `${theme.acc2}66`,
    textColor: theme.acc2,
    maskOverlay: null,
  };
}

interface ResolveWorkbookCompareCellVisualOptions {
  theme: Theme;
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

function getWorkbookSideAccentVisual(theme: Theme, side: 'base' | 'mine'): WorkbookCompareCellVisual {
  const accent = side === 'base' ? theme.acc2 : theme.acc;
  return {
    background: `${accent}12`,
    border: `${accent}66`,
    textColor: accent,
    maskOverlay: null,
  };
}

export function getWorkbookCompareBadgeVisual(
  theme: Theme,
  kind: WorkbookCompareCellState['kind'],
): WorkbookCompareBadgeVisual {
  if (kind === 'add') {
    return {
      background: `${theme.addBrd}12`,
      border: `${theme.addBrd}33`,
      textColor: theme.addTx,
    };
  }
  if (kind === 'delete') {
    return {
      background: `${theme.delBrd}12`,
      border: `${theme.delBrd}33`,
      textColor: theme.delTx,
    };
  }
  return {
    background: `${theme.chgTx}12`,
    border: `${theme.chgTx}33`,
    textColor: theme.chgTx,
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

  const kind = compareCell.kind ?? (
    getWorkbookCellChangeKind(compareCell.baseCell, compareCell.mineCell, compareMode) === 'mixed'
      ? 'modify'
      : getWorkbookCellChangeKind(compareCell.baseCell, compareCell.mineCell, compareMode)
  );

  if (kind === 'add') {
    return {
      background: T.addBg,
      border: T.addBrd,
      textColor: T.addTx,
      maskOverlay: null,
    };
  }

  if (kind === 'delete') {
    return {
      background: T.delBg,
      border: T.delBrd,
      textColor: T.delTx,
      maskOverlay: null,
    };
  }

  const isSingleSidedRow = hasBaseRow !== hasMineRow;
  if (isSingleSidedRow) {
    const isAddSide = side === 'mine' && hasMineRow;
    return {
      background: isAddSide ? T.addBg : T.delBg,
      border: isAddSide ? T.addBrd : T.delBrd,
      textColor: isAddSide ? T.addTx : T.delTx,
      maskOverlay: null,
    };
  }

  if (modifyColorMode === 'side-accent') {
    return getWorkbookSideAccentVisual(T, side);
  }

  return {
    background: T.chgBg,
    border: T.chgTx,
    textColor: T.chgTx,
    maskOverlay: null,
  };
}
