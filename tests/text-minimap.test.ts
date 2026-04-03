import test from 'node:test';
import assert from 'node:assert/strict';

import type { DiffLine } from '../src/types';
import { resolveMiniMapLineTone } from '../src/components/diff/MiniMap';
import { buildReplacementPairIndex } from '../src/engine/text/textChangeAlignment';

function makeDeleteLine(base: string, baseLineNo: number): DiffLine {
  return {
    type: 'delete',
    base,
    mine: null,
    baseLineNo,
    mineLineNo: null,
    baseCharSpans: null,
    mineCharSpans: null,
  };
}

function makeAddLine(mine: string, mineLineNo: number): DiffLine {
  return {
    type: 'add',
    base: null,
    mine,
    baseLineNo: null,
    mineLineNo,
    baseCharSpans: null,
    mineCharSpans: null,
  };
}

test('minimap paints replacement pairs as modify instead of add/delete', () => {
  const diffLines: DiffLine[] = [
    makeDeleteLine('output = run_convert_tool(addr, "libil2cpp.sym.so")', 83),
    makeAddLine('output = run_convert_tool(addr, "libil2cpp.dbg.so")', 83),
  ];

  const replacementPairIndex = buildReplacementPairIndex(diffLines);

  assert.equal(resolveMiniMapLineTone(diffLines[0]!, 0, replacementPairIndex), 'modify');
  assert.equal(resolveMiniMapLineTone(diffLines[1]!, 1, replacementPairIndex), 'modify');
});

test('minimap keeps unrelated add/delete lines as their original tones', () => {
  const diffLines: DiffLine[] = [
    makeDeleteLine('remove legacy bootstrap block', 10),
    makeAddLine('add brand new telemetry section', 10),
  ];

  const replacementPairIndex = buildReplacementPairIndex(diffLines);

  assert.equal(resolveMiniMapLineTone(diffLines[0]!, 0, replacementPairIndex), 'delete');
  assert.equal(resolveMiniMapLineTone(diffLines[1]!, 1, replacementPairIndex), 'add');
});
