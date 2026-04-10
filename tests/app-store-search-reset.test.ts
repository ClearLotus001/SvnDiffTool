import test from 'node:test';
import assert from 'node:assert/strict';

import { useAppStore } from '../src/store/appStore';

test('resetSearchState clears search query and decorations without rewinding the navigation nonce', () => {
  useAppStore.setState({
    searchQ: 'Budget',
    searchRx: true,
    searchCs: true,
    searchWorkbookScope: 'all',
    activeSearchIdx: 3,
    searchJumpNonce: 11,
  });

  useAppStore.getState().resetSearchState();

  const state = useAppStore.getState();
  assert.equal(state.searchQ, '');
  assert.equal(state.searchRx, false);
  assert.equal(state.searchCs, false);
  assert.equal(state.searchWorkbookScope, 'sheet');
  assert.equal(state.activeSearchIdx, -1);
  assert.equal(state.searchJumpNonce, 12);
});
