import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import StatsBar from '../src/components/StatsBar';
import { I18nProvider } from '../src/context/i18n';
import { ThemeContext } from '../src/context/theme';
import { THEMES } from '../src/theme';

function renderStatsBar(showArtifactOnlyDiff: boolean): string {
  return renderToStaticMarkup(
    React.createElement(
      ThemeContext.Provider,
      { value: THEMES.light },
      React.createElement(
        I18nProvider,
        null,
        React.createElement(StatsBar, {
          diffLines: [],
          baseName: 'Base',
          mineName: 'Local',
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
