// ─────────────────────────────────────────────────────────────────────────────
// src/types/index.ts
// All shared TypeScript interfaces and types for SvnExcelDiffTool
// ─────────────────────────────────────────────────────────────────────────────

import type { CollapseExpansionState } from '../utils/collapseState';

// ── Diff engine ──────────────────────────────────────────────────────────────

export type LineType = 'equal' | 'add' | 'delete';

/** A single character-level diff span */
export interface CharSpan {
  /** Whether this span is highlighted (changed) */
  highlight: boolean;
  /** The text content */
  text: string;
}

/** A single line in the computed diff result */
export interface DiffLine {
  type: LineType;
  /** Content from base file (null for pure-add lines) */
  base: string | null;
  /** Content from mine file (null for pure-delete lines) */
  mine: string | null;
  /** 1-based line number in base file */
  baseLineNo: number | null;
  /** 1-based line number in mine file */
  mineLineNo: number | null;
  /** Character-level diff spans for base side (only on paired delete lines) */
  baseCharSpans: CharSpan[] | null;
  /** Character-level diff spans for mine side (only on paired add lines) */
  mineCharSpans: CharSpan[] | null;
}

/** A contiguous block of changes */
export interface Hunk {
  /** Index of first DiffLine in this hunk */
  startIdx: number;
  /** Index of last DiffLine in this hunk (inclusive) */
  endIdx: number;
  addCount: number;
  delCount: number;
}

// ── Myers diff internal types ─────────────────────────────────────────────────

export type OpType = 'equal' | 'insert' | 'delete';
export interface DiffOp {
  type: OpType;
  text: string;
}

// ── Syntax tokenizer ─────────────────────────────────────────────────────────

export type TokenType = 'keyword' | 'string' | 'comment' | 'number' | 'punctuation' | 'plain';

export interface Token {
  type: TokenType;
  text: string;
}

// ── Virtual scroll ────────────────────────────────────────────────────────────

export interface VirtualState {
  totalH: number;
  startIdx: number;
  endIdx: number;
}

// ── Render items (what the virtual list renders) ─────────────────────────────

export interface LineItem {
  kind: 'line';
  line: DiffLine;
  /** index into diffLines array */
  lineIdx: number;
}

export interface CollapseItem {
  kind: 'collapse';
  /** number of hidden lines */
  count: number;
  blockId: string;
  hiddenStart: number;
  hiddenEnd: number;
  expandStep: number;
  /** first hidden DiffLine index */
  fromIdx: number;
  /** last hidden DiffLine index + 1 */
  toIdx: number;
}

export type RenderItem = LineItem | CollapseItem;

/** A split-view row pairs left and right lines */
export interface SplitRow {
  left: DiffLine | null;
  right: DiffLine | null;
  /** representative lineIdx for search/hunk logic */
  lineIdx: number;
  /** all underlying diff line indexes represented by this row */
  lineIdxs: number[];
  /** Optional precomputed workbook delta for this paired row */
  workbookRowDelta?: WorkbookRowDelta;
}

export interface SplitLineItem {
  kind: 'split-line';
  row: SplitRow;
  lineIdx: number;
}

export interface SplitCollapseItem {
  kind: 'split-collapse';
  count: number;
  blockId: string;
  hiddenStart: number;
  hiddenEnd: number;
  expandStep: number;
  fromIdx: number;
  toIdx: number;
}

export type SplitRenderItem = SplitLineItem | SplitCollapseItem;

// ── Search ────────────────────────────────────────────────────────────────────

export interface SearchMatch {
  /** Index into diffLines */
  lineIdx: number;
  /** Character start offset in content */
  start: number;
  /** Character end offset in content */
  end: number;
}

export interface SearchState {
  query: string;
  isRegex: boolean;
  isCaseSensitive: boolean;
  matches: SearchMatch[];
  activeIdx: number;
}

// ── Layout ────────────────────────────────────────────────────────────────────

export type LayoutMode = 'unified' | 'split-h' | 'split-v';
export type WorkbookMoveDirection = 'up' | 'down' | 'left' | 'right';
export type WorkbookSelectionKind = 'cell' | 'row' | 'column';
export type WorkbookCompareMode = 'strict' | 'content';

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
  visibleColumns: number[];
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
  compareMode: 'strict';
  sections: WorkbookSectionDeltaPayload[];
}

// ── Theme ─────────────────────────────────────────────────────────────────────

export type ThemeKey = 'dark' | 'light' | 'hc';

