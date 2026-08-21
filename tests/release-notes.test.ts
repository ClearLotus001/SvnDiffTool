import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeReleaseNotes } from '../electron/updater/releaseNotes';

test('normalizeReleaseNotes converts GitHub release HTML into readable text', () => {
  assert.equal(
    normalizeReleaseNotes([
      {
        note: [
          '<h2>更新内容 / What&#39;s Changed</h2>',
          '<ul><li>Improve workbook navigation &amp; rendering</li><li>Polish installer UI</li></ul>',
          '<p><strong>Full Changelog</strong>: <a href="https://example.test">v1...v2</a></p>',
        ].join(''),
      },
    ]),
    [
      "更新内容 / What's Changed",
      '- Improve workbook navigation & rendering',
      '- Polish installer UI',
      '',
      'Full Changelog: v1...v2',
    ].join('\n'),
  );
});

test('normalizeReleaseNotes preserves plain text and rejects empty values', () => {
  assert.equal(normalizeReleaseNotes('  First line\n\nSecond line  '), 'First line\n\nSecond line');
  assert.equal(normalizeReleaseNotes('<p> &nbsp; </p>'), null);
  assert.equal(normalizeReleaseNotes(null), null);
});
