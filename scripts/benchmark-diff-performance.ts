import { performance } from 'node:perf_hooks';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

import { zipSync, strToU8 } from 'fflate';
import { _electron as electron } from 'playwright';

type LayoutMode = 'unified' | 'split-h' | 'split-v';
type WorkbookCompareMode = 'strict' | 'content';
type LoadPhase = 'bootstrapping' | 'idle' | 'loading' | 'ready' | 'error';

interface DiffPerformanceMetrics {
  source: 'cli' | 'revision-switch' | 'local-dev';
  mainLoadMs?: number;
  baseReadMs?: number;
  mineReadMs?: number;
  baseParserMs?: number;
  mineParserMs?: number;
  baseBytes?: number;
  mineBytes?: number;
  textResolveMs?: number;
  metadataMs?: number;
  diffMs?: number;
  rustDiffMs?: number;
  totalAppMs?: number;
  diffLineCount?: number;
}

interface PerfBridgeSnapshot {
  hasLoadedDiff: boolean;
  isLoadingDiff: boolean;
  loadPhase: LoadPhase;
  layout: LayoutMode;
  isWorkbookMode: boolean;
  compareMode: WorkbookCompareMode;
  fileName: string;
  activeWorkbookSheetName: string | null;
  viewReadyToken: number;
  loadPerfMetrics: DiffPerformanceMetrics | null;
}

type PerfBridgeEventName =
  | 'layout-change:start'
  | 'workbook-compare-mode:start'
  | 'diff-payload:request'
  | 'diff-payload:ready'
  | 'apply-diff-data:start'
  | 'apply-diff-data:commit'
  | 'view-ready';

interface PerfBridgeEvent {
  id: number;
  at: number;
  name: PerfBridgeEventName;
  details?: Record<string, unknown>;
}

interface TransitionBreakdown {
  bridgeTotalMs?: number;
  payloadWaitMs?: number;
  applyMs?: number;
  commitToViewReadyMs?: number;
}

interface BenchMeasurement {
  launchReadyMs: number;
  splitHReadyMs?: number;
  contentModeReadyMs?: number;
  initialLayout: LayoutMode;
  initialCompareMode: WorkbookCompareMode;
  normalizationToUnifiedMs?: number;
  normalizationToStrictMs?: number;
  initialReadyBreakdown?: TransitionBreakdown;
  normalizationToUnifiedBreakdown?: TransitionBreakdown;
  splitHBreakdown?: TransitionBreakdown;
  contentModeBreakdown?: TransitionBreakdown;
  snapshot: PerfBridgeSnapshot;
}

interface ScenarioResult {
  name: string;
  iterations: BenchMeasurement[];
}

interface SummaryMetric {
  avg: number;
  min: number;
  max: number;
}

const rootDir = path.resolve(__dirname, '..');
const rendererIndexPath = path.join(rootDir, 'dist', 'index.html');
const electronMainPath = path.join(rootDir, 'dist-electron', 'main.js');
const electronPreloadPath = path.join(rootDir, 'dist-electron', 'preload.js');
const layoutTestIds: Record<LayoutMode, string> = {
  unified: 'toolbar-layout-unified',
  'split-h': 'toolbar-layout-split-h',
  'split-v': 'toolbar-layout-split-v',
};
const compareModeTestIds: Record<WorkbookCompareMode, string> = {
  strict: 'toolbar-compare-strict',
  content: 'toolbar-compare-content',
};

function parseIterations(): number {
  const raw = process.argv.find((argument) => argument.startsWith('--iterations='))?.split('=')[1]
    ?? process.argv[process.argv.indexOf('--iterations') + 1]
    ?? '3';
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : 3;
}

function formatMs(value: number): string {
  return `${value.toFixed(1)}ms`;
}

