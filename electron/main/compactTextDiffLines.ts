import type { CompactTextDiffLines, DiffLine } from './types.js';

const NULL_LINE_NUMBER = -1;
const MAX_LINE_NUMBER = 0x7fff_ffff;

function encodeLineNumber(value: number | null): number | null {
  if (value == null) return NULL_LINE_NUMBER;
  if (!Number.isInteger(value) || value < 0 || value > MAX_LINE_NUMBER) return null;
  return value;
}

/**
 * Converts the hot, object-heavy text line graph into structured-clone-friendly
 * columns. Unsupported or malformed lines deliberately stay on the legacy path.
 */
export function compactTextDiffLines(diffLines: DiffLine[]): CompactTextDiffLines | null {
  if (diffLines.length === 0) return null;

  const types = new Uint8Array(diffLines.length);
  const baseLineNumbers = new Int32Array(diffLines.length);
  const mineLineNumbers = new Int32Array(diffLines.length);
  const texts = new Array<string>(diffLines.length);
  const mineTextOverrides: CompactTextDiffLines['mineTextOverrides'] = [];
  const charSpans: CompactTextDiffLines['charSpans'] = [];

  for (let lineIdx = 0; lineIdx < diffLines.length; lineIdx += 1) {
    const line = diffLines[lineIdx];
    if (!line || Object.hasOwn(line, 'baseBlame') || Object.hasOwn(line, 'mineBlame')) return null;

    const baseLineNumber = encodeLineNumber(line.baseLineNo);
    const mineLineNumber = encodeLineNumber(line.mineLineNo);
    if (baseLineNumber == null || mineLineNumber == null) return null;
    baseLineNumbers[lineIdx] = baseLineNumber;
    mineLineNumbers[lineIdx] = mineLineNumber;

    if (line.type === 'equal') {
      if (typeof line.base !== 'string' || typeof line.mine !== 'string') return null;
      types[lineIdx] = 0;
      texts[lineIdx] = line.base;
      if (line.mine !== line.base) mineTextOverrides.push([lineIdx, line.mine]);
    } else if (line.type === 'add') {
      if (line.base !== null || typeof line.mine !== 'string') return null;
      types[lineIdx] = 1;
      texts[lineIdx] = line.mine;
    } else if (line.type === 'delete') {
      if (line.mine !== null || typeof line.base !== 'string') return null;
      types[lineIdx] = 2;
      texts[lineIdx] = line.base;
    } else {
      return null;
    }

    if (line.baseCharSpans !== null || line.mineCharSpans !== null) {
      charSpans.push([lineIdx, line.baseCharSpans, line.mineCharSpans]);
    }
  }

  return {
    version: 1,
    types,
    baseLineNumbers,
    mineLineNumbers,
    texts,
    mineTextOverrides,
    charSpans,
  };
}
