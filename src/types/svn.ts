// ─────────────────────────────────────────────────────────────────────────────
// SVN, diff loading, and shell integration types
// ─────────────────────────────────────────────────────────────────────────────

import type {
  DiffLine,
  DiffMeta,
  DiffPerformanceMetrics,
  DiffSourceNoticeCode,
} from '@/types/diff';
import type {
  WorkbookArtifactDiff,
  WorkbookCompareMode,
  WorkbookMetadataMap,
  WorkbookPrecomputedDeltaPayload,
} from '@/types/workbook';

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

export type CompareContext =
  | 'standard_local_compare'
  | 'literal_two_file_compare'
  | 'revision_vs_revision_compare';

export interface RevisionSelectionPair {
  baseRevisionId: string | null;
  mineRevisionId: string | null;
}

export interface DiffData extends DiffMeta {
  sourceIdentity?: string;
  compareContext?: CompareContext;
  timelineTargetUrl?: string | null;
  workingCopyAvailable?: boolean;
  initialPair?: RevisionSelectionPair | null;
  resetPair?: RevisionSelectionPair | null;
  launchBaseName?: string;
  launchMineName?: string;
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
  sourceNoticeCode?: DiffSourceNoticeCode | null;
  perf?: DiffPerformanceMetrics | null;
}

export interface LocalDiffFilePickResult {
  path: string;
  name: string;
}

export type SvnDiffViewerScope = 'all-files' | 'excel-only';
export type SvnDiffViewerMode = SvnDiffViewerScope | 'mixed' | 'unconfigured' | 'unsupported';
export type SvnDiffViewerAvailabilityReason = 'ready' | 'windows-only' | 'packaged-only';

export interface SvnDiffViewerStatus {
  available: boolean;
  reason: SvnDiffViewerAvailabilityReason;
  executablePath: string | null;
  command: string | null;
  currentMode: SvnDiffViewerMode;
  globalDiffCommand: string | null;
  workbookDiffCommands: Record<string, string | null>;
  workbookExtensions: string[];
}

export interface WindowFrameState {
  isMaximized: boolean;
}
