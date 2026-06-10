import test from 'node:test';
import assert from 'node:assert/strict';

import { isWorkbookCanvasPointerInsideHoverAnchor } from '../src/components/workbook/useWorkbookCanvasHoverController';
import type { WorkbookCanvasHoverCell } from '../src/components/workbook/WorkbookCanvasHoverTooltip';

const hover: WorkbookCanvasHoverCell = {
  key: 'base-10-2',
  anchorRect: {
    left: 10,
    top: 20,
    width: 80,
    height: 24,
    right: 90,
    bottom: 44,
  },
  compareCell: {
    column: 2,
    baseCell: { value: 'before', formula: '' },
    mineCell: { value: 'after', formula: '' },
    changed: true,
    masked: false,
    strictOnly: false,
    kind: 'modify',
    hasBaseContent: true,
    hasMineContent: true,
    hasContent: true,
  },
};

test('isWorkbookCanvasPointerInsideHoverAnchor uses the hover anchor as a half-open rect', () => {
  assert.equal(isWorkbookCanvasPointerInsideHoverAnchor(hover, 10, 20), true);
  assert.equal(isWorkbookCanvasPointerInsideHoverAnchor(hover, 89.9, 43.9), true);
  assert.equal(isWorkbookCanvasPointerInsideHoverAnchor(hover, 90, 30), false);
  assert.equal(isWorkbookCanvasPointerInsideHoverAnchor(hover, 30, 44), false);
  assert.equal(isWorkbookCanvasPointerInsideHoverAnchor(null, 30, 30), false);
});
