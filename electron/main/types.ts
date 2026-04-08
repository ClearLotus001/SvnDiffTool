import type { WorkbookArtifactDiffSummary } from '../workbookArtifactDiff.js';
import type { AppUpdateState } from '../updater/types.js';

export type SvnRevisionSourceKind = 'revision' | 'working-copy' | 'input-file';
export type WorkbookCompareMode = 'strict' | 'content';
export type CompareContext = 'standard_local_compare' | 'literal_two_file_compare' | 'revision_vs_revision_compare';

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

export interface RevisionSelectionPair {
  baseRevisionId: string | null;
  mineRevisionId: string | null;
}

export interface DiffLine {
  type: 'equal' | 'add' | 'delete';
  base: string | null;
  mine: string | null;
  baseLineNo: number | null;
  mineLineNo: number | null;
  baseCharSpans: null;
  mineCharSpans: null;
}

export interface DiffPerformanceMetrics {
  source: 'cli' | 'revision-switch' | 'local-dev';
  mainLoadMs?: number;
  baseReadMs?: number;
  mineReadMs?: number;
  baseParserMs?: number;
  mineParserMs?: number;
  metadataMs?: number;
  rustDiffMs?: number;
  baseBytes?: number;
  mineBytes?: number;
}

export interface DiffData {
  baseName: string;
  mineName: string;
  svnUrl: string;
  fileName: string;
  sourceIdentity: string;
  compareContext: CompareContext;
  timelineTargetUrl: string | null;
  workingCopyAvailable: boolean;
  initialPair: RevisionSelectionPair | null;
  resetPair: RevisionSelectionPair | null;
  launchBaseName: string;
  launchMineName: string;
  baseContent: string | null;
  mineContent: string | null;
  baseBytes: Uint8Array | null;
  mineBytes: Uint8Array | null;
  precomputedDiffLines: DiffLine[] | null;
  precomputedWorkbookDelta: WorkbookPrecomputedDeltaPayload | null;
  precomputedDiffLinesByMode: Partial<Record<WorkbookCompareMode, DiffLine[] | null>> | null;
  precomputedWorkbookDeltaByMode: Partial<Record<WorkbookCompareMode, WorkbookPrecomputedDeltaPayload | null>> | null;
  baseWorkbookMetadata: WorkbookMetadataMap | null;
  mineWorkbookMetadata: WorkbookMetadataMap | null;
  revisionOptions: SvnRevisionInfo[] | null;
  baseRevisionInfo: SvnRevisionInfo | null;
  mineRevisionInfo: SvnRevisionInfo | null;
  canSwitchRevisions: boolean;
  workbookArtifactDiff: WorkbookArtifactDiffSummary | null;
  sourceNoticeCode: 'unversioned-working-copy' | null;
  perf: DiffPerformanceMetrics | null;
}

export interface WindowFrameState {
  isMaximized: boolean;
}

export interface LaunchContextPayload {
  isDevMode: boolean;
  usesNativeWindowControls: boolean;
  windowFrameState: WindowFrameState;
  updateState: AppUpdateState;
}

export interface LaunchStatePayload extends LaunchContextPayload {
  diffData: DiffData;
}

export interface BuildDiffDataOptions {
  baseRevisionId?: string | undefined;
  mineRevisionId?: string | undefined;
  workbookCompareMode?: WorkbookCompareMode;
  includeRevisionOptions?: boolean;
  revisionOptionsOverride?: SvnRevisionInfo[] | null;
}

export interface ReadFilePayloadOptions {
  includeWorkbookText?: boolean;
  includeWorkbookBytes?: boolean;
  includeWorkbookMetadata?: boolean;
}

export interface WorkbookCompareModePayload {
  compareMode: WorkbookCompareMode;
  diffLines: DiffLine[] | null;
  workbookDelta: WorkbookPrecomputedDeltaPayload | null;
  perf: Pick<DiffPerformanceMetrics, 'rustDiffMs'> | null;
}

export interface WorkbookMetadataPayload {
  base: WorkbookMetadataMap | null;
  mine: WorkbookMetadataMap | null;
  perf: Pick<DiffPerformanceMetrics, 'metadataMs'> | null;
}

