import assert from 'node:assert/strict';
import test from 'node:test';

import { shouldSuppressAppShortcutForModal } from '../src/hooks/app/useAppKeyboardShortcuts';

test('modal shortcut guard suppresses app navigation without blocking normal typing', () => {
  assert.equal(shouldSuppressAppShortcutForModal({ key: 'F7' }), true);
  assert.equal(shouldSuppressAppShortcutForModal({ key: 'f', ctrlKey: true }), true);
  assert.equal(shouldSuppressAppShortcutForModal({ key: 'g', metaKey: true }), true);
  assert.equal(shouldSuppressAppShortcutForModal({ key: 'BracketRight', code: 'BracketRight', altKey: true }), true);
  assert.equal(shouldSuppressAppShortcutForModal({ key: 'a' }), false);
  assert.equal(shouldSuppressAppShortcutForModal({ key: 'ArrowDown' }), false);
});
