import type {
  DiffAnalysisSnapshot,
  DiffData,
  WorkbookCompareMode,
  WorkbookCompareModePayload,
} from './types.js';

const MAX_SYNTAX_HIGHLIGHT_TOTAL_CHARS = 300_000;
const MAX_SYNTAX_HIGHLIGHT_LINES = 8_000;
const MAX_SYNTAX_HIGHLIGHT_LINE_LENGTH = 2_000;

function hasSnapshotDiffProjection(
  snapshot: DiffAnalysisSnapshot | null | undefined,
  compareMode: WorkbookCompareMode,
): boolean {
  if (!snapshot) return false;
  if (snapshot.textAnalysis?.diffLines.length) return true;
  return Boolean(snapshot.workbookAnalysis?.diffLinesByMode[compareMode]?.length);
}

function hasSnapshotWorkbookDeltaProjection(
  snapshot: DiffAnalysisSnapshot | null | undefined,
  compareMode: WorkbookCompareMode,
): boolean {
  return Boolean(snapshot?.workbookAnalysis?.workbookDeltaByMode[compareMode]);
}

function getLineStats(text: string): { lineCount: number; longestLineLength: number } {
  if (!text) {
    return {
      lineCount: 0,
      longestLineLength: 0,
    };
  }

  let lineCount = 1;
  let currentLineLength = 0;
  let longestLineLength = 0;

  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code === 10) {
      lineCount += 1;
      longestLineLength = Math.max(longestLineLength, currentLineLength);
      currentLineLength = 0;
      continue;
    }
    currentLineLength += 1;
  }

  longestLineLength = Math.max(longestLineLength, currentLineLength);
  return { lineCount, longestLineLength };
}

function shouldStripRawTextTransport(data: DiffData): boolean {
  if (typeof data.baseContent !== 'string' || typeof data.mineContent !== 'string') {
    return false;
  }
  if (!data.analysisSnapshotsByMode?.strict?.textAnalysis && !data.analysisSnapshotsByMode?.content?.textAnalysis) {
    return false;
  }

  const totalChars = data.baseContent.length + data.mineContent.length;
  if (totalChars > MAX_SYNTAX_HIGHLIGHT_TOTAL_CHARS) {
    return true;
  }

  const baseStats = getLineStats(data.baseContent);
  const mineStats = getLineStats(data.mineContent);
  if ((baseStats.lineCount + mineStats.lineCount) > MAX_SYNTAX_HIGHLIGHT_LINES) {
    return true;
  }

  return Math.max(baseStats.longestLineLength, mineStats.longestLineLength) > MAX_SYNTAX_HIGHLIGHT_LINE_LENGTH;
}

export function projectTransportDiffData(data: DiffData): DiffData {
  const strictSnapshot = data.analysisSnapshotsByMode?.strict ?? null;
  const contentSnapshot = data.analysisSnapshotsByMode?.content ?? null;
  const shouldStripRawText = shouldStripRawTextTransport(data);

  const hasSnapshotBackedDiffProjection = hasSnapshotDiffProjection(strictSnapshot, 'strict')
    || hasSnapshotDiffProjection(contentSnapshot, 'content');
  const hasSnapshotBackedWorkbookProjection = hasSnapshotWorkbookDeltaProjection(strictSnapshot, 'strict')
    || hasSnapshotWorkbookDeltaProjection(contentSnapshot, 'content');

  if (!hasSnapshotBackedDiffProjection && !hasSnapshotBackedWorkbookProjection) {
    if (!shouldStripRawText) {
      return data;
    }
    return {
      ...data,
      baseContent: null,
      mineContent: null,
    };
  }

  return {
    ...data,
    baseContent: shouldStripRawText ? null : data.baseContent,
    mineContent: shouldStripRawText ? null : data.mineContent,
    precomputedDiffLines: hasSnapshotBackedDiffProjection ? null : data.precomputedDiffLines,
    precomputedWorkbookDelta: hasSnapshotBackedWorkbookProjection ? null : data.precomputedWorkbookDelta,
    precomputedDiffLinesByMode: hasSnapshotBackedDiffProjection ? null : data.precomputedDiffLinesByMode,
    precomputedWorkbookDeltaByMode: hasSnapshotBackedWorkbookProjection ? null : data.precomputedWorkbookDeltaByMode,
  };
}

export function projectTransportWorkbookCompareModePayload(
  payload: WorkbookCompareModePayload,
): WorkbookCompareModePayload {
  const snapshot = payload.analysisSnapshot ?? null;
  if (!snapshot) return payload;

  const hasDiffProjection = hasSnapshotDiffProjection(snapshot, payload.compareMode);
  const hasWorkbookProjection = hasSnapshotWorkbookDeltaProjection(snapshot, payload.compareMode);
  if (!hasDiffProjection && !hasWorkbookProjection) {
    return payload;
  }

  return {
    ...payload,
    diffLines: hasDiffProjection ? null : payload.diffLines,
    workbookDelta: hasWorkbookProjection ? null : payload.workbookDelta,
  };
}
