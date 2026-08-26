import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('renderer performance metrics distinguish apply work from request latency', () => {
  const metricTypes = fs.readFileSync('src/types/diff.ts', 'utf8');
  const loader = fs.readFileSync('src/hooks/app/useDiffLoader.ts', 'utf8');
  const perfBar = fs.readFileSync('src/components/app/PerfBar.tsx', 'utf8');

  for (const source of [metricTypes, loader, perfBar]) {
    assert.doesNotMatch(source, /totalAppMs/);
  }
  assert.match(metricTypes, /rendererApplyMs\?: number/);
  assert.match(metricTypes, /requestToCommitMs\?: number/);
  assert.match(loader, /loadStartedAtBySeqRef/);
  assert.match(perfBar, /metrics\.rendererApplyMs/);
  assert.match(perfBar, /metrics\.requestToCommitMs/);
});

test('Electron benchmark measures workbook mode after opening the menu and enforces CI budgets', () => {
  const benchmark = fs.readFileSync('scripts/benchmark-diff-performance.ts', 'utf8');
  const switchStart = benchmark.indexOf('async function switchWorkbookCompareMode');
  const switchEnd = benchmark.indexOf('async function measureLaunchAndReady');
  const switchSource = benchmark.slice(switchStart, switchEnd);

  assert.ok(switchSource.indexOf("getByTestId('toolbar-view-menu').click()") < switchSource.indexOf('measureTransition('));
  assert.match(benchmark, /CI_PERFORMANCE_BUDGETS/);
  assert.match(benchmark, /assertCiPerformanceBudgets/);
  assert.match(benchmark, /CI performance budgets passed/);
});
