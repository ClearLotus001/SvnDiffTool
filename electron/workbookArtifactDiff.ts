export interface WorkbookArtifactDiffLine {
  type: 'equal' | 'add' | 'delete';
}

interface WorkbookArtifactDeltaLike {
  sections?: Array<{
    rows?: Array<{
      changedCount?: number;
      changedColumns?: number[];
      cellDeltas?: Array<unknown>;
    }>;
  }>;
}

export interface WorkbookArtifactDiffSummary {
  hasArtifactOnlyDiff: true;
  kind: 'binary-only';
  baseBytes: number;
  mineBytes: number;
}

interface DetectWorkbookArtifactDiffOptions {
  isWorkbook: boolean;
  baseBytes: Uint8Array | null;
  mineBytes: Uint8Array | null;
  diffLines: WorkbookArtifactDiffLine[] | null;
  workbookDelta?: WorkbookArtifactDeltaLike | null;
}

interface DetectWorkbookArtifactDiffFromEqualityStateOptions {
  isWorkbook: boolean;
  baseByteLength: number;
  mineByteLength: number;
  contentsEqual: boolean | null;
  diffLines: WorkbookArtifactDiffLine[] | null;
  workbookDelta?: WorkbookArtifactDeltaLike | null;
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function hasNonEqualWorkbookDiffLines(
  diffLines: WorkbookArtifactDiffLine[] | null,
): boolean {
  return Boolean(diffLines?.some((line) => line.type !== 'equal'));
}

function hasWorkbookDeltaChanges(
  workbookDelta: WorkbookArtifactDeltaLike | null | undefined,
): boolean {
  return Boolean(
    workbookDelta?.sections?.some((section) => (
      section.rows?.some((row) => (
        (typeof row.changedCount === 'number' && row.changedCount > 0)
        || (Array.isArray(row.changedColumns) && row.changedColumns.length > 0)
        || (Array.isArray(row.cellDeltas) && row.cellDeltas.length > 0)
      ))
    )),
  );
}

export function detectWorkbookArtifactOnlyDiff({
  isWorkbook,
  baseBytes,
  mineBytes,
  diffLines,
  workbookDelta = null,
}: DetectWorkbookArtifactDiffOptions): WorkbookArtifactDiffSummary | null {
  return detectWorkbookArtifactOnlyDiffFromEqualityState({
    isWorkbook,
    baseByteLength: baseBytes?.byteLength ?? 0,
    mineByteLength: mineBytes?.byteLength ?? 0,
    contentsEqual: baseBytes && mineBytes ? bytesEqual(baseBytes, mineBytes) : null,
    diffLines,
    workbookDelta,
  });
}

export function detectWorkbookArtifactOnlyDiffFromEqualityState({
  isWorkbook,
  baseByteLength,
  mineByteLength,
  contentsEqual,
  diffLines,
  workbookDelta = null,
}: DetectWorkbookArtifactDiffFromEqualityStateOptions): WorkbookArtifactDiffSummary | null {
  if (!isWorkbook || !diffLines) return null;
  if (hasNonEqualWorkbookDiffLines(diffLines)) return null;
  if (hasWorkbookDeltaChanges(workbookDelta)) return null;
  if (contentsEqual !== false) return null;

  return {
    hasArtifactOnlyDiff: true,
    kind: 'binary-only',
    baseBytes: baseByteLength,
    mineBytes: mineByteLength,
  };
}
