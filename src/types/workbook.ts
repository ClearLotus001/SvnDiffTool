// ─────────────────────────────────────────────────────────────────────────────
// Workbook comparison and interaction types
// ─────────────────────────────────────────────────────────────────────────────

import type { CollapseExpansionState } from '@/utils/collapse/collapseState';
import type { DiffLine, DiffPerformanceMetrics } from '@/types/diff';

export type WorkbookMoveDirection = 'up' | 'down' | 'left' | 'right';
export type WorkbookSelectionKind = 'cell' | 'row' | 'column';
export type WorkbookCompareMode = 'strict' | 'content';
export type WorkbookSelectionRequestReason = 'click' | 'contextmenu' | 'keyboard' | 'programmatic';
export type WorkbookSelectionMode = 'replace' | 'range' | 'toggle';

export interface WorkbookSelectedCell {
  kind: WorkbookSelectionKind;
  sheetName: string;
  side: 'base' | 'mine';
  versionLabel: string;
  rowNumber: number;
  colIndex: number;
  colLabel: string;
  address: string;
  value: string;
  formula: string;
}

export interface WorkbookSelectionState {
  anchor: WorkbookSelectedCell | null;
  primary: WorkbookSelectedCell | null;
  items: WorkbookSelectedCell[];
}

export interface WorkbookContextMenuPoint {
  x: number;
  y: number;
}

export interface WorkbookSelectionRequest {
  target: WorkbookSelectedCell | null;
  mode?: WorkbookSelectionMode | undefined;
  reason?: WorkbookSelectionRequestReason | undefined;
  clientPoint?: WorkbookContextMenuPoint | undefined;
  preserveExistingIfTargetSelected?: boolean | undefined;
}

export interface WorkbookHiddenColumnSegment {
  startCol: number;
  endCol: number;
  columns: number[];
  count: number;
  beforeColumn: number | null;
  afterColumn: number | null;
}

export interface WorkbookSheetHiddenState {
  hiddenRows: number[];
  hiddenColumns: number[];
}

export type WorkbookHiddenStateBySheet = Record<string, WorkbookSheetHiddenState>;

export interface WorkbookDiffRegionPatch {
  startRowIndex: number;
  endRowIndex: number;
  startCol: number;
  endCol: number;
  baseRowStart: number | null;
  baseRowEnd: number | null;
  mineRowStart: number | null;
  mineRowEnd: number | null;
  hasBaseSide: boolean;
  hasMineSide: boolean;
  lineIdxs: number[];
}

export interface WorkbookDiffRegion {
  id: string;
  sheetName: string;
  startRowIndex: number;
  endRowIndex: number;
  startCol: number;
  endCol: number;
  rowNumberStart: number;
  rowNumberEnd: number;
  lineStartIdx: number;
  lineEndIdx: number;
  anchorLineIdx: number;
  hasBaseSide: boolean;
  hasMineSide: boolean;
  anchorSelection: WorkbookSelectedCell | null;
  patches: WorkbookDiffRegionPatch[];
}

export interface WorkbookCompareLayoutSnapshot {
  layout: 'unified' | 'split-v';
  sheetName: string | null;
  activeRegionId: string | null;
  scrollTop: number;
  scrollLeft: number;
  expandedBlocks: CollapseExpansionState;
}

export interface WorkbookHorizontalLayoutSnapshot {
  layout: 'split-h';
  sheetName: string | null;
  activeRegionId: string | null;
  leftScrollTop: number;
  leftScrollLeft: number;
  rightScrollTop: number;
  rightScrollLeft: number;
  expandedBlocks: CollapseExpansionState;
}

export type WorkbookLayoutSnapshot = WorkbookCompareLayoutSnapshot | WorkbookHorizontalLayoutSnapshot;

export interface WorkbookFreezeState {
  rowNumber?: number;
  colCount?: number;
}

export interface WorkbookMergeRange {
  startRow: number;
  endRow: number;
  startCol: number;
  endCol: number;
}

export interface WorkbookSheetMetadata {
  name: string;
  hiddenColumns: number[];
  mergeRanges: WorkbookMergeRange[];
  rowCount?: number;
  maxColumns?: number;
}

export interface WorkbookMetadataMap {
  sheets: Record<string, WorkbookSheetMetadata>;
}

export interface WorkbookSheetPresentation {
  allColumns: number[];
  visibleColumns: number[];
  hiddenColumnSegments: WorkbookHiddenColumnSegment[];
  baseMergeRanges: WorkbookMergeRange[];
  mineMergeRanges: WorkbookMergeRange[];
}

export interface WorkbookCellSnapshot {
  value: string;
  formula: string;
}

export type WorkbookCellDeltaKind = 'equal' | 'add' | 'delete' | 'modify';
export type WorkbookRowDeltaTone = 'equal' | 'add' | 'delete' | 'mixed';

export interface WorkbookCellDelta {
  column: number;
  baseCell: WorkbookCellSnapshot;
  mineCell: WorkbookCellSnapshot;
  changed: boolean;
  masked: boolean;
  strictOnly: boolean;
  kind: WorkbookCellDeltaKind;
  hasBaseContent: boolean;
  hasMineContent: boolean;
  hasContent: boolean;
}

export interface WorkbookRowDelta {
  cellDeltas: Map<number, WorkbookCellDelta>;
  changedColumns: number[];
  strictOnlyColumns: number[];
  changedCount: number;
  hasChanges: boolean;
  tone: WorkbookRowDeltaTone;
}

export interface WorkbookCellDeltaPayload extends Omit<WorkbookCellDelta, 'baseCell' | 'mineCell'> {
  baseCell: WorkbookCellSnapshot;
  mineCell: WorkbookCellSnapshot;
}

export interface WorkbookRowDeltaPayload extends Omit<WorkbookRowDelta, 'cellDeltas'> {
  lineIdx: number;
  lineIdxs: number[];
  leftLineIdx: number | null;
  rightLineIdx: number | null;
  cellDeltas: WorkbookCellDeltaPayload[];
}

export interface WorkbookSectionDeltaPayload {
  name: string;
  rows: WorkbookRowDeltaPayload[];
}

export interface WorkbookPrecomputedDeltaPayload {
  compareMode: WorkbookCompareMode;
  sections: WorkbookSectionDeltaPayload[];
}

export interface WorkbookArtifactDiff {
  hasArtifactOnlyDiff: true;
  kind: 'binary-only';
  baseBytes: number;
  mineBytes: number;
}

export interface WorkbookCompareModePayload {
  compareMode: WorkbookCompareMode;
  diffLines: DiffLine[] | null;
  workbookDelta: WorkbookPrecomputedDeltaPayload | null;
  perf?: Pick<DiffPerformanceMetrics, 'rustDiffMs'> | null;
}

export interface WorkbookMetadataPayload {
  base: WorkbookMetadataMap | null;
  mine: WorkbookMetadataMap | null;
  perf?: Pick<DiffPerformanceMetrics, 'metadataMs'> | null;
}

export interface WorkbookMetadataSource {
  baseName: string;
  mineName: string;
  fileName: string;
  baseBytes: Uint8Array | null;
  mineBytes: Uint8Array | null;
}
