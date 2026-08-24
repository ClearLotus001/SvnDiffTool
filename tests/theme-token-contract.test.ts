import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  getThemeTokensSnapshot,
  resolveThemeTokensFromCssVariables,
  type ThemeKey,
} from '../src/theme';

function readThemeCssVariables(css: string, themeKey: ThemeKey): Map<string, string> {
  const block = css.match(new RegExp(`\\.theme-${themeKey}\\s*\\{([\\s\\S]*?)\\n\\}`))?.[1] ?? '';
  return new Map(
    [...block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)]
      .map((match) => [match[1]!, match[2]!.trim()]),
  );
}

test('Canvas theme snapshots stay synchronized with the base CSS theme variables', () => {
  const css = fs.readFileSync('src/styles/app.css', 'utf8');

  for (const themeKey of ['dark', 'light', 'hc'] as const) {
    const variables = readThemeCssVariables(css, themeKey);
    const resolved = resolveThemeTokensFromCssVariables(
      themeKey,
      (variableName) => variables.get(variableName) ?? '',
    );
    assert.deepEqual(getThemeTokensSnapshot(themeKey), resolved, themeKey);
  }
});
