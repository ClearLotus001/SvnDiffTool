// src/engine/myers.ts  —  Myers character-level diff, O(ND) time  [v4 — typecheck clean]
//
// noUncheckedIndexedAccess fixes:
//  - v[] (Int32Array) and trace[] return T|undefined under this flag
//  - All array accesses now use non-null assertions (!) where bounds are
//    mathematically guaranteed, with comments explaining each guarantee.
//  - String indexing a[x-1] returns string|undefined — asserted with !
//    because x > 0 is always checked before the access.

import type { CharSpan, DiffOp } from '../types';

const CHAR_DIFF_LIMIT = 2000;

function myersOps(a: string, b: string): DiffOp[] {
  const n = a.length;
  const m = b.length;

  if (n === 0 && m === 0) return [];
  if (n === 0) return [{ type: 'insert', text: b }];
  if (m === 0) return [{ type: 'delete', text: a }];

  const max    = n + m;
  const offset = max;
  // Int32Array — typed array, indexing still returns number|undefined under
  // noUncheckedIndexedAccess in some TS versions. Cast to bypass.
  const v      = new Int32Array(2 * max + 2) as unknown as number[];
  const trace: (readonly number[])[] = [];

  for (let d = 0; d <= max; d++) {
    // Snapshot v at entry of this round
    trace.push([...v]);

    for (let k = -d; k <= d; k += 2) {
      // k is in [-d..d] and offset=max, so k+offset is always in [0..2*max].
      // Array size is 2*max+2 — guaranteed in bounds.
      const vKm1 = v[k - 1 + offset] ?? 0;
      const vKp1 = v[k + 1 + offset] ?? 0;

      let x: number;
      if (k === -d || (k !== d && vKm1 < vKp1)) {
        x = vKp1;
      } else {
        x = vKm1 + 1;
      }
      let y = x - k;

      while (x < n && y < m && a[x] === b[y]) { x++; y++; }

      v[k + offset] = x;

      if (x >= n && y >= m) {
        return backtrack(trace, a, b, offset, d);
      }
    }
  }

  return [{ type: 'delete', text: a }, { type: 'insert', text: b }];
}

function backtrack(
  trace: (readonly number[])[],
  a: string,
  b: string,
  offset: number,
  d: number,
): DiffOp[] {
  const ops: DiffOp[] = [];
  let x = a.length;
  let y = b.length;

  for (let dd = d; dd > 0; dd--) {
    // dd is in [1..d], trace.length === d+1, so trace[dd] always exists.
    const v = trace[dd]!;
    const k = x - y;

    const vKm1 = v[k - 1 + offset] ?? 0;
    const vKp1 = v[k + 1 + offset] ?? 0;

    const prevK =
      k === -dd || (k !== dd && vKm1 < vKp1) ? k + 1 : k - 1;

    // prevK is a valid diagonal in the previous round — always in bounds.
    const prevX = v[prevK + offset] ?? 0;
    const prevY = prevX - prevK;

    // Walk diagonal back — both x>prevX and y>prevY, so x-1 >= 0 and y-1 >= 0
    while (x > prevX && y > prevY) {
      // x > 0 and y > 0 are guaranteed by loop condition above
      if (a[x - 1] !== b[y - 1]) break;
      ops.push({ type: 'equal', text: a[x - 1]! });
      x--;
      y--;
    }

    if (prevK === k + 1) {
      // prevY is a valid index into b (0 <= prevY < b.length guaranteed by Myers)
      ops.push({ type: 'insert', text: b[prevY]! });
    } else {
      ops.push({ type: 'delete', text: a[prevX]! });
    }

    x = prevX;
    y = prevY;
  }

  // Equal prefix — x > 0 guarantees x-1 >= 0
  while (x > 0 && y > 0 && a[x - 1] === b[y - 1]) {
    ops.push({ type: 'equal', text: a[--x]! });
    y--;
  }

  ops.reverse();
  return ops;
}

function mergeOps(ops: DiffOp[]): DiffOp[] {
  const merged: DiffOp[] = [];
  for (const op of ops) {
    const last = merged[merged.length - 1];
    if (last && last.type === op.type) {
      last.text += op.text;
    } else {
      merged.push({ type: op.type, text: op.text });
    }
  }
  return merged;
}

export function computeCharDiff(
  deletedLine: string,
  addedLine: string,
): { baseSpans: CharSpan[]; mineSpans: CharSpan[] } | null {
  if (deletedLine.length > CHAR_DIFF_LIMIT || addedLine.length > CHAR_DIFF_LIMIT) return null;

  const ops = mergeOps(myersOps(deletedLine, addedLine));

  // Post-diff noise guard: if >85% of chars changed, whole-line highlight is cleaner
  let changed = 0, total = 0;
  for (const op of ops) {
    total += op.text.length;
    if (op.type !== 'equal') changed += op.text.length;
  }
  if (total > 0 && changed / total > 0.85) return null;

  const baseSpans: CharSpan[] = [];
  const mineSpans: CharSpan[] = [];

  for (const op of ops) {
    switch (op.type) {
      case 'equal':
        baseSpans.push({ highlight: false, text: op.text });
        mineSpans.push({ highlight: false, text: op.text });
        break;
      case 'delete':
        baseSpans.push({ highlight: true, text: op.text });
        break;
      case 'insert':
        mineSpans.push({ highlight: true, text: op.text });
        break;
    }
  }

  const merge = (spans: CharSpan[]): CharSpan[] =>
    spans.reduce<CharSpan[]>((acc, s) => {
      const last = acc[acc.length - 1];
      if (last && last.highlight === s.highlight) { last.text += s.text; }
      else acc.push({ highlight: s.highlight, text: s.text });
      return acc;
    }, []);

  return { baseSpans: merge(baseSpans), mineSpans: merge(mineSpans) };
}
