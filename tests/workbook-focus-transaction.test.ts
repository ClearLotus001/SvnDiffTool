import assert from 'node:assert/strict';
import test from 'node:test';

import type { WorkbookSelectionFocusIntent } from '../src/types';
import { resolveWorkbookFocusIntentDisposition } from '../src/hooks/workbook/useWorkbookFocusTransaction';
import { clearHandledWorkbookFocusIntent } from '../src/hooks/workbook/useWorkbookSelectionFocusIntent';

const intent: WorkbookSelectionFocusIntent = {
  id: 1,
  navigationContext: 4,
  reason: 'click',
  target: {
    kind: 'cell',
    sheetName: 'Items',
    side: 'base',
    versionLabel: 'BASE',
    rowNumber: 12,
    colIndex: 3,
    colLabel: 'D',
    address: 'D12',
    value: 'value',
    formula: '',
  },
};

test('focus transaction runs only in its active sheet and hunk context', () => {
  assert.equal(resolveWorkbookFocusIntentDisposition({
    active: true,
    activeSheetName: 'Items',
    navigationContext: 4,
    intent,
  }), 'run');
  assert.equal(resolveWorkbookFocusIntentDisposition({
    active: true,
    activeSheetName: 'Items',
    navigationContext: 5,
    intent,
  }), 'discard');
  assert.equal(resolveWorkbookFocusIntentDisposition({
    active: true,
    activeSheetName: 'Other',
    navigationContext: 4,
    intent,
  }), 'wait');
  assert.equal(resolveWorkbookFocusIntentDisposition({
    active: false,
    activeSheetName: 'Items',
    navigationContext: 4,
    intent,
  }), 'wait');
});

test('handled focus intent is cleared only when the ids match', () => {
  assert.equal(clearHandledWorkbookFocusIntent(intent, intent.id), null);
  assert.equal(clearHandledWorkbookFocusIntent(intent, intent.id + 1), intent);
  assert.equal(clearHandledWorkbookFocusIntent(null, intent.id), null);
});
