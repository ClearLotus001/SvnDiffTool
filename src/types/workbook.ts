// ─────────────────────────────────────────────────────────────────────────────
// Workbook comparison and interaction types
// ─────────────────────────────────────────────────────────────────────────────

import type { CollapseExpansionState } from '@/utils/collapse/collapseState';
import type { DiffLine, DiffPerformanceMetrics } from '@/types/diff';
import type { DiffAnalysisSnapshot } from '@/types/svn';

export type WorkbookMoveDirection = 'up' | 'down' | 'left' | 'right';
export type WorkbookSelectionKind = 'cell' | 'row' | 'column';
export type WorkbookCompareMode = 'strict' | 'content';
export type WorkbookSelectionRequestReason = 'click' | 'drag' | 'contextmenu' | 'keyboard' | 'programmatic' | 'search';
export type WorkbookSelectionMode = 'replace' | 'range' | 'toggle';
export type WorkbookSectionChangeType = 'equal' | 'add' | 'delete' | 'rename';

export interface WorkbookSection {
  name: string;
  displayName: string;
  changeType: WorkbookSectionChangeType;
  hasBaseSide: boolean;
  hasMineSide: boolean;
  renamePeerName: string | null;
  renameRole: 'source' | 'target' | null;
  startLineIdx: number;
  endLineIdx: number;
  maxColumns: number;
  rowCount: number;
  firstDataLineIdx: number | null;
  firstDataRowNumber: number | null;
}

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
  lineIdxs?: number[];
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
  splitRatio?: number;
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
  autoCollapsedColumns: number[];
  autoCollapsedColumnSegments: WorkbookHiddenColumnSegment[];
  baseMergeRanges: WorkbookMergeRange[];
  mineMergeRanges: WorkbookMergeRange[];
}

export interface WorkbookCellSnapshot {
  value: string;
  formula: string;
}

export type WorkbookCellDeltaKind = 'equal' | 'add' | 'delete' | 'modify';
export type WorkbookRowDeltaTone = 'equal' | 'add' | 'delete' | 'mixed';
export type WorkbookRowMiniMapTone = 'equal' | 'add' | 'delete' | 'modify' | 'strict-only' | 'mixed';
export type WorkbookRowMiniMapPaintTone = Exclude<WorkbookRowMiniMapTone, 'equal' | 'mixed'>;

export interface WorkbookCellDelta {
  column: number;
  baseCell: WorkbookCellSnapshot;
  mineCell: WorkbookCellSnapshot;
  changed: boolean;
  masked: boolean;
  strictOnly?: boolean;
  kind?: WorkbookCellDeltaKind;
  hasBaseContent?: boolean;
  hasMineContent?: boolean;
  hasContent?: boolean;
}

export interface WorkbookRowDelta {
  cellDeltas: Map<number, WorkbookCellDelta>;
  cellDeltaPayloads?: WorkbookCellDeltaPayload[];
  changedColumns: number[];
  strictOnlyColumns: number[];
  changedCount: number;
  hasChanges: boolean;
  tone: WorkbookRowDeltaTone;
  miniMapTone?: WorkbookRowMiniMapTone;
  miniMapPaintTones?: WorkbookRowMiniMapPaintTone[];
  structuralChange?: 'add' | 'delete';
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
  baseRowNumber?: number | null;
  mineRowNumber?: number | null;
  cellDeltas: WorkbookCellDeltaPayload[];
}

export interface WorkbookSectionDeltaPayload {
  name: string;
  hasBaseSide?: boolean;
  hasMineSide?: boolean;
  startLineIdx?: number | null;
  endLineIdx?: number | null;
  maxColumns?: number | null;
  rowCount?: number | null;
  firstDataLineIdx?: number | null;
  firstDataRowNumber?: number | null;
  rows: WorkbookRowDeltaPayload[];
}

export interface WorkbookPrecomputedDeltaPayload {
  compareMode: WorkbookCompareMode;
  sections: WorkbookSectionDeltaPayload[];
}

export interface PreparedWorkbookAnalysis {
  diffLinesByMode: Partial<Record<WorkbookCompareMode, DiffLine[] | null>>;
  workbookDeltaByMode: Partial<Record<WorkbookCompareMode, WorkbookPrecomputedDeltaPayload | null>>;
  sectionsByMode?: Partial<Record<WorkbookCompareMode, WorkbookSection[] | null>>;
  navigationRegionsByMode?: Partial<Record<WorkbookCompareMode, WorkbookDiffRegion[] | null>>;
  metadata: {
    base: WorkbookMetadataMap | null;
    mine: WorkbookMetadataMap | null;
  };
  artifactDiff: WorkbookArtifactDiff | null;
  perf?: Pick<DiffPerformanceMetrics, 'metadataMs' | 'rustDiffMs'> | null;
}

export interface WorkbookArtifactDiff {
  hasArtifactOnlyDiff: true;
  kind: 'binary-only';
  baseBytes: number;
  mineBytes: number;
}

export interface WorkbookCompareModePayload {
  compareMode: WorkbookCompareMode;
  analysisSnapshot?: DiffAnalysisSnapshot | null;
  perf?: Pick<DiffPerformanceMetrics, 'rustDiffMs'> | null;
}

export interface WorkbookMetadataPayload {
  base: WorkbookMetadataMap | null;
  mine: WorkbookMetadataMap | null;
  analysisSnapshot?: DiffAnalysisSnapshot | null;
  perf?: Pick<DiffPerformanceMetrics, 'metadataMs'> | null;
}

export interface WorkbookMetadataSource {
  baseName: string;
  mineName: string;
  fileName: string;
  baseBytes: Uint8Array | null;
  mineBytes: Uint8Array | null;
}
