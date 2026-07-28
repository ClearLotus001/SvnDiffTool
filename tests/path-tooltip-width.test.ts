import test from 'node:test';
import assert from 'node:assert/strict';

import { getPathTooltipWidth } from '../src/components/shared/PathTooltip';

test('path tooltip width grows with path length and stays within readable bounds', () => {
  const shortWidth = getPathTooltipWidth('C:\\main\\file.ts');
  const longWidth = getPathTooltipWidth(
    'E:\\QSM_TDRS\\Trunk\\Tools\\TDR_res\\Excel\\[1]新物品表.xlsm',
  );
  const expandedWidth = getPathTooltipWidth(
    `E:\\QSM_TDRS\\${'nested-directory\\'.repeat(6)}[1]新物品表.xlsm`,
  );
  const cappedWidth = getPathTooltipWidth(`C:\\${'very-long-directory\\'.repeat(80)}file.xlsx`);

  assert.equal(shortWidth, 520);
  assert.ok(longWidth >= shortWidth);
  assert.ok(expandedWidth > longWidth);
  assert.equal(cappedWidth, 840);
});
