import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import StatsBar from '../src/components/navigation/StatsBar';
import type { DiffLine } from '../src/types';
import { I18nProvider } from '../src/context/i18n';
import { ThemeContext } from '../src/context/theme';
import { buildTextDiffPresentation } from '../src/engine/text/textChangeAlignment';
import { THEMES } from '../src/theme';

function renderStatsBar(showArtifactOnlyDiff: boolean, diffLines: DiffLine[] = []): string {
  return renderToStaticMarkup(
    React.createElement(
      ThemeContext.Provider,
      { value: THEMES.light },
      React.createElement(
        I18nProvider,
        null,
        React.createElement(StatsBar, {
          textDiffPresentation: buildTextDiffPresentation(diffLines),
          baseName: 'Base',
          mineName: 'Local',
          baseTitle: 'Compare Version',
          mineTitle: 'Working Copy',
          fileName: '[1]新物品表.xlsm',
          totalLines: 0,
          baseVersionLabel: 'r1825384',
          mineVersionLabel: 'r1825385',
          isWorkbookMode: true,
          workbookCompareMode: 'strict',
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
