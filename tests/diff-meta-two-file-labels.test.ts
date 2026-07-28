import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveTwoFileVersionLabels } from '../src/utils/diff/diffMeta';

test('two-file labels use the nearest differing directories for same-name files', () => {
  assert.deepEqual(
    resolveTwoFileVersionLabels(
      'E:\\QSM_TDRS\\Publish\\Tools\\TDR_res\\Excel\\[1]新物品表.xlsm',
      'E:\\QSM_TDRS\\Trunk\\Tools\\TDR_res\\Excel\\[1]新物品表.xlsm',
    ),
    {
      base: 'Publish · [1]新物品表.xlsm',
      mine: 'Trunk · [1]新物品表.xlsm',
    },
  );
});

test('two-file labels keep distinct file names concise', () => {
  assert.deepEqual(
    resolveTwoFileVersionLabels('C:\\main\\base.ts', 'C:\\feature\\mine.ts'),
    {
      base: 'base.ts',
      mine: 'mine.ts',
    },
  );
});

test('two-file labels fall back to side indexes when no directory distinction is available', () => {
  assert.deepEqual(
    resolveTwoFileVersionLabels('config.ts', 'config.ts'),
    {
      base: '01 · config.ts',
      mine: '02 · config.ts',
    },
  );
});
