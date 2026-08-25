import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import StatsBar from '../src/components/navigation/StatsBar';
import type { DiffLine } from '../src/types';
import { I18nProvider } from '../src/context/i18n';
import { ThemeContext } from '../src/context/theme';
import { buildTextDiffPresentation } from '../src/engine/text/textChangeAlignment';
import type { WorkbookSection } from '../src/utils/workbook/workbookSections';

function makeWorkbookSection(
  name: string,
  changeType: WorkbookSection['changeType'],
  renamePeerName: string | null = null,
  renameRole: WorkbookSection['renameRole'] = null,
): WorkbookSection {
  return {
    name,
    displayName: name,
    changeType,
    hasBaseSide: changeType !== 'add',
    hasMineSide: changeType !== 'delete',
    renamePeerName,
    renameRole,
    startLineIdx: 0,
    endLineIdx: 0,
    maxColumns: 0,
    rowCount: 0,
    firstDataLineIdx: null,
    firstDataRowNumber: null,
  };
}

function renderStatsBar(
  showArtifactOnlyDiff: boolean,
  diffLines: DiffLine[] = [],
  workbookSections: WorkbookSection[] = [],
  options: {
    isWorkbookMode?: boolean;
    fileName?: string;
    showGotoShortcut?: boolean;
  } = {},
): string {
  const {
    isWorkbookMode = true,
    fileName = '[1]新物品表.xlsm',
    showGotoShortcut = true,
  } = options;

  return renderToStaticMarkup(
    React.createElement(
      ThemeContext.Provider,
      { value: 'light' },
      React.createElement(
        I18nProvider,
        { initialLocale: 'zh-CN' },
        React.createElement(StatsBar, {
          textDiffPresentation: buildTextDiffPresentation(diffLines),
          baseName: 'Base',
          mineName: 'Local',
          baseTitle: 'Compare Version',
          mineTitle: 'Working Copy',
          fileName,
          totalLines: 0,
          baseVersionLabel: 'r1825384',
          mineVersionLabel: 'r1825385',
          isWorkbookMode,
          showGotoShortcut,
          workbookCompareMode: 'strict',
          workbookSections,
          workbookArtifactDiff: showArtifactOnlyDiff
            ? {
                hasArtifactOnlyDiff: true,
                kind: 'binary-only',
                baseBytes: 8,
                mineBytes: 8,
              }
            : null,
        }),
      ),
    ),
  );
}

test('StatsBar renders artifact-only diff pill when workbook artifact diff exists', () => {
  const html = renderStatsBar(true);

  assert.match(html, /产物有变化/);
});

test('StatsBar does not render artifact-only diff pill when workbook artifact diff is absent', () => {
  const html = renderStatsBar(false);

  assert.doesNotMatch(html, /产物有变化/);
});

test('StatsBar uses replacement-aware modified counts for unrelated add/delete lines', () => {
  const html = renderStatsBar(false, [
    {
      type: 'delete',
      base: 'remove legacy bootstrap block',
      mine: null,
      baseLineNo: 10,
      mineLineNo: null,
      baseCharSpans: null,
      mineCharSpans: null,
    },
    {
      type: 'add',
      base: null,
      mine: 'add brand new telemetry section',
      baseLineNo: null,
      mineLineNo: 10,
      baseCharSpans: null,
      mineCharSpans: null,
    },
  ]);

  assert.match(html, /~0/);
});

test('StatsBar renders workbook sheet change counts without double-counting renames', () => {
  const html = renderStatsBar(false, [], [
    makeWorkbookSection('Added', 'add'),
    makeWorkbookSection('Deleted', 'delete'),
    makeWorkbookSection('OldName', 'rename', 'NewName', 'source'),
    makeWorkbookSection('NewName', 'rename', 'OldName', 'target'),
  ]);

  assert.match(html, /新增工作表/);
  assert.match(html, /删除工作表/);
  assert.match(html, /重命名工作表/);
  assert.match(html, /\+1/);
  assert.match(html, /-1/);
  assert.match(html, /\u21921/);
});

test('StatsBar uses generic file label for text diffs', () => {
  const html = renderStatsBar(false, [], [], {
    isWorkbookMode: false,
    fileName: 'openai_register3.py',
  });

  assert.match(html, /文件/);
  assert.doesNotMatch(html, /表格文件/);
  assert.match(html, /openai_register3\.py/);
});

test('StatsBar places the file name after both comparison versions', () => {
  const html = renderStatsBar(false, [], [], {
    fileName: 'ordered-workbook.xlsx',
  });

  const baseVersionIndex = html.indexOf('r1825384');
  const mineVersionIndex = html.indexOf('r1825385');
  const fileNameIndex = html.indexOf('ordered-workbook.xlsx');
  assert.ok(baseVersionIndex >= 0);
  assert.ok(mineVersionIndex > baseVersionIndex);
  assert.ok(fileNameIndex > mineVersionIndex);
});

test('StatsBar semantic pills use the same backgrounds and anchors as diff cells', () => {
  const html = renderStatsBar(false);

  assert.match(html, /--stats-chip-accent:var\(--diff-add-border\)/);
  assert.match(html, /--stats-chip-tint:var\(--diff-add-bg\)/);
  assert.match(html, /--stats-chip-accent:var\(--diff-remove-border\)/);
  assert.match(html, /--stats-chip-tint:var\(--diff-remove-bg\)/);
  assert.match(html, /--stats-chip-accent:var\(--diff-modify-border\)/);
  assert.match(html, /--stats-chip-tint:var\(--diff-modify-bg\)/);
});

test('StatsBar hides the goto shortcut hint when goto is unavailable', () => {
  const html = renderStatsBar(false, [], [], { showGotoShortcut: false });

  assert.doesNotMatch(html, /Ctrl\+G/);
  assert.match(html, /Ctrl\+F/);
});