export interface Theme {
  // backgrounds
  bg0: string; bg1: string; bg2: string; bg3: string; bg4: string;
  // borders
  border: string; border2: string;
  // text
  t0: string; t1: string; t2: string;
  // add
  addBg: string; addHl: string; addTx: string; addBrd: string;
  // delete
  delBg: string; delHl: string; delTx: string; delBrd: string;
  // change
  chgBg: string; chgTx: string;
  // accent
  acc: string; acc2: string;
  // syntax
  kw: string; str: string; num: string; cmt: string; punc: string;
  // line number gutter
  lnBg: string; lnTx: string;
  // scrollbar
  scrollThumb: string; scrollThumbHover: string; scrollTrack: string;
  // minimap
  miniAdd: string; miniDel: string; miniVp: string;
  // search
  searchHl: string; searchActiveBg: string;
}

// ── File/diff metadata ────────────────────────────────────────────────────────

export interface DiffMeta {
  baseName: string;
  mineName: string;
  svnUrl: string;
  fileName: string;
}

export type SvnRevisionSourceKind = 'revision' | 'working-copy' | 'input-file';

export interface SvnRevisionInfo {
  id: string;
  revision: string;
  title: string;
  author: string;
  date: string;
  message: string;
  kind: SvnRevisionSourceKind;
}

export interface RevisionOptionsQuery {
  limit?: number;
  beforeRevisionId?: string;
  anchorDateTime?: string;
  includeSpecials?: boolean;
}

export interface RevisionOptionsPayload {
  items: SvnRevisionInfo[];
  hasMore: boolean;
  nextBeforeRevisionId: string | null;
  anchorRevisionId: string | null;
  queryDateTime: string | null;
}

export interface WorkbookArtifactDiff {
  hasArtifactOnlyDiff: true;
  kind: 'binary-only';
  baseBytes: number;
  mineBytes: number;
}

export interface DiffData extends DiffMeta {
  baseContent: string | null;
  mineContent: string | null;
  baseBytes: Uint8Array | null;
  mineBytes: Uint8Array | null;
  precomputedDiffLines?: DiffLine[] | null;
  precomputedWorkbookDelta?: WorkbookPrecomputedDeltaPayload | null;
  precomputedDiffLinesByMode?: Partial<Record<WorkbookCompareMode, DiffLine[] | null>> | null;
  precomputedWorkbookDeltaByMode?: Partial<Record<WorkbookCompareMode, WorkbookPrecomputedDeltaPayload | null>> | null;
  baseWorkbookMetadata?: WorkbookMetadataMap | null;
  mineWorkbookMetadata?: WorkbookMetadataMap | null;
  revisionOptions?: SvnRevisionInfo[] | null;
  baseRevisionInfo?: SvnRevisionInfo | null;
  mineRevisionInfo?: SvnRevisionInfo | null;
  canSwitchRevisions?: boolean;
  workbookArtifactDiff?: WorkbookArtifactDiff | null;
  perf?: DiffPerformanceMetrics | null;
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

export interface DiffPerformanceMetrics {
  source: 'cli' | 'revision-switch' | 'local-dev';
  mainLoadMs?: number;
  baseReadMs?: number;
  mineReadMs?: number;
  baseParserMs?: number;
  mineParserMs?: number;
  baseBytes?: number;
  mineBytes?: number;
  textResolveMs?: number;
  metadataMs?: number;
  diffMs?: number;
  rustDiffMs?: number;
  totalAppMs?: number;
  diffLineCount?: number;
}

export interface LocalDiffFilePickResult {
  path: string;
  name: string;
}

// ── Electron IPC bridge (window.svnDiff) ─────────────────────────────────────

export interface SvnDiffBridge {
  getDiffData(compareMode?: WorkbookCompareMode): Promise<DiffData>;
  loadRevisionDiff(baseRevisionId: string, mineRevisionId: string, compareMode?: WorkbookCompareMode): Promise<DiffData>;
  getRevisionOptions(): Promise<SvnRevisionInfo[]>;
  queryRevisionOptions(query?: RevisionOptionsQuery): Promise<RevisionOptionsPayload>;
  loadWorkbookCompareMode(compareMode: WorkbookCompareMode, baseRevisionId?: string, mineRevisionId?: string): Promise<WorkbookCompareModePayload>;
  loadWorkbookMetadata(baseRevisionId?: string, mineRevisionId?: string): Promise<WorkbookMetadataPayload>;
  onCliArgsUpdated?(listener: () => void): () => void;
  isDevMode(): Promise<boolean>;
  pickDiffFile(): Promise<LocalDiffFilePickResult | null>;
  loadDevWorkingCopyDiff(filePath: string, compareMode?: WorkbookCompareMode): Promise<DiffData>;
  loadLocalDiff(basePath: string, minePath: string, compareMode?: WorkbookCompareMode): Promise<DiffData>;
  getTheme(): Promise<'dark' | 'light'>;
  writeClipboardText(text: string): void;
  debugLog?(message: string, payload?: unknown): void;
  windowMinimize(): void;
  windowMaximize(): void;
  windowClose(): void;
  openExternal(url: string): void;
}

declare global {
  interface Window {
    svnDiff?: SvnDiffBridge;
  }
}
