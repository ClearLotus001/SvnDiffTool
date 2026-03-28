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

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

export function hasNonEqualWorkbookDiffLines(
  diffLines: WorkbookArtifactDiffLine[] | null,
): boolean {
  return Boolean(diffLines?.some((line) => line.type !== 'equal'));
}

export function hasWorkbookDeltaChanges(
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
  if (!isWorkbook || !baseBytes || !mineBytes || !diffLines) return null;
  if (hasNonEqualWorkbookDiffLines(diffLines)) return null;
  if (hasWorkbookDeltaChanges(workbookDelta)) return null;
  if (bytesEqual(baseBytes, mineBytes)) return null;

  return {
    hasArtifactOnlyDiff: true,
    kind: 'binary-only',
    baseBytes: baseBytes.byteLength,
    mineBytes: mineBytes.byteLength,
  };
}
