export interface SharedCharSpan { highlight: boolean; text: string }
interface DiffOp { type: 'equal' | 'insert' | 'delete'; text: string }
const CHAR_DIFF_LIMIT = 2000;

function myersOps(a: string, b: string): DiffOp[] {
  const n = a.length, m = b.length;
  if (n === 0 && m === 0) return [];
  if (n === 0) return [{ type: 'insert', text: b }];
  if (m === 0) return [{ type: 'delete', text: a }];
  const max = n + m, offset = max;
  const v = new Int32Array(2 * max + 2) as unknown as number[];
  const trace: (readonly number[])[] = [];
  for (let d = 0; d <= max; d += 1) {
    trace.push([...v]);
    for (let k = -d; k <= d; k += 2) {
      const vKm1 = v[k - 1 + offset] ?? 0, vKp1 = v[k + 1 + offset] ?? 0;
      let x = k === -d || (k !== d && vKm1 < vKp1) ? vKp1 : vKm1 + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) { x += 1; y += 1; }
      v[k + offset] = x;
      if (x >= n && y >= m) return backtrack(trace, a, b, offset, d);
    }
  }
  return [{ type: 'delete', text: a }, { type: 'insert', text: b }];
}

function backtrack(trace: (readonly number[])[], a: string, b: string, offset: number, d: number): DiffOp[] {
  const ops: DiffOp[] = [];
  let x = a.length, y = b.length;
  for (let dd = d; dd > 0; dd -= 1) {
    const v = trace[dd]!, k = x - y;
    const vKm1 = v[k - 1 + offset] ?? 0, vKp1 = v[k + 1 + offset] ?? 0;
    const prevK = k === -dd || (k !== dd && vKm1 < vKp1) ? k + 1 : k - 1;
    const prevX = v[prevK + offset] ?? 0, prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      if (a[x - 1] !== b[y - 1]) break;
      ops.push({ type: 'equal', text: a[x - 1]! }); x -= 1; y -= 1;
    }
    ops.push(prevK === k + 1 ? { type: 'insert', text: b[prevY]! } : { type: 'delete', text: a[prevX]! });
    x = prevX; y = prevY;
  }
  while (x > 0 && y > 0 && a[x - 1] === b[y - 1]) { ops.push({ type: 'equal', text: a[--x]! }); y -= 1; }
  return ops.reverse();
}

function mergeOps(ops: DiffOp[]): DiffOp[] {
  const merged: DiffOp[] = [];
  for (const op of ops) { const last = merged[merged.length - 1]; if (last?.type === op.type) last.text += op.text; else merged.push({ ...op }); }
  return merged;
}

export function isSingleCharacterReplacement(baseText: string, mineText: string): boolean {
  return Array.from(baseText).length === 1 && Array.from(mineText).length === 1;
}

export function computeCharDiff(deletedLine: string, addedLine: string): { baseSpans: SharedCharSpan[]; mineSpans: SharedCharSpan[] } | null {
  if (isSingleCharacterReplacement(deletedLine, addedLine)) return null;
  if (deletedLine.length > CHAR_DIFF_LIMIT || addedLine.length > CHAR_DIFF_LIMIT) return null;
  const ops = mergeOps(myersOps(deletedLine, addedLine));
  const baseSpans: SharedCharSpan[] = [], mineSpans: SharedCharSpan[] = [];
  for (const op of ops) {
    if (op.type === 'equal') { baseSpans.push({ highlight: false, text: op.text }); mineSpans.push({ highlight: false, text: op.text }); }
    else if (op.type === 'delete') baseSpans.push({ highlight: true, text: op.text });
    else mineSpans.push({ highlight: true, text: op.text });
  }
  const merge = (spans: SharedCharSpan[]) => spans.reduce<SharedCharSpan[]>((acc, span) => { const last = acc[acc.length - 1]; if (last?.highlight === span.highlight) last.text += span.text; else acc.push({ ...span }); return acc; }, []);
  return { baseSpans: merge(baseSpans), mineSpans: merge(mineSpans) };
}