export interface TitleBarOverlayPayload {
  color?: unknown;
  symbolColor?: unknown;
  height?: unknown;
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

export interface WorkbookCellSnapshot {
  value: string;
  formula: string;
}

export type WorkbookCellDeltaKind = 'equal' | 'add' | 'delete' | 'modify';
export type WorkbookRowDeltaTone = 'equal' | 'add' | 'delete' | 'mixed';

export interface WorkbookCellDeltaPayload {
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

export interface WorkbookRowDeltaPayload {
  lineIdx: number;
  lineIdxs: number[];
  leftLineIdx: number | null;
  rightLineIdx: number | null;
  cellDeltas: WorkbookCellDeltaPayload[];
  changedColumns: number[];
  strictOnlyColumns: number[];
  changedCount: number;
  hasChanges: boolean;
  tone: WorkbookRowDeltaTone;
}

export interface WorkbookSectionDeltaPayload {
  name: string;
  rows: WorkbookRowDeltaPayload[];
}

export interface WorkbookPrecomputedDeltaPayload {
  compareMode: WorkbookCompareMode;
  sections: WorkbookSectionDeltaPayload[];
}

export interface FilePayloadMetrics {
  readMs: number;
  parserMs: number;
  metadataMs: number;
  byteLength: number;
}

export interface FilePayload {
  content: string | null;
  bytes: Uint8Array | null;
  metadata: WorkbookMetadataMap | null;
  perf: FilePayloadMetrics;
}

export interface WorkbookPayloadCoverage {
  text: boolean;
  bytes: boolean;
  metadata: boolean;
}

export interface FilePayloadCacheEntry {
  mtimeMs: number;
  size: number;
  payload: FilePayload;
  memoryBytes: number;
  coverage: WorkbookPayloadCoverage;
}

export interface RevisionPayloadCacheEntry {
  payload: FilePayload;
  memoryBytes: number;
  coverage: WorkbookPayloadCoverage;
}

export interface RustDiffLinePayload {
  type?: unknown;
  t?: unknown;
  base?: unknown;
  b?: unknown;
  mine?: unknown;
  m?: unknown;
  baseLineNo?: unknown;
  bl?: unknown;
  mineLineNo?: unknown;
  ml?: unknown;
}

export interface RustWorkbookDiffPayload {
  diffLines?: unknown;
  d?: unknown;
  workbookDelta?: unknown;
  w?: unknown;
}

export type XmlNode = Record<string, unknown>;

export interface LocalWorkbookPairCacheContext {
  key: string;
  leftPath: string;
  rightPath: string;
  leftMtimeMs: number;
  rightMtimeMs: number;
  leftSize: number;
  rightSize: number;
}

export interface FileEqualityCacheEntry {
  leftPath: string;
  rightPath: string;
  leftMtimeMs: number;
  rightMtimeMs: number;
  leftSize: number;
  rightSize: number;
  equal: boolean;
}

export interface InlineWorkbookCompareCachePayload {
  kind: 'inline';
  value: WorkbookCompareModePayload;
}

export interface CompressedWorkbookCompareCachePayload {
  kind: 'gzip-json-v1';
  bytes: Buffer;
}

export type StoredWorkbookCompareCachePayload =
  | InlineWorkbookCompareCachePayload
  | CompressedWorkbookCompareCachePayload;

export interface WorkbookCompareCacheEntry {
  leftMtimeMs: number;
  rightMtimeMs: number;
  leftSize: number;
  rightSize: number;
  payload: StoredWorkbookCompareCachePayload;
  memoryBytes: number;
}

export interface WorkbookMetadataCacheEntry {
  leftMtimeMs: number;
  rightMtimeMs: number;
  leftSize: number;
  rightSize: number;
  payload: WorkbookMetadataPayload;
  memoryBytes: number;
}

export { type WorkbookArtifactDiffSummary } from '../workbookArtifactDiff.js';
export { type CliArgs } from '../cliArgs.js';
export { type SvnDiffViewerScope } from '../svnDiffViewerConfig.js';
export { type AppUpdateState } from '../updater/types.js';
