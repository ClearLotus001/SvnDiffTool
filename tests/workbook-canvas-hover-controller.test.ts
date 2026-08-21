import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isWorkbookCanvasPointerInsideHoverAnchor,
  resolveWorkbookCanvasHoverVisibility,
} from '../src/components/workbook/useWorkbookCanvasHoverController';
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

test('resolveWorkbookCanvasHoverVisibility opens unchanged cells only when their text is clipped', () => {
  const measureText = (value: string) => value.length * 10;
  const unchangedHover: WorkbookCanvasHoverCell = {
    ...hover,
    displayValue: 'short',
    compareCell: undefined,
  };
  assert.equal(resolveWorkbookCanvasHoverVisibility(unchangedHover, 12, measureText), null);

  const clipped = resolveWorkbookCanvasHoverVisibility({
    ...unchangedHover,
    displayValue: 'a description that is wider than the cell',
  }, 12, measureText);
  assert.equal(clipped?.isTextTruncated, true);
  assert.equal(clipped?.displayValue, 'a description that is wider than the cell');

  const compareHover = resolveWorkbookCanvasHoverVisibility(hover, 12, measureText);
  assert.equal(compareHover?.key, hover.key);
});
