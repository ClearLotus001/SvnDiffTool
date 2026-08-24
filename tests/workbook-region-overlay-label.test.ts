import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('workbook diff region overlay does not draw a floating text label', () => {
  const source = fs.readFileSync('src/components/workbook/WorkbookDiffRegionOverlay.tsx', 'utf8');

  assert.doesNotMatch(source, /ellipsizeCanvasText|ctx\.fillText\(/);
});
