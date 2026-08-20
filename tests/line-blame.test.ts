import test from 'node:test';
import assert from 'node:assert/strict';

import { parseBlameEntries } from '../electron/main/svnHelpers';
import { parseGitLineBlame } from '../electron/main/gitOperations';
import {
  attachLineBlameToDiffLines,
  formatCompactLineBlameVersion,
} from '../src/utils/diff/lineBlame';
import type { DiffLine } from '../src/types';

function formatExpectedLocalDate(dateText: string): string {
  const parsed = new Date(dateText);
  const yyyy = parsed.getFullYear();
  const mm = `${parsed.getMonth() + 1}`.padStart(2, '0');
  const dd = `${parsed.getDate()}`.padStart(2, '0');
  const hh = `${parsed.getHours()}`.padStart(2, '0');
  const mi = `${parsed.getMinutes()}`.padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

test('SVN blame XML retains revision, author, date, and uncommitted lines', () => {
  const commitDate = '2026-08-20T03:04:05.000000Z';
  const parsed = parseBlameEntries(`<?xml version="1.0"?>
    <blame>
      <target path="sample.txt">
        <entry line-number="1">
          <commit revision="12">
            <author>alice</author>
            <date>${commitDate}</date>
          </commit>
        </entry>
        <entry line-number="2" />
      </target>
    </blame>`);

  assert.deepEqual(parsed, [
    {
      lineNo: 1,
      revision: 'r12',
      author: 'alice',
      date: formatExpectedLocalDate(commitDate),
      uncommitted: false,
    },
    {
      lineNo: 2,
      revision: '',
      author: '',
      date: '',
      uncommitted: true,
    },
  ]);
});

test('Git line porcelain output maps commits and working-tree edits to the common shape', () => {
  const commit = '1234567890abcdef1234567890abcdef12345678';
  const parsed = parseGitLineBlame([
    `${commit} 1 1 1`,
    'author Alice Example',
    'author-time 1787195045',
    'filename sample.txt',
    '\tcommitted line',
    `${'0'.repeat(40)} 2 2 1`,
    'author Not Committed Yet',
    'author-time 1787195100',
    'filename sample.txt',
    '\tworking line',
  ].join('\n'));

  assert.equal(parsed[0]?.revision, '1234567890');
  assert.equal(parsed[0]?.author, 'Alice Example');
  assert.match(parsed[0]?.date ?? '', /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  assert.equal(parsed[0]?.uncommitted, false);
  assert.deepEqual(parsed[1], {
    lineNo: 2,
    revision: '',
    author: '',
    date: '',
    uncommitted: true,
  });
});

test('compact blame versions use conventional Git hashes without truncating SVN revisions', () => {
  assert.equal(formatCompactLineBlameVersion({
    revision: '9a36908ae7', author: 'alice', date: '', uncommitted: false,
  }), '9a36908');
  assert.equal(formatCompactLineBlameVersion({
    revision: 'r88051', author: 'bob', date: '', uncommitted: false,
  }), 'r88051');
  assert.equal(formatCompactLineBlameVersion({
    revision: '', author: '', date: '', uncommitted: true,
  }), 'WC*');
});

test('blame metadata is attached independently by base and mine line number', () => {
  const diffLines: DiffLine[] = [{
    type: 'delete',
    base: 'before',
    mine: null,
    baseLineNo: 4,
    mineLineNo: null,
    baseCharSpans: null,
    mineCharSpans: null,
  }, {
    type: 'add',
    base: null,
    mine: 'after',
    baseLineNo: null,
    mineLineNo: 5,
    baseCharSpans: null,
    mineCharSpans: null,
  }];

  const attached = attachLineBlameToDiffLines(diffLines, {
    base: [{ lineNo: 4, revision: 'r8', author: 'bob', date: '2026-08-18 09:00', uncommitted: false }],
    mine: [{ lineNo: 5, revision: 'r9', author: 'carol', date: '2026-08-19 10:00', uncommitted: false }],
  });

  assert.deepEqual(attached[0]?.baseBlame, {
    revision: 'r8', author: 'bob', date: '2026-08-18 09:00', uncommitted: false,
  });
  assert.equal(attached[0]?.mineBlame, null);
  assert.deepEqual(attached[1]?.mineBlame, {
    revision: 'r9', author: 'carol', date: '2026-08-19 10:00', uncommitted: false,
  });
});