function summarize(values: number[]): SummaryMetric {
  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    avg: total / values.length,
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

function summarizeOptional(values: Array<number | undefined>): SummaryMetric | undefined {
  const filtered = values.filter((value): value is number => typeof value === 'number');
  return filtered.length > 0 ? summarize(filtered) : undefined;
}

function buildWorkbookZip(sheetName: string, rows: string[][]): Uint8Array {
  const sheetRows = rows.map((cells, rowIndex) => {
    const cellXml = cells.map((value, columnIndex) => {
      const columnLabel = toColumnLabel(columnIndex + 1);
      return `<c r="${columnLabel}${rowIndex + 1}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
    }).join('');
    return `<row r="${rowIndex + 1}">${cellXml}</row>`;
  }).join('');

  return zipSync({
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?>
      <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
        <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" />
        <Default Extension="xml" ContentType="application/xml" />
        <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml" />
        <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml" />
      </Types>`),
    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml" />
      </Relationships>`),
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?>
      <workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
        <sheets>
          <sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1" />
        </sheets>
      </workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml" />
      </Relationships>`),
    'xl/worksheets/sheet1.xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?>
      <worksheet><sheetData>${sheetRows}</sheetData></worksheet>`),
  });
}

function toColumnLabel(column: number): string {
  let current = column;
  let label = '';
  while (current > 0) {
    const remainder = (current - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    current = Math.floor((current - 1) / 26);
  }
  return label;
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&apos;');
}

async function ensureBuiltArtifacts() {
  const candidates = [rendererIndexPath, electronMainPath, electronPreloadPath];
  const available = await Promise.all(candidates.map(async (targetPath) => ({
    targetPath,
    exists: await fileExists(targetPath),
  })));
  const missing = available
    .filter((entry) => !entry.exists)
    .map((entry) => entry.targetPath);
  if (missing.length > 0) {
    throw new Error(
      `Missing built artifacts:\n${missing.map((targetPath) => `- ${targetPath}`).join('\n')}\n` +
      'Please run "npm run build:renderer && npm run build:electron" first.',
    );
  }
}

async function fileExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function createBenchmarkSamples(tempDir: string) {
  const textBasePath = path.join(tempDir, 'large-base.ts');
  const textMinePath = path.join(tempDir, 'large-mine.ts');
  const workbookBasePath = path.join(tempDir, 'large-base.xlsx');
  const workbookMinePath = path.join(tempDir, 'large-mine.xlsx');

  const textBaseLines = Array.from({ length: 24_000 }, (_, index) => (
    index % 40 === 0
      ? `export function feature_${index}(input: string) {`
      : index % 40 === 1
        ? `  return input + '-${index % 11}';`
        : index % 40 === 2
          ? '}'
          : `const value_${index} = 'line-${index % 97}';`
  ));
  const textMineLines = [...textBaseLines];
  for (let index = 300; index < textMineLines.length; index += 900) {
    textMineLines[index] = `const value_${index} = 'updated-${index % 113}';`;
    if (textMineLines[index + 1]) {
      textMineLines[index + 1] = `const derived_${index} = value_${index}.toUpperCase();`;
    }
  }
  textMineLines.splice(5_000, 0, ...Array.from({ length: 120 }, (_, index) => `const inserted_${index} = ${index};`));

  await fs.writeFile(textBasePath, textBaseLines.join('\n'), 'utf-8');
  await fs.writeFile(textMinePath, textMineLines.join('\n'), 'utf-8');

  const workbookBaseRows = buildWorkbookRows({ changed: false });
  const workbookMineRows = buildWorkbookRows({ changed: true });
  await fs.writeFile(workbookBasePath, Buffer.from(buildWorkbookZip('Bench', workbookBaseRows)));
  await fs.writeFile(workbookMinePath, Buffer.from(buildWorkbookZip('Bench', workbookMineRows)));

  return {
    textBasePath,
    textMinePath,
    workbookBasePath,
    workbookMinePath,
  };
}

function buildWorkbookRows(options: { changed: boolean }): string[][] {
  const rows: string[][] = [['ID', 'Category', 'Owner', 'Status', 'Amount', 'UpdatedAt', 'Notes', 'Flag']];
  for (let rowIndex = 1; rowIndex <= 2_200; rowIndex += 1) {
    rows.push([
      `ID-${rowIndex.toString().padStart(5, '0')}`,
      `Category-${rowIndex % 18}`,
      `Owner-${rowIndex % 23}`,
      options.changed && rowIndex % 170 === 0 ? 'In Review' : (rowIndex % 5 === 0 ? 'Closed' : 'Open'),
      String((rowIndex * 17) % 10_000),
      `2026-04-${((rowIndex % 28) + 1).toString().padStart(2, '0')}`,
      options.changed && rowIndex % 125 === 0
        ? `Updated workbook note ${rowIndex}`
        : `Workbook note ${rowIndex % 37}`,
      options.changed && rowIndex % 250 === 0 ? 'Y' : 'N',
    ]);
  }
  return rows;
}

async function writeExternalDiffRequest(
  tempDir: string,
  basePath: string,
  minePath: string,
): Promise<string> {
  const requestPath = path.join(tempDir, `external-diff-request-${Date.now()}.json`);
  await fs.writeFile(requestPath, JSON.stringify({
    version: 1,
    basePath,
    minePath,
    baseName: path.basename(basePath),
    mineName: path.basename(minePath),
    fileName: path.basename(minePath || basePath),
  }), 'utf-8');
  return requestPath;
}

async function getPerfSnapshot(page: import('playwright').Page): Promise<PerfBridgeSnapshot> {
  const snapshot = await page.evaluate<PerfBridgeSnapshot | null>(() => {
    const bridgeHost = globalThis as unknown as {
      __SVN_DIFF_PERF__?: { getSnapshot(): PerfBridgeSnapshot | null };
    };
    return bridgeHost.__SVN_DIFF_PERF__?.getSnapshot() ?? null;
  });
  if (!snapshot) {
    throw new Error('Performance bridge snapshot is unavailable.');
  }
  return snapshot as PerfBridgeSnapshot;
}

async function getPerfEvents(page: import('playwright').Page): Promise<PerfBridgeEvent[]> {
  return page.evaluate<PerfBridgeEvent[]>(() => {
    const bridgeHost = globalThis as unknown as {
      __SVN_DIFF_PERF__?: { getEvents?(): PerfBridgeEvent[] };
    };
    return bridgeHost.__SVN_DIFF_PERF__?.getEvents?.() ?? [];
  });
}

async function clearPerfEvents(page: import('playwright').Page): Promise<void> {
  await page.evaluate(() => {
    const bridgeHost = globalThis as unknown as {
      __SVN_DIFF_PERF__?: { clearEvents?(): void };
    };
    bridgeHost.__SVN_DIFF_PERF__?.clearEvents?.();
  });
}

async function getPageNow(page: import('playwright').Page): Promise<number> {
  return page.evaluate(() => globalThis.performance?.now() ?? Date.now());
}

function findEvent(
  events: PerfBridgeEvent[],
  name: PerfBridgeEventName,
  predicate?: (event: PerfBridgeEvent) => boolean,
): PerfBridgeEvent | null {
  for (const event of events) {
    if (event.name !== name) continue;
    if (predicate && !predicate(event)) continue;
    return event;
  }
  return null;
}

function findEventAfter(
  events: PerfBridgeEvent[],
  name: PerfBridgeEventName,
  afterId: number,
  predicate?: (event: PerfBridgeEvent) => boolean,
): PerfBridgeEvent | null {
  return findEvent(
    events,
    name,
    (event) => event.id >= afterId && (!predicate || predicate(event)),
  );
}

function durationBetween(start: PerfBridgeEvent | null, end: PerfBridgeEvent | null): number | undefined {
  if (!start || !end) return undefined;
  return end.at - start.at;
}

function buildLaunchBreakdown(events: PerfBridgeEvent[]): TransitionBreakdown | undefined {
  const payloadRequest = findEvent(events, 'diff-payload:request', (event) => event.details?.reason === 'launch');
  const payloadReady = findEventAfter(events, 'diff-payload:ready', payloadRequest?.id ?? 0, (event) => event.details?.reason === 'launch');
  const applyStart = findEvent(events, 'apply-diff-data:start');
  const applyCommit = findEventAfter(events, 'apply-diff-data:commit', applyStart?.id ?? 0);
  const viewReady = findEventAfter(events, 'view-ready', applyCommit?.id ?? applyStart?.id ?? 0);

  const breakdown: TransitionBreakdown = {};
  const payloadWaitMs = durationBetween(payloadRequest, payloadReady);
  const applyMs = durationBetween(applyStart, applyCommit);
  const commitToViewReadyMs = durationBetween(applyCommit, viewReady);
  const bridgeTotalMs = durationBetween(applyStart, viewReady);

  if (typeof payloadWaitMs === 'number') breakdown.payloadWaitMs = payloadWaitMs;
  if (typeof applyMs === 'number') breakdown.applyMs = applyMs;
  if (typeof commitToViewReadyMs === 'number') breakdown.commitToViewReadyMs = commitToViewReadyMs;
  if (typeof bridgeTotalMs === 'number') breakdown.bridgeTotalMs = bridgeTotalMs;

  return Object.keys(breakdown).length > 0 ? breakdown : undefined;
}

function buildLayoutBreakdown(events: PerfBridgeEvent[]): TransitionBreakdown | undefined {
  const layoutStart = findEvent(events, 'layout-change:start');
  const viewReady = findEventAfter(events, 'view-ready', layoutStart?.id ?? 0);
  const bridgeTotalMs = durationBetween(layoutStart, viewReady);
  if (typeof bridgeTotalMs !== 'number') return undefined;
  return { bridgeTotalMs };
}

function buildWorkbookCompareBreakdown(events: PerfBridgeEvent[]): TransitionBreakdown | undefined {
  const compareStart = findEvent(events, 'workbook-compare-mode:start');
  const payloadRequest = findEventAfter(
    events,
    'diff-payload:request',
    compareStart?.id ?? 0,
    (event) => event.details?.reason === 'workbook-compare-mode',
  );
  const payloadReady = findEventAfter(
    events,
    'diff-payload:ready',
    payloadRequest?.id ?? compareStart?.id ?? 0,
    (event) => event.details?.reason === 'workbook-compare-mode',
  );
  const applyStart = findEventAfter(events, 'apply-diff-data:start', compareStart?.id ?? 0);
  const applyCommit = findEventAfter(events, 'apply-diff-data:commit', applyStart?.id ?? 0);
  const viewReady = findEventAfter(events, 'view-ready', applyCommit?.id ?? applyStart?.id ?? compareStart?.id ?? 0);

  const breakdown: TransitionBreakdown = {};
  const payloadWaitMs = durationBetween(payloadRequest, payloadReady);
  const applyMs = durationBetween(applyStart, applyCommit);
  const commitToViewReadyMs = durationBetween(applyCommit, viewReady);
  const bridgeTotalMs = durationBetween(compareStart, viewReady);

  if (typeof payloadWaitMs === 'number') breakdown.payloadWaitMs = payloadWaitMs;
  if (typeof applyMs === 'number') breakdown.applyMs = applyMs;
  if (typeof commitToViewReadyMs === 'number') breakdown.commitToViewReadyMs = commitToViewReadyMs;
  if (typeof bridgeTotalMs === 'number') breakdown.bridgeTotalMs = bridgeTotalMs;

  return Object.keys(breakdown).length > 0 ? breakdown : undefined;
}

async function waitForReadySnapshot(
  page: import('playwright').Page,
  minimumToken: number,
  expected: Partial<Pick<PerfBridgeSnapshot, 'layout' | 'compareMode' | 'isWorkbookMode'>>,
): Promise<PerfBridgeSnapshot> {
  await page.waitForFunction(
    ({ token, expectedSnapshot }: {
      token: number;
      expectedSnapshot: Partial<Pick<PerfBridgeSnapshot, 'layout' | 'compareMode' | 'isWorkbookMode'>>;
    }) => {
      const bridgeHost = globalThis as unknown as {
        __SVN_DIFF_PERF__?: { getSnapshot(): PerfBridgeSnapshot | null };
      };
      const snapshot = bridgeHost.__SVN_DIFF_PERF__?.getSnapshot() ?? null;
      if (!snapshot) return false;
      if (!snapshot.hasLoadedDiff || snapshot.isLoadingDiff || snapshot.loadPhase !== 'ready') return false;
      if (snapshot.viewReadyToken <= token) return false;

      if (expectedSnapshot.layout && snapshot.layout !== expectedSnapshot.layout) return false;
      if (expectedSnapshot.compareMode && snapshot.compareMode !== expectedSnapshot.compareMode) return false;
      if (typeof expectedSnapshot.isWorkbookMode === 'boolean' && snapshot.isWorkbookMode !== expectedSnapshot.isWorkbookMode) {
        return false;
      }

      return true;
    },
    { token: minimumToken, expectedSnapshot: expected },
    { timeout: 120_000 },
  );
  return getPerfSnapshot(page);
}

async function measureTransition(
  page: import('playwright').Page,
  snapshot: PerfBridgeSnapshot,
  expected: Partial<Pick<PerfBridgeSnapshot, 'layout' | 'compareMode' | 'isWorkbookMode'>>,
  action: () => Promise<void>,
): Promise<{ durationMs: number; snapshot: PerfBridgeSnapshot }> {
  const transitionStart = await getPageNow(page);
  await action();
  const readySnapshot = await waitForReadySnapshot(page, snapshot.viewReadyToken, expected);
  const transitionEnd = await getPageNow(page);
  return {
    durationMs: transitionEnd - transitionStart,
    snapshot: readySnapshot,
  };
}

async function switchTextLayout(
  page: import('playwright').Page,
  snapshot: PerfBridgeSnapshot,
  targetLayout: LayoutMode,
): Promise<{ durationMs: number; snapshot: PerfBridgeSnapshot }> {
  if (snapshot.layout === targetLayout) {
    return {
      durationMs: 0,
      snapshot,
    };
  }

  return measureTransition(
    page,
    snapshot,
    {
      layout: targetLayout,
      isWorkbookMode: false,
    },
    async () => {
      await page.getByTestId(layoutTestIds[targetLayout]).click();
    },
  );
}

async function switchWorkbookCompareMode(
  page: import('playwright').Page,
  snapshot: PerfBridgeSnapshot,
  targetCompareMode: WorkbookCompareMode,
): Promise<{ durationMs: number; snapshot: PerfBridgeSnapshot }> {
  if (snapshot.compareMode === targetCompareMode) {
    return {
      durationMs: 0,
      snapshot,
    };
  }

  return measureTransition(
    page,
    snapshot,
    {
      compareMode: targetCompareMode,
      isWorkbookMode: true,
    },
    async () => {
      await page.getByTestId('toolbar-view-menu').click();
      await page.getByTestId(compareModeTestIds[targetCompareMode]).click();
    },
  );
}

async function measureLaunchAndReady(
  basePath: string,
  minePath: string,
  action: (
    page: import('playwright').Page,
    snapshot: PerfBridgeSnapshot,
    launchEvents: PerfBridgeEvent[],
  ) => Promise<BenchMeasurement>,
): Promise<BenchMeasurement> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'svn-diff-bench-'));
  const requestPath = await writeExternalDiffRequest(tempDir, basePath, minePath);
  const profileDir = path.join(tempDir, 'profile');
  const launchStart = performance.now();
  const rawEnv: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: 'production',
    ELECTRON_DEV_PROFILE_DIR: profileDir,
    SVN_DIFF_PERF_BRIDGE: '1',
    SVN_DIFF_DEBUG_LOG: '1',
    SVN_DIFF_DEBUG_TIMING: '1',
    SVN_DIFF_AUTO_EXIT_AFTER_LOAD_MS: '0',
  };
  delete rawEnv.ELECTRON_RUN_AS_NODE;
  const childEnv = Object.fromEntries(
    Object.entries(rawEnv).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );

  const app = await electron.launch({
    args: ['.', `--external-diff-request=${requestPath}`],
    cwd: rootDir,
    env: childEnv,
  });

  try {
    const page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded', { timeout: 120_000 });
    await page.waitForFunction(() => {
      const bridgeHost = globalThis as unknown as {
        __SVN_DIFF_PERF__?: { getSnapshot(): PerfBridgeSnapshot | null };
      };
      return typeof bridgeHost.__SVN_DIFF_PERF__?.getSnapshot === 'function';
    }, null, { timeout: 120_000 });

    const initialSnapshot = await waitForReadySnapshot(page, 0, {});
    const launchEvents = await getPerfEvents(page);
    const launchReadyMs = performance.now() - launchStart;
    const measurement = await action(page, initialSnapshot, launchEvents);
    return {
      ...measurement,
      launchReadyMs,
    };
  } finally {
    await app.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function measureTextScenario(basePath: string, minePath: string): Promise<BenchMeasurement> {
  return measureLaunchAndReady(basePath, minePath, async (page, initialSnapshot, launchEvents) => {
    const initialLayout = initialSnapshot.layout;
    const initialCompareMode = initialSnapshot.compareMode;
    const initialReadyBreakdown = buildLaunchBreakdown(launchEvents);

    await clearPerfEvents(page);
    const unifiedTransition = await switchTextLayout(page, initialSnapshot, 'unified');
    const normalizationEvents = await getPerfEvents(page);
    const normalizationToUnifiedBreakdown = buildLayoutBreakdown(normalizationEvents);

    await clearPerfEvents(page);
    const splitTransition = await switchTextLayout(page, unifiedTransition.snapshot, 'split-h');
    const splitEvents = await getPerfEvents(page);
    const splitHBreakdown = buildLayoutBreakdown(splitEvents);

    return {
      snapshot: splitTransition.snapshot,
      splitHReadyMs: splitTransition.durationMs,
      launchReadyMs: 0,
      initialLayout,
      initialCompareMode,
      ...(initialReadyBreakdown ? { initialReadyBreakdown } : {}),
      ...(normalizationToUnifiedBreakdown ? { normalizationToUnifiedBreakdown } : {}),
      ...(splitHBreakdown ? { splitHBreakdown } : {}),
      ...(unifiedTransition.durationMs > 0 ? { normalizationToUnifiedMs: unifiedTransition.durationMs } : {}),
    };
  });
}

async function measureWorkbookScenario(basePath: string, minePath: string): Promise<BenchMeasurement> {
  return measureLaunchAndReady(basePath, minePath, async (page, initialSnapshot, launchEvents) => {
    const initialLayout = initialSnapshot.layout;
    const initialCompareMode = initialSnapshot.compareMode;
    const initialReadyBreakdown = buildLaunchBreakdown(launchEvents);

    await clearPerfEvents(page);
    const strictTransition = await switchWorkbookCompareMode(page, initialSnapshot, 'strict');
    await clearPerfEvents(page);
    const contentTransition = await switchWorkbookCompareMode(page, strictTransition.snapshot, 'content');
    const contentEvents = await getPerfEvents(page);
    const contentModeBreakdown = buildWorkbookCompareBreakdown(contentEvents);

    return {
      snapshot: contentTransition.snapshot,
      contentModeReadyMs: contentTransition.durationMs,
      launchReadyMs: 0,
      initialLayout,
      initialCompareMode,
      ...(initialReadyBreakdown ? { initialReadyBreakdown } : {}),
      ...(contentModeBreakdown ? { contentModeBreakdown } : {}),
      ...(strictTransition.durationMs > 0 ? { normalizationToStrictMs: strictTransition.durationMs } : {}),
    };
  });
}

async function runScenario(
  name: string,
  iterations: number,
  run: () => Promise<BenchMeasurement>,
): Promise<ScenarioResult> {
  const measurements: BenchMeasurement[] = [];
  for (let index = 0; index < iterations; index += 1) {
    process.stdout.write(`[benchmark] ${name} (${index + 1}/${iterations})...\n`);
    measurements.push(await run());
  }
  return {
    name,
    iterations: measurements,
  };
}

function printScenarioSummary(result: ScenarioResult) {
  const launchSummary = summarize(result.iterations.map((entry) => entry.launchReadyMs));
  process.stdout.write(`\n[${result.name}] initial ready: avg ${formatMs(launchSummary.avg)} | min ${formatMs(launchSummary.min)} | max ${formatMs(launchSummary.max)}\n`);

  const startingLayouts = Array.from(new Set(result.iterations.map((entry) => entry.initialLayout)));
  process.stdout.write(`[${result.name}] initial layout(s): ${startingLayouts.join(', ')}\n`);

  const initialBridgeSummary = summarizeOptional(result.iterations.map((entry) => entry.initialReadyBreakdown?.bridgeTotalMs));
  if (initialBridgeSummary) {
    process.stdout.write(
      `[${result.name}] initial renderer ready: avg ${formatMs(initialBridgeSummary.avg)} | min ${formatMs(initialBridgeSummary.min)} | max ${formatMs(initialBridgeSummary.max)}\n`,
    );
  }

  const initialPayloadSummary = summarizeOptional(result.iterations.map((entry) => entry.initialReadyBreakdown?.payloadWaitMs));
  if (initialPayloadSummary) {
    process.stdout.write(
      `[${result.name}] initial payload wait: avg ${formatMs(initialPayloadSummary.avg)} | min ${formatMs(initialPayloadSummary.min)} | max ${formatMs(initialPayloadSummary.max)}\n`,
    );
  }

  const initialApplySummary = summarizeOptional(result.iterations.map((entry) => entry.initialReadyBreakdown?.applyMs));
  if (initialApplySummary) {
    process.stdout.write(
      `[${result.name}] initial apply commit: avg ${formatMs(initialApplySummary.avg)} | min ${formatMs(initialApplySummary.min)} | max ${formatMs(initialApplySummary.max)}\n`,
    );
  }

  const initialPaintSummary = summarizeOptional(result.iterations.map((entry) => entry.initialReadyBreakdown?.commitToViewReadyMs));
  if (initialPaintSummary) {
    process.stdout.write(
      `[${result.name}] initial commit -> view-ready: avg ${formatMs(initialPaintSummary.avg)} | min ${formatMs(initialPaintSummary.min)} | max ${formatMs(initialPaintSummary.max)}\n`,
    );
  }

  const splitValues = result.iterations
    .map((entry) => entry.splitHReadyMs)
    .filter((value): value is number => typeof value === 'number');
  if (splitValues.length > 0) {
    const splitSummary = summarize(splitValues);
    process.stdout.write(`[${result.name}] split-h ready: avg ${formatMs(splitSummary.avg)} | min ${formatMs(splitSummary.min)} | max ${formatMs(splitSummary.max)}\n`);
  }

  const normalizationLayoutValues = result.iterations
    .map((entry) => entry.normalizationToUnifiedMs)
    .filter((value): value is number => typeof value === 'number');
  if (normalizationLayoutValues.length > 0) {
    const normalizationLayoutSummary = summarize(normalizationLayoutValues);
    process.stdout.write(
      `[${result.name}] normalize -> unified: avg ${formatMs(normalizationLayoutSummary.avg)} | min ${formatMs(normalizationLayoutSummary.min)} | max ${formatMs(normalizationLayoutSummary.max)}\n`,
    );
  }

  const normalizationBridgeSummary = summarizeOptional(result.iterations.map((entry) => entry.normalizationToUnifiedBreakdown?.bridgeTotalMs));
  if (normalizationBridgeSummary) {
    process.stdout.write(
      `[${result.name}] normalize bridge total: avg ${formatMs(normalizationBridgeSummary.avg)} | min ${formatMs(normalizationBridgeSummary.min)} | max ${formatMs(normalizationBridgeSummary.max)}\n`,
    );
  }

  const splitBridgeSummary = summarizeOptional(result.iterations.map((entry) => entry.splitHBreakdown?.bridgeTotalMs));
  if (splitBridgeSummary) {
    process.stdout.write(
      `[${result.name}] split-h bridge total: avg ${formatMs(splitBridgeSummary.avg)} | min ${formatMs(splitBridgeSummary.min)} | max ${formatMs(splitBridgeSummary.max)}\n`,
    );
  }

  const compareValues = result.iterations
    .map((entry) => entry.contentModeReadyMs)
    .filter((value): value is number => typeof value === 'number');
  if (compareValues.length > 0) {
    const compareSummary = summarize(compareValues);
    process.stdout.write(`[${result.name}] content mode ready: avg ${formatMs(compareSummary.avg)} | min ${formatMs(compareSummary.min)} | max ${formatMs(compareSummary.max)}\n`);
  }

  const startingCompareModes = Array.from(new Set(result.iterations.map((entry) => entry.initialCompareMode)));
  process.stdout.write(`[${result.name}] initial compare mode(s): ${startingCompareModes.join(', ')}\n`);

  const normalizationCompareValues = result.iterations
    .map((entry) => entry.normalizationToStrictMs)
    .filter((value): value is number => typeof value === 'number');
  if (normalizationCompareValues.length > 0) {
    const normalizationCompareSummary = summarize(normalizationCompareValues);
    process.stdout.write(
      `[${result.name}] normalize -> strict: avg ${formatMs(normalizationCompareSummary.avg)} | min ${formatMs(normalizationCompareSummary.min)} | max ${formatMs(normalizationCompareSummary.max)}\n`,
    );
  }

  const compareBridgeSummary = summarizeOptional(result.iterations.map((entry) => entry.contentModeBreakdown?.bridgeTotalMs));
  if (compareBridgeSummary) {
    process.stdout.write(
      `[${result.name}] content bridge total: avg ${formatMs(compareBridgeSummary.avg)} | min ${formatMs(compareBridgeSummary.min)} | max ${formatMs(compareBridgeSummary.max)}\n`,
    );
  }

  const comparePayloadSummary = summarizeOptional(result.iterations.map((entry) => entry.contentModeBreakdown?.payloadWaitMs));
  if (comparePayloadSummary) {
    process.stdout.write(
      `[${result.name}] content payload wait: avg ${formatMs(comparePayloadSummary.avg)} | min ${formatMs(comparePayloadSummary.min)} | max ${formatMs(comparePayloadSummary.max)}\n`,
    );
  }

  const compareApplySummary = summarizeOptional(result.iterations.map((entry) => entry.contentModeBreakdown?.applyMs));
  if (compareApplySummary) {
    process.stdout.write(
      `[${result.name}] content apply commit: avg ${formatMs(compareApplySummary.avg)} | min ${formatMs(compareApplySummary.min)} | max ${formatMs(compareApplySummary.max)}\n`,
    );
  }

  const comparePaintSummary = summarizeOptional(result.iterations.map((entry) => entry.contentModeBreakdown?.commitToViewReadyMs));
  if (comparePaintSummary) {
    process.stdout.write(
      `[${result.name}] content commit -> view-ready: avg ${formatMs(comparePaintSummary.avg)} | min ${formatMs(comparePaintSummary.min)} | max ${formatMs(comparePaintSummary.max)}\n`,
    );
  }

  const latestMetrics = result.iterations.at(-1)?.snapshot.loadPerfMetrics ?? null;
  if (latestMetrics) {
    process.stdout.write(
      `[${result.name}] latest perf: main=${formatMs(latestMetrics.mainLoadMs ?? 0)} ` +
      `diff=${formatMs(latestMetrics.diffMs ?? latestMetrics.rustDiffMs ?? 0)} ` +
      `total=${formatMs(latestMetrics.totalAppMs ?? 0)} ` +
      `lines=${latestMetrics.diffLineCount ?? 'n/a'}\n`,
    );
  }
}

async function main() {
  const iterations = parseIterations();
  await ensureBuiltArtifacts();

  const sampleDir = await fs.mkdtemp(path.join(os.tmpdir(), 'svn-diff-perf-samples-'));
  try {
    const samples = await createBenchmarkSamples(sampleDir);
    const textScenario = await runScenario(
      'large-text',
      iterations,
      () => measureTextScenario(samples.textBasePath, samples.textMinePath),
    );
    const workbookScenario = await runScenario(
      'large-workbook',
      iterations,
      () => measureWorkbookScenario(samples.workbookBasePath, samples.workbookMinePath),
    );

    printScenarioSummary(textScenario);
    printScenarioSummary(workbookScenario);

    const report = {
      generatedAt: new Date().toISOString(),
      iterations,
      scenarios: [textScenario, workbookScenario],
    };
    const reportDir = path.join(rootDir, 'logs');
    await fs.mkdir(reportDir, { recursive: true });
    const reportPath = path.join(reportDir, `perf-benchmark-${Date.now()}.json`);
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf-8');
    process.stdout.write(`\n[benchmark] report written: ${reportPath}\n`);
  } finally {
    await fs.rm(sampleDir, { recursive: true, force: true });
  }
}

void main().catch((error) => {
  console.error('[benchmark] failed:', error);
  process.exitCode = 1;
});
