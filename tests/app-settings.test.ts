import test from 'node:test';
import assert from 'node:assert/strict';

import { getStoredAppSettings, saveStoredAppSettings } from '../src/utils/app/settings';

test('workbook differences-only view is enabled by default', () => {
  assert.equal(getStoredAppSettings().showOnlyDifferences, true);
  assert.equal(getStoredAppSettings().botEnabled, true);
});

test('legacy settings migrate to differences-only while current settings preserve user choice', () => {
  const previousWindow = globalThis.window;
  let stored = JSON.stringify({ showOnlyDifferences: false, diffTypeFilter: 'delete' });
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage: {
        getItem: () => stored,
        setItem: (_key: string, value: string) => { stored = value; },
      },
    },
  });

  try {
    assert.equal(getStoredAppSettings().showOnlyDifferences, true);
    const migrated = getStoredAppSettings();
    saveStoredAppSettings({ ...migrated, showOnlyDifferences: false, botEnabled: false });
    assert.equal(getStoredAppSettings().showOnlyDifferences, false);
    assert.equal(getStoredAppSettings().botEnabled, false);
    assert.equal('diffTypeFilter' in JSON.parse(stored), false);
  } finally {
    if (previousWindow === undefined) {
      Reflect.deleteProperty(globalThis, 'window');
    } else {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: previousWindow,
      });
    }
  }
});
