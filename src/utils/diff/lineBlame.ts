import type { DiffLine, LineBlameInfo, LineBlameLine, LineBlamePayload } from '@/types';

const GIT_COMMIT_PATTERN = /^[0-9a-f]{8,64}$/i;

export function formatCompactLineBlameVersion(
  blame: LineBlameInfo | null | undefined,
): string {
  if (!blame) return '';
  if (blame.uncommitted) return 'WC*';

  const version = blame.revision.trim();
  return GIT_COMMIT_PATTERN.test(version) ? version.slice(0, 7) : version;
}

function buildLineBlameMap(lines: LineBlameLine[]): Map<number, LineBlameInfo> {
  return new Map(lines.map(({ lineNo: _lineNo, ...info }) => [_lineNo, info]));
}

export function attachLineBlameToDiffLines(
  diffLines: DiffLine[],
  payload: LineBlamePayload,
): DiffLine[] {
  if (payload.base.length === 0 && payload.mine.length === 0) return diffLines;

  const baseByLine = buildLineBlameMap(payload.base);
  const mineByLine = buildLineBlameMap(payload.mine);
  return diffLines.map(line => ({
    ...line,
    baseBlame: line.baseLineNo == null ? null : (baseByLine.get(line.baseLineNo) ?? null),
    mineBlame: line.mineLineNo == null ? null : (mineByLine.get(line.mineLineNo) ?? null),
  }));
}
