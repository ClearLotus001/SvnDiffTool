import { app, BrowserWindow, clipboard, dialog, nativeTheme, ipcMain, shell } from 'electron';
import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { performance } from 'node:perf_hooks';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { XMLParser } from 'fast-xml-parser';
import { configureSvnDiffViewer, getSvnDiffViewerStatus, type SvnDiffViewerScope } from './svnDiffViewerConfig';
import { detectWorkbookArtifactOnlyDiff, type WorkbookArtifactDiffSummary } from './workbookArtifactDiff';
import { ensureLegacyUserDataMigration } from './userDataMigration';
import { createPlatformUpdater } from './updater';
import type { AppUpdateState } from './updater/types';

interface CliArgs {
  basePath: string;
  minePath: string;
  baseName: string;
  mineName: string;
  svnUrl: string;
  fileName: string;
}

type SvnRevisionSourceKind = 'revision' | 'working-copy' | 'input-file';
type WorkbookCompareMode = 'strict' | 'content';

interface SvnRevisionInfo {
  id: string;
  revision: string;
  title: string;
  author: string;
  date: string;
  message: string;
  kind: SvnRevisionSourceKind;
}

interface RevisionOptionsQuery {
  limit?: number;
  beforeRevisionId?: string;
  anchorDateTime?: string;
  includeSpecials?: boolean;
}

interface RevisionOptionsPayload {
  items: SvnRevisionInfo[];
  hasMore: boolean;
  nextBeforeRevisionId: string | null;
  anchorRevisionId: string | null;
  queryDateTime: string | null;
}

interface DiffData {
  baseName: string;
  mineName: string;
  svnUrl: string;
  fileName: string;
  baseContent: string | null;
  mineContent: string | null;
  baseBytes: Uint8Array | null;
  mineBytes: Uint8Array | null;
  precomputedDiffLines: DiffLine[] | null;
  precomputedWorkbookDelta: WorkbookPrecomputedDeltaPayload | null;
  precomputedDiffLinesByMode: Partial<Record<WorkbookCompareMode, DiffLine[] | null>> | null;
  precomputedWorkbookDeltaByMode: Partial<Record<WorkbookCompareMode, WorkbookPrecomputedDeltaPayload | null>> | null;
  baseWorkbookMetadata: WorkbookMetadataMap | null;
  mineWorkbookMetadata: WorkbookMetadataMap | null;
  revisionOptions: SvnRevisionInfo[] | null;
  baseRevisionInfo: SvnRevisionInfo | null;
  mineRevisionInfo: SvnRevisionInfo | null;
  canSwitchRevisions: boolean;
  workbookArtifactDiff: WorkbookArtifactDiffSummary | null;
  sourceNoticeCode: 'unversioned-working-copy' | null;
  perf: DiffPerformanceMetrics | null;
}

interface DiffPerformanceMetrics {
  source: 'cli' | 'revision-switch' | 'local-dev';
  mainLoadMs?: number;
  baseReadMs?: number;
  mineReadMs?: number;
  baseParserMs?: number;
  mineParserMs?: number;
  metadataMs?: number;
  rustDiffMs?: number;
  baseBytes?: number;
  mineBytes?: number;
}

interface BuildDiffDataOptions {
  baseRevisionId?: string | undefined;
  mineRevisionId?: string | undefined;
  workbookCompareMode?: WorkbookCompareMode;
  includeRevisionOptions?: boolean;
  revisionOptionsOverride?: SvnRevisionInfo[] | null;
}

interface ReadFilePayloadOptions {
  includeWorkbookText?: boolean;
  includeWorkbookBytes?: boolean;
  includeWorkbookMetadata?: boolean;
}

interface WorkbookCompareModePayload {
  compareMode: WorkbookCompareMode;
  diffLines: DiffLine[] | null;
  workbookDelta: WorkbookPrecomputedDeltaPayload | null;
  perf: Pick<DiffPerformanceMetrics, 'rustDiffMs'> | null;
}

interface WorkbookMetadataPayload {
  base: WorkbookMetadataMap | null;
  mine: WorkbookMetadataMap | null;
  perf: Pick<DiffPerformanceMetrics, 'metadataMs'> | null;
}

interface TitleBarOverlayPayload {
  color?: unknown;
  symbolColor?: unknown;
  height?: unknown;
}

function logDebugTiming(message: string, payload?: unknown) {
  if (process.env.SVN_DIFF_DEBUG_TIMING !== '1') return;
  if (payload === undefined) {
    console.log(`[debug-timing] ${message}`);
    return;
  }
  console.log(`[debug-timing] ${message}`, payload);
}

function logRustDebugStderr(label: string, stderr: string) {
  if (process.env.SVN_DIFF_DEBUG_TIMING !== '1') return;
  const normalized = stderr.trim();
  if (!normalized) return;
  console.log(`[${label}] ${normalized}`);
}

interface DiffLine {
  type: 'equal' | 'add' | 'delete';
  base: string | null;
  mine: string | null;
  baseLineNo: number | null;
  mineLineNo: number | null;
  baseCharSpans: null;
  mineCharSpans: null;
}

interface WorkbookMergeRange {
  startRow: number;
  endRow: number;
  startCol: number;
  endCol: number;
}

interface WorkbookSheetMetadata {
  name: string;
  hiddenColumns: number[];
  mergeRanges: WorkbookMergeRange[];
  rowCount?: number;
  maxColumns?: number;
}

interface WorkbookMetadataMap {
  sheets: Record<string, WorkbookSheetMetadata>;
}

interface WorkbookCellSnapshot {
  value: string;
  formula: string;
}

type WorkbookCellDeltaKind = 'equal' | 'add' | 'delete' | 'modify';
type WorkbookRowDeltaTone = 'equal' | 'add' | 'delete' | 'mixed';

interface WorkbookCellDeltaPayload {
  column: number;
  baseCell: WorkbookCellSnapshot;
  mineCell: WorkbookCellSnapshot;
  changed: boolean;
  masked: boolean;
  strictOnly: boolean;
  kind: WorkbookCellDeltaKind;
  hasBaseContent: boolean;
  hasMineContent: boolean;
  hasContent: boolean;
}

interface WorkbookRowDeltaPayload {
  lineIdx: number;
  lineIdxs: number[];
  leftLineIdx: number | null;
  rightLineIdx: number | null;
  cellDeltas: WorkbookCellDeltaPayload[];
  changedColumns: number[];
  strictOnlyColumns: number[];
  changedCount: number;
  hasChanges: boolean;
  tone: WorkbookRowDeltaTone;
}

interface WorkbookSectionDeltaPayload {
  name: string;
  rows: WorkbookRowDeltaPayload[];
}

interface WorkbookPrecomputedDeltaPayload {
  compareMode: 'strict';
  sections: WorkbookSectionDeltaPayload[];
}

const argv = process.argv.slice(2);

const cliArgs: CliArgs = {
  basePath: argv[0] ?? '',
  minePath: argv[1] ?? '',
  baseName: argv[2] ?? 'Base',
  mineName: argv[3] ?? 'Mine',
  svnUrl: argv[4] ?? '',
  fileName: argv[5] ?? '',
};

const APP_ROOT = path.resolve(__dirname, '..');
const RENDERER_DIST = path.join(APP_ROOT, 'dist');
const PRELOAD_PATH = path.join(__dirname, 'preload.js');
const DEV_SERVER_URL = process.env.DEV_SERVER_URL?.trim() || 'http://localhost:5173';
const WORKBOOK_EXTENSIONS = new Set(['.xlsx', '.xlsm', '.xltx', '.xltm', '.xlsb', '.xls']);
const RUST_PARSER_NAME = process.platform === 'win32' ? 'svn_excel_parser.exe' : 'svn_excel_parser';
const XML = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseTagValue: false,
  trimValues: false,
});
const SPECIAL_BASE_ID = '__base_input__';
const SPECIAL_MINE_ID = '__mine_input__';
const TRAILING_PAREN_VERSION = /\(([^)]+)\)\s*$/;
const KEYWORD_VERSION = /\b(?:r|rev|revision|ver|version|v)\s*[:#-]?\s*([0-9][\w.-]*)\b/i;
const execFileAsync = promisify(execFile);
const RUST_MAX_BUFFER = 256 * 1024 * 1024;
const SVN_TEXT_MAX_BUFFER = 64 * 1024 * 1024;
const SVN_BINARY_MAX_BUFFER = 256 * 1024 * 1024;
const FILE_PAYLOAD_CACHE_LIMIT = 12;
const REVISION_PAYLOAD_CACHE_LIMIT = 24;
const FILE_PAYLOAD_CACHE_MAX_BYTES = 64 * 1024 * 1024;
const REVISION_PAYLOAD_CACHE_MAX_BYTES = 128 * 1024 * 1024;
const WORKBOOK_COMPARE_CACHE_LIMIT = 8;
const WORKBOOK_METADATA_CACHE_LIMIT = 16;
const DEV_PROFILE_ROOT = process.env.ELECTRON_DEV_PROFILE_DIR?.trim() || '';
const AUTO_EXIT_AFTER_LOAD_MS = Number(process.env.SVN_DIFF_AUTO_EXIT_AFTER_LOAD_MS ?? '0');
const FILE_EQUALITY_CACHE_LIMIT = 24;
const DEFAULT_REVISION_QUERY_LIMIT = 50;
const MAX_REVISION_QUERY_LIMIT = 100;
const USE_NATIVE_WINDOW_CONTROLS = process.env.SVN_DIFF_NATIVE_WINDOW_CONTROLS === '1';

let mainWindow: BrowserWindow | null = null;
let cachedSvnTarget: string | null | undefined;
let activeCliArgs: CliArgs = { ...cliArgs };
const cachedRevisionOptionPages = new Map<string, RevisionOptionsPayload>();
const filePayloadCache = new Map<string, { mtimeMs: number; size: number; payload: FilePayload; memoryBytes: number }>();
const revisionPayloadCache = new Map<string, { payload: FilePayload; memoryBytes: number }>();
const fileEqualityCache = new Map<string, {
  leftPath: string;
  rightPath: string;
  leftMtimeMs: number;
  rightMtimeMs: number;
  leftSize: number;
  rightSize: number;
  equal: boolean;
}>();
const workbookCompareCache = new Map<string, {
  leftMtimeMs: number;
  rightMtimeMs: number;
  leftSize: number;
  rightSize: number;
  payload: WorkbookCompareModePayload;
}>();
const workbookCompareInFlight = new Map<string, Promise<WorkbookCompareModePayload | null>>();
const workbookMetadataCache = new Map<string, {
  leftMtimeMs: number;
  rightMtimeMs: number;
  leftSize: number;
  rightSize: number;
  payload: WorkbookMetadataPayload;
}>();
const workbookMetadataInFlight = new Map<string, Promise<WorkbookMetadataPayload>>();
const appUpdater = createPlatformUpdater({ app });

function notifyAppUpdateState(state: AppUpdateState) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('app-update-state-changed', state);
}

function notifyWindowFrameState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('window-frame-state-changed', {
    isMaximized: mainWindow.isMaximized(),
  });
}

appUpdater.subscribe((state) => {
  notifyAppUpdateState(state);
});

interface FilePayloadMetrics {
  readMs: number;
  parserMs: number;
  metadataMs: number;
  byteLength: number;
}

interface FilePayload {
  content: string | null;
  bytes: Uint8Array | null;
  metadata: WorkbookMetadataMap | null;
  perf: FilePayloadMetrics;
}

interface RustDiffLinePayload {
  type?: unknown;
  t?: unknown;
  base?: unknown;
  b?: unknown;
  mine?: unknown;
  m?: unknown;
  baseLineNo?: unknown;
  bl?: unknown;
  mineLineNo?: unknown;
  ml?: unknown;
}

interface RustWorkbookDiffPayload {
  diffLines?: unknown;
  d?: unknown;
  workbookDelta?: unknown;
  w?: unknown;
}

function estimatePayloadMemoryBytes(payload: FilePayload): number {
  const contentBytes = payload.content ? Buffer.byteLength(payload.content, 'utf-8') : 0;
  const rawBytes = payload.bytes?.byteLength ?? 0;
  const metadataBytes = payload.metadata ? Buffer.byteLength(JSON.stringify(payload.metadata), 'utf-8') : 0;
  return contentBytes + rawBytes + metadataBytes;
}

function trimCacheByBudget<T extends { memoryBytes: number }>(
  cache: Map<string, T>,
  limit: number,
  maxBytes: number,
) {
  let totalBytes = 0;
  cache.forEach((entry) => {
    totalBytes += entry.memoryBytes;
  });

  while (cache.size > limit || totalBytes > maxBytes) {
    const oldestKey = cache.keys().next().value;
    if (!oldestKey) break;
    const oldestEntry = cache.get(oldestKey);
    if (!oldestEntry) {
      cache.delete(oldestKey);
      continue;
    }
    totalBytes -= oldestEntry.memoryBytes;
    cache.delete(oldestKey);
  }
}

function rememberCacheEntry<T extends { memoryBytes: number }>(
  cache: Map<string, T>,
  key: string,
  value: T,
  limit: number,
  maxBytes: number,
): T {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, value);
  trimCacheByBudget(cache, limit, maxBytes);
  return value;
}

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function getActiveCliArgs(): CliArgs {
  return activeCliArgs;
}

function setActiveCliArgs(nextArgs: CliArgs) {
  activeCliArgs = { ...nextArgs };
  cachedSvnTarget = undefined;
  cachedRevisionOptionPages.clear();
}

function parseCliArgsFromSecondInstance(commandLine: string[]): CliArgs | null {
  const args = commandLine.slice(1).filter((value) => !value.startsWith('--'));
  if (args.length === 0) return null;

  const normalizedArgs = [...args];
  const appToken = normalizedArgs[0] ?? '';
  if (
    appToken === '.'
    || appToken.endsWith('.js')
    || appToken.endsWith('.cjs')
    || appToken.endsWith('.mjs')
    || appToken.endsWith('.asar')
  ) {
    normalizedArgs.shift();
  }

  if (normalizedArgs.length === 5) {
    normalizedArgs.splice(4, 0, '');
  }
  if (normalizedArgs.length < 6) return null;

  const [basePath, minePath, baseName, mineName, svnUrl, fileName] = normalizedArgs.slice(0, 6);
  if (!fileName && !basePath && !minePath) return null;
  return {
    basePath: basePath ?? '',
    minePath: minePath ?? '',
    baseName: baseName ?? 'Base',
    mineName: mineName ?? 'Mine',
    svnUrl: svnUrl ?? '',
    fileName: fileName ?? '',
  };
}

function notifyCliArgsUpdated() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('cli-args-updated');
}

function focusMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function configureDevelopmentPaths() {
  if (!DEV_PROFILE_ROOT) return;

  const userDataPath = path.join(DEV_PROFILE_ROOT, 'user-data');
  const sessionDataPath = path.join(DEV_PROFILE_ROOT, 'session-data');
  const logsPath = path.join(DEV_PROFILE_ROOT, 'logs');
  const diskCachePath = path.join(sessionDataPath, 'cache');

  [userDataPath, sessionDataPath, logsPath, diskCachePath].forEach((targetPath) => {
    fs.mkdirSync(targetPath, { recursive: true });
  });

  app.setPath('userData', userDataPath);
  app.setPath('sessionData', sessionDataPath);
  app.setPath('logs', logsPath);
  app.commandLine.appendSwitch('disk-cache-dir', diskCachePath);
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();

function resolveIconPath(): string | undefined {
  const candidates = [
    path.join(APP_ROOT, 'assets', 'icon.png'),
    path.join(APP_ROOT, 'assets', 'icon.ico'),
  ];

  return candidates.find(candidate => fs.existsSync(candidate));
}

function getExtension(filePath: string): string {
  return path.extname(filePath).toLowerCase();
}

function isWorkbookFile(filePath: string): boolean {
  return WORKBOOK_EXTENSIONS.has(getExtension(filePath));
}

function resolveSideName(explicitName: string, filePath: string): string {
  const normalized = explicitName.trim();
  if (normalized && !['base', 'mine'].includes(normalized.toLowerCase())) {
    return normalized;
  }

  if (filePath) return path.basename(filePath);
  return normalized;
}

function extractRevisionToken(name: string): string {
  const normalized = name.trim();
  if (!normalized) return '';

  const parenMatch = normalized.match(TRAILING_PAREN_VERSION);
  const fromParen = parenMatch?.[1]?.trim() ?? '';
  if (/^r?[0-9]/i.test(fromParen)) {
    return fromParen.toLowerCase().startsWith('r') ? fromParen : `r${fromParen}`;
  }

  const keywordMatch = normalized.match(KEYWORD_VERSION);
  if (!keywordMatch) return '';
  const numeric = keywordMatch[1]?.trim() ?? '';
  if (!numeric) return '';
  return numeric.toLowerCase().startsWith('r') ? numeric : `r${numeric}`;
}

function normalizeRevisionNumber(revision: string): string {
  const trimmed = revision.trim();
  return trimmed.replace(/^r/i, '');
}

function formatRevisionLabel(revision: string): string {
  const normalized = normalizeRevisionNumber(revision);
  return normalized ? `r${normalized}` : '';
}

function formatLogDate(dateText: string): string {
  if (!dateText) return '';
  const parsed = new Date(dateText);
  if (Number.isNaN(parsed.getTime())) return dateText;
  const yyyy = parsed.getFullYear();
  const mm = `${parsed.getMonth() + 1}`.padStart(2, '0');
  const dd = `${parsed.getDate()}`.padStart(2, '0');
  const hh = `${parsed.getHours()}`.padStart(2, '0');
  const mi = `${parsed.getMinutes()}`.padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

function clampRevisionQueryLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) return DEFAULT_REVISION_QUERY_LIMIT;
  return Math.max(1, Math.min(MAX_REVISION_QUERY_LIMIT, Math.floor(limit!)));
}

function getRevisionNumberValue(revision: string): number | null {
  const normalized = normalizeRevisionNumber(revision);
  const parsed = Number.parseInt(normalized, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeAnchorDateTime(value: string | undefined): string {
  return value?.trim() ?? '';
}

function formatSvnDateQuery(value: string): string {
  return value.trim().replace('T', ' ');
}

function normalizeRevisionQuery(query: RevisionOptionsQuery | undefined): Required<RevisionOptionsQuery> {
  return {
    limit: clampRevisionQueryLimit(query?.limit),
    beforeRevisionId: formatRevisionLabel(query?.beforeRevisionId ?? ''),
    anchorDateTime: normalizeAnchorDateTime(query?.anchorDateTime),
    includeSpecials: Boolean(query?.includeSpecials),
  };
}

function resolveRustParserPath(): string | null {
  const candidates = [
    path.join(APP_ROOT, 'rust', 'target', 'release', RUST_PARSER_NAME),
    path.join(process.resourcesPath, 'bin', RUST_PARSER_NAME),
  ];

  return candidates.find(candidate => fs.existsSync(candidate)) ?? null;
}

async function execFileTextCommand(
  file: string,
  args: string[],
  maxBuffer: number,
): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  try {
    const result = await execFileAsync(file, args, {
      encoding: 'utf-8',
      windowsHide: true,
      maxBuffer,
    }) as { stdout: string; stderr: string };

    return {
      ok: true,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
    };
  } catch (error) {
    const execError = error as Error & { stdout?: string; stderr?: string };
    return {
      ok: false,
      stdout: execError.stdout ?? '',
      stderr: execError.stderr ?? execError.message,
    };
  }
}

async function execFileBufferCommand(
  file: string,
  args: string[],
  maxBuffer: number,
): Promise<{ ok: boolean; stdout: Buffer; stderr: string }> {
  try {
    const result = await execFileAsync(file, args, {
      encoding: 'buffer',
      windowsHide: true,
      maxBuffer,
    }) as { stdout: Buffer; stderr: Buffer };

    return {
      ok: true,
      stdout: Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(result.stdout ?? ''),
      stderr: Buffer.isBuffer(result.stderr) ? result.stderr.toString('utf-8') : String(result.stderr ?? ''),
    };
  } catch (error) {
    const execError = error as Error & { stdout?: Buffer; stderr?: Buffer | string };
    return {
      ok: false,
      stdout: Buffer.isBuffer(execError.stdout) ? execError.stdout : Buffer.alloc(0),
      stderr: Buffer.isBuffer(execError.stderr)
        ? execError.stderr.toString('utf-8')
        : typeof execError.stderr === 'string'
        ? execError.stderr
        : execError.message,
    };
  }
}

async function tryParseWorkbookWithRust(filePath: string): Promise<{ content: string | null; parseMs: number }> {
  const parserPath = resolveRustParserPath();
  if (!parserPath) return { content: null, parseMs: 0 };

  const parseStart = performance.now();
  try {
    const result = await execFileTextCommand(parserPath, [filePath], RUST_MAX_BUFFER);
    const parseMs = performance.now() - parseStart;
    logRustDebugStderr('rust-parser', result.stderr);

    if (result.ok && result.stdout.trim()) {
      return { content: result.stdout, parseMs };
    }

    if (result.stderr.trim()) {
      console.warn('[rust-parser]', result.stderr.trim());
    }
    return { content: null, parseMs };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn('[rust-parser]', message);
    return { content: null, parseMs: performance.now() - parseStart };
  }
}

function normalizeWorkbookMetadata(input: unknown): WorkbookMetadataMap | null {
  if (!input || typeof input !== 'object') return null;
  const rawSheets = (input as { sheets?: unknown; s?: unknown }).sheets
    ?? (input as { s?: unknown }).s;
  if (!rawSheets || typeof rawSheets !== 'object') return null;

  const sheets = Object.fromEntries(
    Object.entries(rawSheets as Record<string, unknown>).flatMap(([name, rawSheet]) => {
      if (!rawSheet || typeof rawSheet !== 'object') return [];
      const sheet = rawSheet as Record<string, unknown>;
      const rawHiddenColumns = Array.isArray(sheet.hiddenColumns ?? sheet.h)
        ? ((sheet.hiddenColumns ?? sheet.h) as unknown[])
        : null;
      const hiddenColumns = rawHiddenColumns
        ? rawHiddenColumns
            .map((value: unknown) => Number(value))
            .filter(value => Number.isFinite(value) && value >= 0)
        : [];
      const rawMergeRanges = Array.isArray(sheet.mergeRanges ?? sheet.m)
        ? ((sheet.mergeRanges ?? sheet.m) as unknown[])
        : null;
      const mergeRanges = rawMergeRanges
        ? rawMergeRanges.flatMap((range: unknown) => {
            if (!range || typeof range !== 'object') return [];
            const rawRange = range as Record<string, unknown>;
            const startRow = Number(rawRange.startRow ?? rawRange.sr);
            const endRow = Number(rawRange.endRow ?? rawRange.er);
            const startCol = Number(rawRange.startCol ?? rawRange.sc);
            const endCol = Number(rawRange.endCol ?? rawRange.ec);
            if (![startRow, endRow, startCol, endCol].every(Number.isFinite)) return [];
            return [{
              startRow,
              endRow,
              startCol,
              endCol,
            }];
          })
        : [];

      const normalized: WorkbookSheetMetadata = {
        name: typeof (sheet.name ?? sheet.n) === 'string' ? String(sheet.name ?? sheet.n) : name,
        hiddenColumns,
        mergeRanges,
      };
      const rowCount = Number(sheet.rowCount ?? sheet.r);
      if (Number.isFinite(rowCount) && rowCount >= 0) normalized.rowCount = rowCount;
      const maxColumns = Number(sheet.maxColumns ?? sheet.c);
      if (Number.isFinite(maxColumns) && maxColumns >= 0) normalized.maxColumns = maxColumns;
      return [[name, normalized]];
    }),
  );

  return { sheets };
}

async function tryResolveWorkbookMetadataWithRust(filePath: string): Promise<{ metadata: WorkbookMetadataMap | null; parseMs: number }> {
  const parserPath = resolveRustParserPath();
  if (!parserPath) return { metadata: null, parseMs: 0 };

  const parseStart = performance.now();
  try {
    const result = await execFileTextCommand(parserPath, ['--metadata-json', filePath], RUST_MAX_BUFFER);
    const parseMs = performance.now() - parseStart;
    logRustDebugStderr('rust-parser-metadata', result.stderr);

    if (!result.ok || !result.stdout.trim()) {
      if (result.stderr.trim()) {
        console.warn('[rust-parser-metadata]', result.stderr.trim());
      }
      return { metadata: null, parseMs };
    }

    const parsed = JSON.parse(result.stdout) as unknown;
    return {
      metadata: normalizeWorkbookMetadata(parsed),
      parseMs,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn('[rust-parser-metadata]', message);
    return { metadata: null, parseMs: performance.now() - parseStart };
  }
}

function normalizeRustDiffLines(input: unknown): DiffLine[] | null {
  if (!Array.isArray(input)) return null;

  const diffLines = input.flatMap((entry): DiffLine[] => {
    if (!entry || typeof entry !== 'object') return [];
    const payload = entry as RustDiffLinePayload;
    const typeValue = payload.type ?? payload.t;
    const type = typeValue === 'equal' || typeValue === 'add' || typeValue === 'delete'
      ? typeValue
      : null;
    if (!type) return [];

    const baseValue = typeof (payload.base ?? payload.b) === 'string' ? String(payload.base ?? payload.b) : null;
    const mineValue = typeof (payload.mine ?? payload.m) === 'string' ? String(payload.mine ?? payload.m) : null;
    const baseLineNo = payload.baseLineNo == null && payload.bl == null ? null : Number(payload.baseLineNo ?? payload.bl);
    const mineLineNo = payload.mineLineNo == null && payload.ml == null ? null : Number(payload.mineLineNo ?? payload.ml);
    return [{
      type,
      base: baseValue,
      mine: mineValue ?? (type === 'equal' ? baseValue : null),
      baseLineNo: Number.isFinite(baseLineNo) ? baseLineNo : null,
      mineLineNo: Number.isFinite(mineLineNo) ? mineLineNo : (type === 'equal' ? (Number.isFinite(baseLineNo) ? baseLineNo : null) : null),
      baseCharSpans: null,
      mineCharSpans: null,
    }];
  });

  return diffLines;
}

function normalizeWorkbookCellValueForMode(
  value: string,
  compareMode: WorkbookCompareMode = 'strict',
): string {
  if (compareMode === 'content' && value.trim() === '') {
    return '';
  }
  return value;
}

function hasNormalizedWorkbookCellContent(
  cell: WorkbookCellSnapshot,
  compareMode: WorkbookCompareMode = 'strict',
): boolean {
  return normalizeWorkbookCellValueForMode(cell.value, compareMode) !== '' || cell.formula !== '';
}

function workbookCellsDifferForMode(
  leftCell: WorkbookCellSnapshot,
  rightCell: WorkbookCellSnapshot,
  compareMode: WorkbookCompareMode = 'strict',
): boolean {
  return (
    normalizeWorkbookCellValueForMode(leftCell.value, compareMode)
    !== normalizeWorkbookCellValueForMode(rightCell.value, compareMode)
  ) || leftCell.formula !== rightCell.formula;
}

function getWorkbookCellDeltaKind(
  baseCell: WorkbookCellSnapshot,
  mineCell: WorkbookCellSnapshot,
  compareMode: WorkbookCompareMode = 'strict',
): WorkbookCellDeltaKind {
  if (!workbookCellsDifferForMode(baseCell, mineCell, compareMode)) return 'equal';

  const baseHasContent = hasNormalizedWorkbookCellContent(baseCell, compareMode);
  const mineHasContent = hasNormalizedWorkbookCellContent(mineCell, compareMode);
  if (baseHasContent !== mineHasContent) {
    return mineHasContent ? 'add' : 'delete';
  }

  return 'modify';
}

function normalizeWorkbookCellSnapshot(input: unknown): WorkbookCellSnapshot | null {
  if (!input || typeof input !== 'object') return null;
  const payload = input as {
    value?: unknown;
    formula?: unknown;
    v?: unknown;
    f?: unknown;
  };
  return {
    value: typeof (payload.value ?? payload.v) === 'string' ? String(payload.value ?? payload.v) : '',
    formula: typeof (payload.formula ?? payload.f) === 'string' ? String(payload.formula ?? payload.f) : '',
  };
}

function normalizeWorkbookCellDeltaPayload(input: unknown): WorkbookCellDeltaPayload | null {
  if (!input || typeof input !== 'object') return null;
  const payload = input as Record<string, unknown>;
  const column = Number(payload.column ?? payload.c);
  const baseCell = normalizeWorkbookCellSnapshot(payload.baseCell ?? payload.b);
  const mineCell = normalizeWorkbookCellSnapshot(payload.mineCell ?? payload.m);
  const kindValue = payload.kind;
  const kind = kindValue === 'equal' || kindValue === 'add' || kindValue === 'delete' || kindValue === 'modify'
    ? kindValue
    : (baseCell && mineCell ? getWorkbookCellDeltaKind(baseCell, mineCell, 'strict') : null);
  if (!Number.isFinite(column) || !baseCell || !mineCell || !kind) return null;
  const hasBaseContent = hasNormalizedWorkbookCellContent(baseCell, 'strict');
  const hasMineContent = hasNormalizedWorkbookCellContent(mineCell, 'strict');
  const changed = workbookCellsDifferForMode(baseCell, mineCell, 'strict');
  const strictOnly = workbookCellsDifferForMode(baseCell, mineCell, 'strict')
    && !workbookCellsDifferForMode(baseCell, mineCell, 'content');

  return {
    column,
    baseCell,
    mineCell,
    changed: payload.changed == null ? changed : Boolean(payload.changed),
    masked: payload.masked == null ? false : Boolean(payload.masked),
    strictOnly: payload.strictOnly == null ? strictOnly : Boolean(payload.strictOnly),
    kind,
    hasBaseContent: payload.hasBaseContent == null ? hasBaseContent : Boolean(payload.hasBaseContent),
    hasMineContent: payload.hasMineContent == null ? hasMineContent : Boolean(payload.hasMineContent),
    hasContent: payload.hasContent == null ? (hasBaseContent || hasMineContent) : Boolean(payload.hasContent),
  };
}

function normalizeWorkbookRowDeltaPayload(input: unknown): WorkbookRowDeltaPayload | null {
  if (!input || typeof input !== 'object') return null;
  const payload = input as Record<string, unknown>;
  const leftLineIdx = payload.leftLineIdx == null && payload.l == null ? null : Number(payload.leftLineIdx ?? payload.l);
  const rightLineIdx = payload.rightLineIdx == null && payload.r == null ? null : Number(payload.rightLineIdx ?? payload.r);
  const rawLineIdxs = Array.isArray(payload.lineIdxs) ? payload.lineIdxs : null;
  const lineIdxs = rawLineIdxs
    ? rawLineIdxs.map((value: unknown) => Number(value)).filter((value) => Number.isFinite(value))
    : [leftLineIdx, rightLineIdx].filter((value): value is number => Number.isFinite(value));
  const rawCellDeltas = Array.isArray(payload.cellDeltas ?? payload.c)
    ? ((payload.cellDeltas ?? payload.c) as unknown[])
    : null;
  const cellDeltas = rawCellDeltas
    ? rawCellDeltas
        .map(normalizeWorkbookCellDeltaPayload)
        .filter((value): value is WorkbookCellDeltaPayload => value != null)
    : [];
  const rawChangedColumns = Array.isArray(payload.changedColumns) ? payload.changedColumns : null;
  const changedColumns = rawChangedColumns
    ? rawChangedColumns.map((value: unknown) => Number(value)).filter((value) => Number.isFinite(value))
    : cellDeltas.filter((delta) => delta.changed).map((delta) => delta.column);
  const rawStrictOnlyColumns = Array.isArray(payload.strictOnlyColumns) ? payload.strictOnlyColumns : null;
  const strictOnlyColumns = rawStrictOnlyColumns
    ? rawStrictOnlyColumns.map((value: unknown) => Number(value)).filter((value) => Number.isFinite(value))
    : cellDeltas.filter((delta) => delta.strictOnly).map((delta) => delta.column);
  const toneValue = payload.tone;
  const tone = toneValue === 'equal' || toneValue === 'add' || toneValue === 'delete' || toneValue === 'mixed'
    ? toneValue
    : (
      changedColumns.length === 0
        ? 'equal'
        : (() => {
            let sawAdd = false;
            let sawDelete = false;
            let sawModify = false;
            cellDeltas.forEach((delta) => {
              if (delta.kind === 'add') sawAdd = true;
              else if (delta.kind === 'delete') sawDelete = true;
              else if (delta.kind === 'modify') sawModify = true;
            });
            if (sawModify || (sawAdd && sawDelete)) return 'mixed';
            if (sawAdd) return 'add';
            if (sawDelete) return 'delete';
            return 'equal';
          })()
    );
  const lineIdx = Number.isFinite(Number(payload.lineIdx)) ? Number(payload.lineIdx) : (lineIdxs[0] ?? 0);
  if (!Number.isFinite(lineIdx) || !tone) return null;

  return {
    lineIdx,
    lineIdxs,
    leftLineIdx: Number.isFinite(leftLineIdx) ? leftLineIdx : null,
    rightLineIdx: Number.isFinite(rightLineIdx) ? rightLineIdx : null,
    cellDeltas,
    changedColumns,
    strictOnlyColumns,
    changedCount: Number.isFinite(Number(payload.changedCount)) ? Number(payload.changedCount) : cellDeltas.filter((delta) => delta.changed).length,
    hasChanges: payload.hasChanges == null ? changedColumns.length > 0 : Boolean(payload.hasChanges),
    tone,
  };
}

function normalizeWorkbookPrecomputedDeltaPayload(input: unknown): WorkbookPrecomputedDeltaPayload | null {
  if (!input || typeof input !== 'object') return null;
  const payload = input as Record<string, unknown>;
  const compareMode = payload.compareMode ?? payload.m ?? 'strict';
  if (compareMode !== 'strict') return null;
  const rawSections = Array.isArray(payload.sections ?? payload.s)
    ? ((payload.sections ?? payload.s) as unknown[])
    : null;
  const sections = rawSections
    ? rawSections.flatMap((entry: unknown) => {
        if (!entry || typeof entry !== 'object') return [];
        const raw = entry as Record<string, unknown>;
        const name = typeof (raw.name ?? raw.n) === 'string' ? String(raw.name ?? raw.n) : '';
        if (!name) return [];
        const rawRows = Array.isArray(raw.rows ?? raw.r)
          ? ((raw.rows ?? raw.r) as unknown[])
          : null;
        const rows = rawRows
          ? rawRows
              .map(normalizeWorkbookRowDeltaPayload)
              .filter((value): value is WorkbookRowDeltaPayload => value != null)
          : [];
        return [{ name, rows }];
      })
    : [];

  return {
    compareMode: 'strict',
    sections,
  };
}

function normalizeRustWorkbookDiffPayload(input: unknown): { diffLines: DiffLine[] | null; workbookDelta: WorkbookPrecomputedDeltaPayload | null } {
  if (Array.isArray(input)) {
    return {
      diffLines: normalizeRustDiffLines(input),
      workbookDelta: null,
    };
  }

  if (!input || typeof input !== 'object') {
    return { diffLines: null, workbookDelta: null };
  }

  const payload = input as RustWorkbookDiffPayload;
  return {
    diffLines: normalizeRustDiffLines(payload.diffLines ?? payload.d),
    workbookDelta: normalizeWorkbookPrecomputedDeltaPayload(payload.workbookDelta ?? payload.w),
  };
}

async function tryResolveWorkbookDiffWithRust(
  baseFilePath: string,
  mineFilePath: string,
  compareMode: WorkbookCompareMode = 'strict',
): Promise<{ diffLines: DiffLine[] | null; workbookDelta: WorkbookPrecomputedDeltaPayload | null; parseMs: number }> {
  const parserPath = resolveRustParserPath();
  if (!parserPath) return { diffLines: null, workbookDelta: null, parseMs: 0 };

  const parseStart = performance.now();
  try {
    const result = await execFileTextCommand(
      parserPath,
      ['--diff-json', baseFilePath, mineFilePath, '--compare-mode', compareMode],
      RUST_MAX_BUFFER,
    );
    const parseMs = performance.now() - parseStart;
    logRustDebugStderr('rust-parser-diff', result.stderr);
    if (!result.ok || !result.stdout.trim()) {
      if (result.stderr.trim()) console.warn('[rust-parser-diff]', result.stderr.trim());
      return { diffLines: null, workbookDelta: null, parseMs };
    }

    const parsed = JSON.parse(result.stdout) as unknown;
    const normalized = normalizeRustWorkbookDiffPayload(parsed);
    return {
      diffLines: normalized.diffLines,
      workbookDelta: normalized.workbookDelta,
      parseMs,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn('[rust-parser-diff]', message);
    return { diffLines: null, workbookDelta: null, parseMs: performance.now() - parseStart };
  }
}

function createWorkbookDiffLinesByMode(
  compareMode: WorkbookCompareMode,
  diffLines: DiffLine[] | null,
): Partial<Record<WorkbookCompareMode, DiffLine[] | null>> | null {
  if (!diffLines) return null;
  return { [compareMode]: diffLines };
}

function createWorkbookDeltaByMode(
  compareMode: WorkbookCompareMode,
  workbookDelta: WorkbookPrecomputedDeltaPayload | null,
): Partial<Record<WorkbookCompareMode, WorkbookPrecomputedDeltaPayload | null>> | null {
  if (!workbookDelta) return null;
  return { [compareMode]: workbookDelta };
}

async function resolveWorkbookCompareModePayload(
  basePathCandidate: string,
  baseBytes: Uint8Array | null,
  minePathCandidate: string,
  mineBytes: Uint8Array | null,
  fileName: string,
  compareMode: WorkbookCompareMode,
): Promise<WorkbookCompareModePayload | null> {
  if (!isWorkbookFile(fileName)) return null;
  const cacheContext = await getLocalWorkbookPairCacheContext(
    basePathCandidate,
    minePathCandidate,
    `compare:${compareMode}`,
  );
  if (cacheContext) {
    const cached = workbookCompareCache.get(cacheContext.key);
    if (
      cached
      && cached.leftMtimeMs === cacheContext.leftMtimeMs
      && cached.rightMtimeMs === cacheContext.rightMtimeMs
      && cached.leftSize === cacheContext.leftSize
      && cached.rightSize === cacheContext.rightSize
    ) {
      logDebugTiming('workbook-compare-cache:memory-hit', {
        compareMode,
        fileName,
      });
      return cached.payload;
    }
    const inFlight = workbookCompareInFlight.get(cacheContext.key);
    if (inFlight) {
      return inFlight;
    }
  }

  const resolver = (async (): Promise<WorkbookCompareModePayload | null> => {
    const directResult = canUseDirectWorkbookDiff(basePathCandidate, minePathCandidate, fileName)
      ? await tryResolveWorkbookDiffWithRust(basePathCandidate, minePathCandidate, compareMode)
      : await withWorkbookDiffSources(
          basePathCandidate,
          baseBytes,
          minePathCandidate,
          mineBytes,
          fileName,
          (basePath, minePath) => tryResolveWorkbookDiffWithRust(basePath, minePath, compareMode),
        );

    if (!directResult?.diffLines) return null;

    const payload: WorkbookCompareModePayload = {
      compareMode,
      diffLines: directResult.diffLines,
      workbookDelta: directResult.workbookDelta,
      perf: {
        rustDiffMs: directResult.parseMs,
      },
    };

    if (cacheContext) {
      rememberLimitedEntry(workbookCompareCache, cacheContext.key, {
        leftMtimeMs: cacheContext.leftMtimeMs,
        rightMtimeMs: cacheContext.rightMtimeMs,
        leftSize: cacheContext.leftSize,
        rightSize: cacheContext.rightSize,
        payload,
      }, WORKBOOK_COMPARE_CACHE_LIMIT);
    }

    return payload;
  })();

  if (cacheContext) {
    workbookCompareInFlight.set(cacheContext.key, resolver);
    try {
      return await resolver;
    } finally {
      workbookCompareInFlight.delete(cacheContext.key);
    }
  }

  return resolver;
}

async function withWorkbookDiffSources<T>(
  basePathCandidate: string,
  baseBytes: Uint8Array | null,
  minePathCandidate: string,
  mineBytes: Uint8Array | null,
  fileName: string,
  run: (basePath: string, minePath: string) => Promise<T>,
): Promise<T | null> {
  const tempPaths: string[] = [];
  const resolveSource = async (pathCandidate: string, bytes: Uint8Array | null, suffix: 'base' | 'mine'): Promise<string | null> => {
    if (pathCandidate && fs.existsSync(pathCandidate)) {
      return pathCandidate;
    }
    if (!bytes || bytes.byteLength === 0) return null;

    const tempPath = path.join(
      os.tmpdir(),
      `svn-excel-diff-${suffix}-${Date.now()}-${Math.random().toString(16).slice(2)}${getExtension(fileName) || '.bin'}`,
    );
    await fs.promises.writeFile(tempPath, Buffer.from(bytes));
    tempPaths.push(tempPath);
    return tempPath;
  };

  try {
    const basePath = await resolveSource(basePathCandidate, baseBytes, 'base');
    const minePath = await resolveSource(minePathCandidate, mineBytes, 'mine');
    if (!basePath || !minePath) return null;
    return await run(basePath, minePath);
  } finally {
    await Promise.all(tempPaths.map(async (tempPath) => {
      try {
        await fs.promises.unlink(tempPath);
      } catch {
        // ignore temp cleanup failure
      }
    }));
  }
}

function canUseDirectWorkbookDiff(basePath: string, minePath: string, fileName: string): boolean {
  return Boolean(
    isWorkbookFile(fileName)
    && basePath
    && minePath
    && fs.existsSync(basePath)
    && fs.existsSync(minePath),
  );
}

async function readFilePayload(filePath: string, options: ReadFilePayloadOptions = {}): Promise<FilePayload> {
  if (!filePath) {
    return {
      content: null,
      bytes: null,
      metadata: null,
      perf: { readMs: 0, parserMs: 0, metadataMs: 0, byteLength: 0 },
    };
  }

  try {
    if (!fs.existsSync(filePath)) {
      return {
        content: null,
        bytes: null,
        metadata: null,
        perf: { readMs: 0, parserMs: 0, metadataMs: 0, byteLength: 0 },
      };
    }

    const stat = await fs.promises.stat(filePath);
    const cachedPayload = filePayloadCache.get(filePath);
    if (cachedPayload && cachedPayload.mtimeMs === stat.mtimeMs && cachedPayload.size === stat.size) {
      if (isWorkbookFile(filePath)) {
        const needsWorkbookText = options.includeWorkbookText !== false;
        const needsWorkbookBytes = options.includeWorkbookBytes !== false;
        const needsWorkbookMetadata = options.includeWorkbookMetadata !== false;
        const hasRequestedText = !needsWorkbookText || cachedPayload.payload.content != null;
        const hasRequestedBytes = !needsWorkbookBytes || cachedPayload.payload.bytes != null;
        const hasRequestedMetadata = !needsWorkbookMetadata || cachedPayload.payload.metadata != null;
        if (!hasRequestedText || !hasRequestedBytes || !hasRequestedMetadata) {
          // Rehydrate workbook payload from disk when the cached entry intentionally omitted heavy fields.
        } else {
          return {
            ...cachedPayload.payload,
            content: options.includeWorkbookText === false ? null : cachedPayload.payload.content,
            bytes: options.includeWorkbookBytes === false ? null : cachedPayload.payload.bytes,
            metadata: options.includeWorkbookMetadata === false ? null : cachedPayload.payload.metadata,
          };
        }
      } else {
        return {
          ...cachedPayload.payload,
        };
      }
    }

    if (isWorkbookFile(filePath)) {
      const includeWorkbookText = options.includeWorkbookText !== false;
      const includeWorkbookBytes = options.includeWorkbookBytes !== false;
      const includeWorkbookMetadata = options.includeWorkbookMetadata !== false;
      let workbookBytes: Uint8Array | null = null;
      let readMs = 0;

      if (includeWorkbookBytes) {
        const readStart = performance.now();
        const buffer = await fs.promises.readFile(filePath);
        workbookBytes = Uint8Array.from(buffer);
        readMs = performance.now() - readStart;
      }

      const [parsedWorkbook, metadataResult] = await Promise.all([
        includeWorkbookText
          ? tryParseWorkbookWithRust(filePath)
          : Promise.resolve({ content: null, parseMs: 0 }),
        includeWorkbookMetadata
          ? tryResolveWorkbookMetadataWithRust(filePath)
          : Promise.resolve({ metadata: null, parseMs: 0 }),
      ]);
      const payload = {
        content: parsedWorkbook.content,
        bytes: workbookBytes,
        metadata: metadataResult.metadata,
        perf: {
          readMs,
          parserMs: parsedWorkbook.parseMs,
          metadataMs: metadataResult.parseMs,
          byteLength: workbookBytes?.length ?? stat.size,
        },
      };
      const cachePayload: FilePayload = {
        ...payload,
        bytes: null,
      };
      rememberCacheEntry(filePayloadCache, filePath, {
        mtimeMs: stat.mtimeMs,
        size: stat.size,
        payload: cachePayload,
        memoryBytes: estimatePayloadMemoryBytes(cachePayload),
      }, FILE_PAYLOAD_CACHE_LIMIT, FILE_PAYLOAD_CACHE_MAX_BYTES);

      return payload;
    }

    const readStart = performance.now();
    const content = await fs.promises.readFile(filePath, 'utf-8');
    const readMs = performance.now() - readStart;
    const payload = {
      content,
      bytes: null,
      metadata: null,
      perf: {
        readMs,
        parserMs: 0,
        metadataMs: 0,
        byteLength: Buffer.byteLength(content, 'utf-8'),
      },
    };
    rememberCacheEntry(filePayloadCache, filePath, {
      mtimeMs: stat.mtimeMs,
      size: stat.size,
      payload,
      memoryBytes: estimatePayloadMemoryBytes(payload),
    }, FILE_PAYLOAD_CACHE_LIMIT, FILE_PAYLOAD_CACHE_MAX_BYTES);
    return payload;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: `[读取文件失败 / Error reading file: ${message}]`,
      bytes: null,
      metadata: null,
      perf: { readMs: 0, parserMs: 0, metadataMs: 0, byteLength: 0 },
    };
  }
}

async function buildPayloadFromBuffer(
  buffer: Buffer,
  fileName: string,
  options: ReadFilePayloadOptions = {},
): Promise<FilePayload> {
  if (isWorkbookFile(fileName)) {
    const includeWorkbookText = options.includeWorkbookText !== false;
    const includeWorkbookBytes = options.includeWorkbookBytes !== false;
    const includeWorkbookMetadata = options.includeWorkbookMetadata !== false;
    const bytes = includeWorkbookBytes ? Uint8Array.from(buffer) : null;
    const tempFilePath = path.join(
      os.tmpdir(),
      `svn-excel-diff-${Date.now()}-${Math.random().toString(16).slice(2)}${getExtension(fileName) || '.bin'}`,
    );

    try {
      await fs.promises.writeFile(tempFilePath, buffer);
      const [parsedWorkbook, metadataResult] = await Promise.all([
        includeWorkbookText
          ? tryParseWorkbookWithRust(tempFilePath)
          : Promise.resolve({ content: null, parseMs: 0 }),
        includeWorkbookMetadata
          ? tryResolveWorkbookMetadataWithRust(tempFilePath)
          : Promise.resolve({ metadata: null, parseMs: 0 }),
      ]);
      return {
        content: parsedWorkbook.content,
        bytes,
        metadata: metadataResult.metadata,
        perf: {
          readMs: 0,
          parserMs: parsedWorkbook.parseMs,
          metadataMs: metadataResult.parseMs,
          byteLength: bytes?.length ?? buffer.length,
        },
      };
    } finally {
      try {
        await fs.promises.unlink(tempFilePath);
      } catch {
        // ignore temp cleanup failure
      }
    }
  }

  return {
    content: buffer.toString('utf-8'),
    bytes: null,
    metadata: null,
    perf: {
      readMs: 0,
      parserMs: 0,
      metadataMs: 0,
      byteLength: buffer.length,
    },
  };
}

function runSvnUtf8(args: string[]): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  return execFileTextCommand('svn', args, SVN_TEXT_MAX_BUFFER);
}

function runSvnBuffer(args: string[]): Promise<{ ok: boolean; stdout: Buffer; stderr: string }> {
  return execFileBufferCommand('svn', args, SVN_BINARY_MAX_BUFFER);
}

async function resolveSvnTarget(): Promise<string> {
  if (cachedSvnTarget !== undefined) return cachedSvnTarget ?? '';

  const args = getActiveCliArgs();
  const explicit = args.svnUrl.trim();
  if (explicit) {
    cachedSvnTarget = explicit;
    return explicit;
  }

  const candidatePath = args.minePath || args.basePath;
  if (!candidatePath) {
    cachedSvnTarget = null;
    return '';
  }

  const result = await runSvnUtf8(['info', '--show-item', 'url', candidatePath]);
  const target = result.ok ? result.stdout.trim() : '';
  cachedSvnTarget = target || null;
  return target;
}

async function detectLocalSvnVersioningStatus(filePath: string): Promise<'versioned' | 'unversioned' | 'unknown'> {
  const candidate = filePath.trim();
  if (!candidate) return 'unknown';

  const result = await runSvnUtf8(['status', candidate]);
  if (!result.ok) return 'unknown';

  const firstLine = result.stdout
    .split(/\r?\n/)
    .map(line => line.trim())
    .find(Boolean);

  if (!firstLine) return 'versioned';
  if (firstLine.startsWith('?') || firstLine.startsWith('I')) return 'unversioned';
  return 'versioned';
}

function parseLogEntries(xmlText: string): SvnRevisionInfo[] {
  if (!xmlText.trim()) return [];

  try {
    const parsed = XML.parse(xmlText);
    const mapped: Array<SvnRevisionInfo | null> = asArray<any>(parsed?.log?.logentry)
      .map((entry): SvnRevisionInfo | null => {
        const revision = formatRevisionLabel(String(entry?.revision ?? '').trim());
        if (!revision) return null;
        return {
          id: revision,
          revision,
          title: revision,
          author: typeof entry?.author === 'string' ? entry.author.trim() : '',
          date: formatLogDate(typeof entry?.date === 'string' ? entry.date.trim() : ''),
          message: typeof entry?.msg === 'string' ? entry.msg.trim() : '',
          kind: 'revision' as const,
        };
      });

    return mapped.filter((entry): entry is SvnRevisionInfo => entry != null);
  } catch (error) {
    console.warn('[svn-log-parse]', error instanceof Error ? error.message : String(error));
    return [];
  }
}

function buildSpecialRevisionEntries(): SvnRevisionInfo[] {
  const entries: SvnRevisionInfo[] = [];
  const args = getActiveCliArgs();
  const hasDistinctBaseFile = Boolean(args.basePath && args.basePath !== args.minePath);

  if (hasDistinctBaseFile && fs.existsSync(args.basePath)) {
    entries.push({
      id: SPECIAL_BASE_ID,
      revision: extractRevisionToken(args.baseName) || 'BASE',
      title: '基线输入文件',
      author: '',
      date: '',
      message: '当前输入的基线文件（不是 SVN 提交版本）',
      kind: 'input-file',
    });
  }

  if (args.minePath && fs.existsSync(args.minePath)) {
    entries.push({
      id: SPECIAL_MINE_ID,
      revision: extractRevisionToken(args.mineName) || 'LOCAL',
      title: '本地工作副本',
      author: '',
      date: '',
      message: '当前本地工作副本（不是 SVN 提交版本）',
      kind: 'working-copy',
    });
  }

  return entries;
}

function buildRevisionQueryCacheKey(query: Required<RevisionOptionsQuery>): string {
  return JSON.stringify(query);
}

async function queryRevisionOptions(query: RevisionOptionsQuery | undefined): Promise<RevisionOptionsPayload> {
  const start = performance.now();
  const normalized = normalizeRevisionQuery(query);
  const cacheKey = buildRevisionQueryCacheKey(normalized);
  const cached = cachedRevisionOptionPages.get(cacheKey);
  if (cached) return cached;

  const target = await resolveSvnTarget();
  const specials = normalized.includeSpecials ? buildSpecialRevisionEntries() : [];
  if (!target) {
    const payload: RevisionOptionsPayload = {
      items: specials,
      hasMore: false,
      nextBeforeRevisionId: null,
      anchorRevisionId: null,
      queryDateTime: normalized.anchorDateTime || null,
    };
    cachedRevisionOptionPages.set(cacheKey, payload);
    logDebugTiming('revision-options:skip', {
      ms: Number((performance.now() - start).toFixed(1)),
      count: payload.items.length,
    });
    return payload;
  }

  if (normalized.beforeRevisionId) {
    const beforeNumber = getRevisionNumberValue(normalized.beforeRevisionId);
    if (beforeNumber != null && beforeNumber <= 1) {
      const payload: RevisionOptionsPayload = {
        items: specials,
        hasMore: false,
        nextBeforeRevisionId: null,
        anchorRevisionId: null,
        queryDateTime: normalized.anchorDateTime || null,
      };
      cachedRevisionOptionPages.set(cacheKey, payload);
      return payload;
    }
  }

  const svnArgs = ['log', '--xml', '--limit', String(normalized.limit + 1)];
  if (normalized.beforeRevisionId) {
    const beforeNumber = getRevisionNumberValue(normalized.beforeRevisionId);
    if (beforeNumber != null) {
      svnArgs.push('-r', `${Math.max(1, beforeNumber - 1)}:1`);
    }
  } else if (normalized.anchorDateTime) {
    svnArgs.push('-r', `{${formatSvnDateQuery(normalized.anchorDateTime)}}:1`);
  }
  svnArgs.push(target);

  const result = await runSvnUtf8(svnArgs);
  if (!result.ok) {
    if (result.stderr.trim()) console.warn('[svn-log]', result.stderr.trim());
    const payload: RevisionOptionsPayload = {
      items: specials,
      hasMore: false,
      nextBeforeRevisionId: null,
      anchorRevisionId: null,
      queryDateTime: normalized.anchorDateTime || null,
    };
    cachedRevisionOptionPages.set(cacheKey, payload);
    logDebugTiming('revision-options:fallback', {
      ms: Number((performance.now() - start).toFixed(1)),
      count: payload.items.length,
    });
    return payload;
  }

  const revisions = parseLogEntries(result.stdout);
  const hasMore = revisions.length > normalized.limit;
  const pageRevisions = revisions.slice(0, normalized.limit);
  const lastVisibleRevision = pageRevisions[pageRevisions.length - 1] ?? null;
  const payload: RevisionOptionsPayload = {
    items: [...specials, ...pageRevisions],
    hasMore,
    nextBeforeRevisionId: hasMore ? lastVisibleRevision?.id ?? null : null,
    anchorRevisionId: normalized.anchorDateTime ? (pageRevisions[0]?.id ?? null) : null,
    queryDateTime: normalized.anchorDateTime || null,
  };
  cachedRevisionOptionPages.set(cacheKey, payload);
  logDebugTiming('revision-options:loaded', {
    ms: Number((performance.now() - start).toFixed(1)),
    count: payload.items.length,
    hasMore,
    nextBeforeRevisionId: payload.nextBeforeRevisionId,
    queryDateTime: payload.queryDateTime,
  });
  return payload;
}

async function getRevisionOptions(): Promise<SvnRevisionInfo[]> {
  const payload = await queryRevisionOptions({
    limit: 60,
    includeSpecials: true,
  });
  return payload.items;
}

function makeFallbackRevisionInfo(side: 'base' | 'mine'): SvnRevisionInfo {
  const args = getActiveCliArgs();
  const sideName = side === 'base' ? args.baseName : args.mineName;
  const filePath = side === 'base' ? args.basePath : args.minePath;
  const extractedRevision = extractRevisionToken(sideName);

  return {
    id: side === 'base' ? SPECIAL_BASE_ID : SPECIAL_MINE_ID,
    revision: extractedRevision || (side === 'base' ? 'BASE' : 'LOCAL'),
    title: resolveSideName(sideName, filePath) || (side === 'base' ? 'Base' : 'Mine'),
    author: '',
    date: '',
    message: '',
    kind: side === 'base' ? 'input-file' : 'working-copy',
  };
}

function resolveCurrentRevisionInfo(side: 'base' | 'mine', options: SvnRevisionInfo[]): SvnRevisionInfo {
  const args = getActiveCliArgs();
  const sideName = side === 'base' ? args.baseName : args.mineName;
  const extractedRevision = extractRevisionToken(sideName);
  if (extractedRevision) {
    const matchedRevision = options.find(option => option.revision.toLowerCase() === extractedRevision.toLowerCase());
    if (matchedRevision) return matchedRevision;
  }

  const specialId = side === 'base' ? SPECIAL_BASE_ID : SPECIAL_MINE_ID;
  const matchedSpecial = options.find(option => option.id === specialId);
  if (matchedSpecial) return matchedSpecial;

  return makeFallbackRevisionInfo(side);
}

function resolveRevisionById(
  side: 'base' | 'mine',
  options: SvnRevisionInfo[],
  requestedId: string | undefined,
): SvnRevisionInfo {
  const normalized = requestedId?.trim();
  if (normalized) {
    const matched = options.find(option => option.id === normalized);
    if (matched) return matched;
  }
  return resolveCurrentRevisionInfo(side, options);
}

function isSameWorkbookSource(
  args: CliArgs,
  baseRevisionId: string | undefined,
  mineRevisionId: string | undefined,
): boolean {
  if (!baseRevisionId && !mineRevisionId) {
    return Boolean(args.basePath && args.basePath === args.minePath);
  }
  if (baseRevisionId && mineRevisionId && baseRevisionId === mineRevisionId) {
    return true;
  }

  const baseUsesInput = !baseRevisionId || baseRevisionId === SPECIAL_BASE_ID;
  const mineUsesInput = !mineRevisionId || mineRevisionId === SPECIAL_MINE_ID;
  return baseUsesInput
    && mineUsesInput
    && Boolean(args.basePath && args.basePath === args.minePath);
}

function usesLocalInputSource(revisionId: string | undefined): boolean {
  return !revisionId || revisionId === SPECIAL_BASE_ID || revisionId === SPECIAL_MINE_ID;
}

function buildFileEqualityCacheKey(leftPath: string, rightPath: string): string {
  return [leftPath, rightPath].sort((left, right) => left.localeCompare(right)).join('::');
}

function rememberFileEquality(
  key: string,
  value: {
    leftPath: string;
    rightPath: string;
    leftMtimeMs: number;
    rightMtimeMs: number;
    leftSize: number;
    rightSize: number;
    equal: boolean;
  },
) {
  if (fileEqualityCache.has(key)) fileEqualityCache.delete(key);
  fileEqualityCache.set(key, value);
  while (fileEqualityCache.size > FILE_EQUALITY_CACHE_LIMIT) {
    const oldestKey = fileEqualityCache.keys().next().value;
    if (!oldestKey) break;
    fileEqualityCache.delete(oldestKey);
  }
}

function rememberLimitedEntry<T>(cache: Map<string, T>, key: string, value: T, limit: number): T {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, value);
  while (cache.size > limit) {
    const oldestKey = cache.keys().next().value;
    if (!oldestKey) break;
    cache.delete(oldestKey);
  }
  return value;
}

interface LocalWorkbookPairCacheContext {
  key: string;
  leftPath: string;
  rightPath: string;
  leftMtimeMs: number;
  rightMtimeMs: number;
  leftSize: number;
  rightSize: number;
}

async function getLocalWorkbookPairCacheContext(
  leftPath: string,
  rightPath: string,
  cacheScope: string,
): Promise<LocalWorkbookPairCacheContext | null> {
  if (!leftPath || !rightPath) return null;
  if (!fs.existsSync(leftPath) || !fs.existsSync(rightPath)) return null;

  try {
    const [leftStat, rightStat] = await Promise.all([
      fs.promises.stat(leftPath),
      fs.promises.stat(rightPath),
    ]);
    return {
      key: `${cacheScope}::${leftPath}::${rightPath}`,
      leftPath,
      rightPath,
      leftMtimeMs: leftStat.mtimeMs,
      rightMtimeMs: rightStat.mtimeMs,
      leftSize: leftStat.size,
      rightSize: rightStat.size,
    };
  } catch {
    return null;
  }
}

async function haveSameLocalFileContents(leftPath: string, rightPath: string): Promise<boolean> {
  if (!leftPath || !rightPath) return false;
  if (leftPath === rightPath) return true;
  if (!fs.existsSync(leftPath) || !fs.existsSync(rightPath)) return false;

  try {
    const [leftStat, rightStat] = await Promise.all([
      fs.promises.stat(leftPath),
      fs.promises.stat(rightPath),
    ]);
    if (leftStat.size !== rightStat.size) return false;

    const cacheKey = buildFileEqualityCacheKey(leftPath, rightPath);
    const cached = fileEqualityCache.get(cacheKey);
    if (
      cached
      && cached.leftPath === leftPath
      && cached.rightPath === rightPath
      && cached.leftMtimeMs === leftStat.mtimeMs
      && cached.rightMtimeMs === rightStat.mtimeMs
      && cached.leftSize === leftStat.size
      && cached.rightSize === rightStat.size
    ) {
      return cached.equal;
    }

    const [leftBuffer, rightBuffer] = await Promise.all([
      fs.promises.readFile(leftPath),
      fs.promises.readFile(rightPath),
    ]);
    const equal = leftBuffer.equals(rightBuffer);
    rememberFileEquality(cacheKey, {
      leftPath,
      rightPath,
      leftMtimeMs: leftStat.mtimeMs,
      rightMtimeMs: rightStat.mtimeMs,
      leftSize: leftStat.size,
      rightSize: rightStat.size,
      equal,
    });
    return equal;
  } catch {
    return false;
  }
}

function createRequestedRevisionInfo(
  side: 'base' | 'mine',
  requestedId: string | undefined,
): SvnRevisionInfo {
  const normalized = requestedId?.trim() ?? '';
  if (!normalized) {
    return makeFallbackRevisionInfo(side);
  }
  if (normalized === SPECIAL_BASE_ID || normalized === SPECIAL_MINE_ID) {
    return makeFallbackRevisionInfo(side);
  }

  const revision = formatRevisionLabel(normalized);
  return {
    id: normalized,
    revision: revision || normalized,
    title: revision || normalized,
    author: '',
    date: '',
    message: '',
    kind: 'revision',
  };
}

async function readRevisionPayload(
  source: SvnRevisionInfo,
  target: string,
  fileName: string,
  options: ReadFilePayloadOptions = {},
): Promise<FilePayload> {
  const args = getActiveCliArgs();
  if (source.id === SPECIAL_BASE_ID) return readFilePayload(args.basePath, options);
  if (source.id === SPECIAL_MINE_ID) return readFilePayload(args.minePath, options);

  const revisionCacheKey = `${target}::${fileName}::${source.id}`;
  const cachedPayload = revisionPayloadCache.get(revisionCacheKey);
  if (cachedPayload) {
    return cachedPayload.payload;
  }

  if (!target) {
    return {
      content: '[SVN] 无法定位仓库 URL，无法按版本切换',
      bytes: null,
      metadata: null,
      perf: { readMs: 0, parserMs: 0, metadataMs: 0, byteLength: 0 },
    };
  }

  const result = await runSvnBuffer(['cat', '-r', normalizeRevisionNumber(source.revision), target]);
  if (!result.ok) {
    const message = result.stderr.trim() || 'svn cat failed';
    return {
      content: `[SVN] 读取版本 ${source.revision} 失败: ${message}`,
      bytes: null,
      metadata: null,
      perf: { readMs: 0, parserMs: 0, metadataMs: 0, byteLength: 0 },
    };
  }

  const payload = await buildPayloadFromBuffer(result.stdout, fileName, options);
  rememberCacheEntry(revisionPayloadCache, revisionCacheKey, {
    payload,
    memoryBytes: estimatePayloadMemoryBytes(payload),
  }, REVISION_PAYLOAD_CACHE_LIMIT, REVISION_PAYLOAD_CACHE_MAX_BYTES);
  return payload;
}

function makeSideDisplayName(fileName: string, info: SvnRevisionInfo, fallback: string): string {
  const baseLabel = fileName.trim() || fallback.trim();
  const suffix = info.revision || info.title;
  if (baseLabel && suffix) return `${baseLabel} (${suffix})`;
  if (baseLabel) return baseLabel;
  if (suffix) return suffix;
  return fallback;
}

async function buildDiffData(options: BuildDiffDataOptions = {}): Promise<DiffData> {
  const buildStart = performance.now();
  const {
    baseRevisionId,
    mineRevisionId,
    workbookCompareMode = 'strict',
    includeRevisionOptions = false,
    revisionOptionsOverride = null,
  } = options;
  const args = getActiveCliArgs();
  const target = await resolveSvnTarget();
  const resolvedFileName = args.fileName.trim()
    || path.basename(args.minePath || args.basePath || '');
  const revisionOptions = includeRevisionOptions
    ? (revisionOptionsOverride ?? await getRevisionOptions())
    : null;
  const isWorkbook = isWorkbookFile(resolvedFileName);
  const payloadOptions: ReadFilePayloadOptions = isWorkbook
    ? { includeWorkbookText: false, includeWorkbookBytes: true, includeWorkbookMetadata: false }
    : {};

  const baseRevisionInfo = revisionOptions
    ? resolveRevisionById('base', revisionOptions, baseRevisionId)
    : createRequestedRevisionInfo('base', baseRevisionId);
  const mineRevisionInfo = revisionOptions
    ? resolveRevisionById('mine', revisionOptions, mineRevisionId)
    : createRequestedRevisionInfo('mine', mineRevisionId);
  const sameSource = isSameWorkbookSource(args, baseRevisionId, mineRevisionId);

  const basePayloadPromise = baseRevisionId
    ? readRevisionPayload(baseRevisionInfo, target, resolvedFileName, payloadOptions)
    : readFilePayload(args.basePath, payloadOptions);
  const [basePayload, minePayload] = sameSource
    ? await Promise.all([basePayloadPromise, basePayloadPromise])
    : await Promise.all([
        basePayloadPromise,
        mineRevisionId
          ? readRevisionPayload(mineRevisionInfo, target, resolvedFileName, payloadOptions)
          : readFilePayload(args.minePath, payloadOptions),
      ]);
  const workbookComparePayload = await resolveWorkbookCompareModePayload(
    baseRevisionId ? '' : args.basePath,
    basePayload.bytes,
    mineRevisionId ? '' : args.minePath,
    minePayload.bytes,
    resolvedFileName,
    workbookCompareMode,
  );
  const hasPrecomputedWorkbookDiff = Boolean(workbookComparePayload?.diffLines);
  const workbookArtifactDiff = detectWorkbookArtifactOnlyDiff({
    isWorkbook,
    baseBytes: basePayload.bytes,
    mineBytes: minePayload.bytes,
    diffLines: workbookComparePayload?.diffLines ?? null,
  });

  logDebugTiming('build-diff-data:done', {
    compareMode: workbookCompareMode,
    baseRevisionId: baseRevisionId ?? null,
    mineRevisionId: mineRevisionId ?? null,
    includeRevisionOptions,
    isWorkbook,
    hasPrecomputedWorkbookDiff,
    durationMs: Number((performance.now() - buildStart).toFixed(1)),
    baseReadMs: Number((basePayload.perf.readMs ?? 0).toFixed(1)),
    mineReadMs: Number((minePayload.perf.readMs ?? 0).toFixed(1)),
    baseParserMs: Number((basePayload.perf.parserMs ?? 0).toFixed(1)),
    mineParserMs: Number((minePayload.perf.parserMs ?? 0).toFixed(1)),
    metadataMs: Number(((basePayload.perf.metadataMs ?? 0) + (minePayload.perf.metadataMs ?? 0)).toFixed(1)),
    rustDiffMs: Number((workbookComparePayload?.perf?.rustDiffMs ?? 0).toFixed(1)),
  });

  return {
    svnUrl: target,
    fileName: resolvedFileName,
    baseName: makeSideDisplayName(
      resolvedFileName,
      baseRevisionInfo,
      resolveSideName(args.baseName, args.basePath),
    ),
    mineName: makeSideDisplayName(
      resolvedFileName,
      mineRevisionInfo,
      resolveSideName(args.mineName, args.minePath),
    ),
    baseContent: hasPrecomputedWorkbookDiff ? null : basePayload.content,
    mineContent: hasPrecomputedWorkbookDiff ? null : minePayload.content,
    baseBytes: hasPrecomputedWorkbookDiff ? null : basePayload.bytes,
    mineBytes: hasPrecomputedWorkbookDiff ? null : minePayload.bytes,
    precomputedDiffLines: workbookCompareMode === 'strict' ? (workbookComparePayload?.diffLines ?? null) : null,
    precomputedWorkbookDelta: workbookCompareMode === 'strict' ? (workbookComparePayload?.workbookDelta ?? null) : null,
    precomputedDiffLinesByMode: createWorkbookDiffLinesByMode(workbookCompareMode, workbookComparePayload?.diffLines ?? null),
    precomputedWorkbookDeltaByMode: createWorkbookDeltaByMode(workbookCompareMode, workbookComparePayload?.workbookDelta ?? null),
    baseWorkbookMetadata: basePayload.metadata,
    mineWorkbookMetadata: minePayload.metadata,
    revisionOptions,
    baseRevisionInfo,
    mineRevisionInfo,
    canSwitchRevisions: Boolean(target),
    workbookArtifactDiff,
    sourceNoticeCode: null,
    perf: {
      source: baseRevisionId || mineRevisionId ? 'revision-switch' : 'cli',
      mainLoadMs: performance.now() - buildStart,
      baseReadMs: basePayload.perf.readMs,
      mineReadMs: minePayload.perf.readMs,
      baseParserMs: basePayload.perf.parserMs,
      mineParserMs: minePayload.perf.parserMs,
      metadataMs: basePayload.perf.metadataMs + minePayload.perf.metadataMs,
      rustDiffMs: workbookComparePayload?.perf?.rustDiffMs ?? 0,
      baseBytes: basePayload.perf.byteLength,
      mineBytes: minePayload.perf.byteLength,
    },
  };
}

function buildDevWorkingCopyCliArgs(filePath: string): CliArgs {
  const resolvedPath = filePath.trim();
  const fileName = path.basename(resolvedPath);

  return {
    basePath: resolvedPath,
    minePath: resolvedPath,
    baseName: fileName,
    mineName: fileName,
    svnUrl: '',
    fileName,
  };
}

function resolveDefaultDevRevisionPair(
  options: SvnRevisionInfo[],
): { baseRevisionId?: string; mineRevisionId?: string } {
  const revisions = options.filter(option => option.kind === 'revision');
  const workingCopy = options.find(option => option.id === SPECIAL_MINE_ID);

  if (revisions.length >= 2) {
    return {
      baseRevisionId: revisions[1]!.id,
      mineRevisionId: revisions[0]!.id,
    };
  }

  if (revisions.length === 1) {
    const result: { baseRevisionId?: string; mineRevisionId?: string } = {
      baseRevisionId: revisions[0]!.id,
    };
    if (workingCopy?.id) result.mineRevisionId = workingCopy.id;
    return result;
  }

  return {};
}

async function buildDevWorkingCopyDiffData(
  filePath: string,
  workbookCompareMode: WorkbookCompareMode = 'strict',
): Promise<DiffData> {
  const resolvedPath = filePath.trim();
  if (!resolvedPath) {
    throw new Error('Missing working copy path');
  }

  setActiveCliArgs(buildDevWorkingCopyCliArgs(resolvedPath));
  const revisionOptions = await getRevisionOptions();
  const { baseRevisionId, mineRevisionId } = resolveDefaultDevRevisionPair(revisionOptions);
  const versioningStatus = await detectLocalSvnVersioningStatus(resolvedPath);
  const data = await buildDiffData({
    baseRevisionId,
    mineRevisionId,
    workbookCompareMode,
    includeRevisionOptions: true,
    revisionOptionsOverride: revisionOptions,
  });

  return {
    ...data,
    sourceNoticeCode: versioningStatus === 'unversioned' ? 'unversioned-working-copy' : null,
    perf: data.perf
      ? {
          ...data.perf,
          source: 'local-dev',
        }
      : {
          source: 'local-dev',
        },
  };
}

async function buildLocalDiffData(
  basePath: string,
  minePath: string,
  workbookCompareMode: WorkbookCompareMode = 'strict',
): Promise<DiffData> {
  const buildStart = performance.now();
  const resolvedBasePath = basePath.trim();
  const resolvedMinePath = minePath.trim();
  const resolvedFileName = path.basename(resolvedMinePath || resolvedBasePath || 'local-diff');
  const isWorkbook = isWorkbookFile(resolvedFileName);
  const payloadOptions: ReadFilePayloadOptions = isWorkbook
    ? { includeWorkbookText: false, includeWorkbookBytes: true, includeWorkbookMetadata: false }
    : {};
  const [basePayload, minePayload] = await Promise.all([
    readFilePayload(resolvedBasePath, payloadOptions),
    readFilePayload(resolvedMinePath, payloadOptions),
  ]);
  const workbookComparePayload = await resolveWorkbookCompareModePayload(
    resolvedBasePath,
    basePayload.bytes,
    resolvedMinePath,
    minePayload.bytes,
    resolvedFileName,
    workbookCompareMode,
  );
  const hasPrecomputedWorkbookDiff = Boolean(workbookComparePayload?.diffLines);
  const workbookArtifactDiff = detectWorkbookArtifactOnlyDiff({
    isWorkbook,
    baseBytes: basePayload.bytes,
    mineBytes: minePayload.bytes,
    diffLines: workbookComparePayload?.diffLines ?? null,
  });

  return {
    svnUrl: '',
    fileName: resolvedFileName,
    baseName: resolveSideName('', resolvedBasePath),
    mineName: resolveSideName('', resolvedMinePath),
    baseContent: hasPrecomputedWorkbookDiff ? null : basePayload.content,
    mineContent: hasPrecomputedWorkbookDiff ? null : minePayload.content,
    baseBytes: hasPrecomputedWorkbookDiff ? null : basePayload.bytes,
    mineBytes: hasPrecomputedWorkbookDiff ? null : minePayload.bytes,
    precomputedDiffLines: workbookCompareMode === 'strict' ? (workbookComparePayload?.diffLines ?? null) : null,
    precomputedWorkbookDelta: workbookCompareMode === 'strict' ? (workbookComparePayload?.workbookDelta ?? null) : null,
    precomputedDiffLinesByMode: createWorkbookDiffLinesByMode(workbookCompareMode, workbookComparePayload?.diffLines ?? null),
    precomputedWorkbookDeltaByMode: createWorkbookDeltaByMode(workbookCompareMode, workbookComparePayload?.workbookDelta ?? null),
    baseWorkbookMetadata: basePayload.metadata,
    mineWorkbookMetadata: minePayload.metadata,
    revisionOptions: null,
    baseRevisionInfo: null,
    mineRevisionInfo: null,
    canSwitchRevisions: false,
    workbookArtifactDiff,
    sourceNoticeCode: null,
    perf: {
      source: 'local-dev',
      mainLoadMs: performance.now() - buildStart,
      baseReadMs: basePayload.perf.readMs,
      mineReadMs: minePayload.perf.readMs,
      baseParserMs: basePayload.perf.parserMs,
      mineParserMs: minePayload.perf.parserMs,
      metadataMs: basePayload.perf.metadataMs + minePayload.perf.metadataMs,
      rustDiffMs: workbookComparePayload?.perf?.rustDiffMs ?? 0,
      baseBytes: basePayload.perf.byteLength,
      mineBytes: minePayload.perf.byteLength,
    },
  };
}

async function loadWorkbookCompareModeData(
  compareMode: WorkbookCompareMode,
  baseRevisionId?: string,
  mineRevisionId?: string,
): Promise<WorkbookCompareModePayload> {
  const start = performance.now();
  const args = getActiveCliArgs();
  const target = await resolveSvnTarget();
  const resolvedFileName = args.fileName.trim()
    || path.basename(args.minePath || args.basePath || '');

  const baseRevisionInfo = createRequestedRevisionInfo('base', baseRevisionId);
  const mineRevisionInfo = createRequestedRevisionInfo('mine', mineRevisionId);
  const payloadOptions: ReadFilePayloadOptions = {
    includeWorkbookText: false,
    includeWorkbookBytes: true,
    includeWorkbookMetadata: false,
  };
  const sameSource = isSameWorkbookSource(args, baseRevisionId, mineRevisionId);
  const basePayloadPromise = baseRevisionId
    ? readRevisionPayload(baseRevisionInfo, target, resolvedFileName, payloadOptions)
    : readFilePayload(args.basePath, payloadOptions);
  const [basePayload, minePayload] = sameSource
    ? await Promise.all([basePayloadPromise, basePayloadPromise])
    : await Promise.all([
        basePayloadPromise,
        mineRevisionId
          ? readRevisionPayload(mineRevisionInfo, target, resolvedFileName, payloadOptions)
          : readFilePayload(args.minePath, payloadOptions),
      ]);
  const workbookComparePayload = await resolveWorkbookCompareModePayload(
    baseRevisionId ? '' : args.basePath,
    basePayload.bytes,
    mineRevisionId ? '' : args.minePath,
    minePayload.bytes,
    resolvedFileName,
    compareMode,
  );

  logDebugTiming('load-workbook-compare-mode:done', {
    compareMode,
    baseRevisionId: baseRevisionId ?? null,
    mineRevisionId: mineRevisionId ?? null,
    durationMs: Number((performance.now() - start).toFixed(1)),
    baseReadMs: Number((basePayload.perf.readMs ?? 0).toFixed(1)),
    mineReadMs: Number((minePayload.perf.readMs ?? 0).toFixed(1)),
    metadataMs: Number(((basePayload.perf.metadataMs ?? 0) + (minePayload.perf.metadataMs ?? 0)).toFixed(1)),
    rustDiffMs: Number((workbookComparePayload?.perf?.rustDiffMs ?? 0).toFixed(1)),
  });

  return workbookComparePayload ?? {
    compareMode,
    diffLines: null,
    workbookDelta: null,
    perf: null,
  };
}

async function loadWorkbookMetadataData(
  baseRevisionId?: string,
  mineRevisionId?: string,
): Promise<WorkbookMetadataPayload> {
  const start = performance.now();
  const args = getActiveCliArgs();
  const target = await resolveSvnTarget();
  const resolvedFileName = args.fileName.trim()
    || path.basename(args.minePath || args.basePath || '');
  const payloadOptions: ReadFilePayloadOptions = {
    includeWorkbookText: false,
    includeWorkbookBytes: false,
    includeWorkbookMetadata: true,
  };
  const baseRevisionInfo = createRequestedRevisionInfo('base', baseRevisionId);
  const mineRevisionInfo = createRequestedRevisionInfo('mine', mineRevisionId);
  const sameSource = isSameWorkbookSource(args, baseRevisionId, mineRevisionId);
  const sameLocalContent = !sameSource
    && usesLocalInputSource(baseRevisionId)
    && usesLocalInputSource(mineRevisionId)
    && await haveSameLocalFileContents(args.basePath, args.minePath);
  const cacheContext = sameSource || sameLocalContent
    ? await getLocalWorkbookPairCacheContext(args.basePath, args.minePath, 'metadata')
    : null;
  if (cacheContext) {
    const cached = workbookMetadataCache.get(cacheContext.key);
    if (
      cached
      && cached.leftMtimeMs === cacheContext.leftMtimeMs
      && cached.rightMtimeMs === cacheContext.rightMtimeMs
      && cached.leftSize === cacheContext.leftSize
      && cached.rightSize === cacheContext.rightSize
    ) {
      logDebugTiming('workbook-metadata-cache:memory-hit', {
        fileName: resolvedFileName,
      });
      return cached.payload;
    }
    const inFlight = workbookMetadataInFlight.get(cacheContext.key);
    if (inFlight) {
      return inFlight;
    }
  }

  const resolver = (async (): Promise<WorkbookMetadataPayload> => {
    const basePayloadPromise = baseRevisionId
      ? readRevisionPayload(baseRevisionInfo, target, resolvedFileName, payloadOptions)
      : readFilePayload(args.basePath, payloadOptions);
    const [basePayload, minePayload] = (sameSource || sameLocalContent)
      ? await Promise.all([basePayloadPromise, basePayloadPromise])
      : await Promise.all([
          basePayloadPromise,
          mineRevisionId
            ? readRevisionPayload(mineRevisionInfo, target, resolvedFileName, payloadOptions)
            : readFilePayload(args.minePath, payloadOptions),
        ]);
    const metadataMs = (basePayload.perf.metadataMs ?? 0) + (minePayload.perf.metadataMs ?? 0);

    logDebugTiming('load-workbook-metadata:done', {
      baseRevisionId: baseRevisionId ?? null,
      mineRevisionId: mineRevisionId ?? null,
      sameLocalContent,
      durationMs: Number((performance.now() - start).toFixed(1)),
      metadataMs: Number(metadataMs.toFixed(1)),
    });

    const payload: WorkbookMetadataPayload = {
      base: basePayload.metadata,
      mine: minePayload.metadata,
      perf: {
        metadataMs,
      },
    };
    if (cacheContext) {
      rememberLimitedEntry(workbookMetadataCache, cacheContext.key, {
        leftMtimeMs: cacheContext.leftMtimeMs,
        rightMtimeMs: cacheContext.rightMtimeMs,
        leftSize: cacheContext.leftSize,
        rightSize: cacheContext.rightSize,
        payload,
      }, WORKBOOK_METADATA_CACHE_LIMIT);
    }
    return payload;
  })();

  if (cacheContext) {
    workbookMetadataInFlight.set(cacheContext.key, resolver);
    try {
      return await resolver;
    } finally {
      workbookMetadataInFlight.delete(cacheContext.key);
    }
  }
  return resolver;
}

function createWindow() {
  const iconPath = resolveIconPath();
  const titleBarOverlay = USE_NATIVE_WINDOW_CONTROLS
    ? {
        color: '#f2efe6',
        symbolColor: '#141413',
        height: 44,
      }
    : undefined;

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 500,
    resizable: true,
    minimizable: true,
    maximizable: true,
    fullscreenable: true,
    thickFrame: true,
    frame: false,
    titleBarStyle: 'hidden',
    ...(titleBarOverlay ? { titleBarOverlay } : {}),
    backgroundColor: '#f4efe6',
    title: 'SvnDiffTool',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: PRELOAD_PATH,
    },
    ...(iconPath ? { icon: iconPath } : {}),
  });

  if (process.env.NODE_ENV === 'development') {
    void mainWindow.loadURL(DEV_SERVER_URL);
    if (process.env.OPEN_ELECTRON_DEVTOOLS === '1') {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
  } else {
    void mainWindow.loadFile(path.join(RENDERER_DIST, 'index.html'));
  }

  mainWindow.on('maximize', notifyWindowFrameState);
  mainWindow.on('unmaximize', notifyWindowFrameState);
  mainWindow.on('restore', notifyWindowFrameState);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.on('did-finish-load', () => {
    notifyWindowFrameState();
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error('[electron] failed to load window', {
      errorCode,
      errorDescription,
      validatedURL,
    });
  });
}

ipcMain.handle('get-diff-data', async (_, payload: { compareMode?: WorkbookCompareMode } | undefined) => (
  buildDiffData({
    workbookCompareMode: payload?.compareMode ?? 'strict',
  })
));
ipcMain.handle('load-revision-diff', async (_, payload: {
  baseRevisionId?: string;
  mineRevisionId?: string;
  compareMode?: WorkbookCompareMode;
} | undefined) => (
  buildDiffData({
    baseRevisionId: payload?.baseRevisionId,
    mineRevisionId: payload?.mineRevisionId,
    workbookCompareMode: payload?.compareMode ?? 'strict',
  })
));
ipcMain.handle('get-revision-options', async () => getRevisionOptions());
ipcMain.handle('query-revision-options', async (_, payload: RevisionOptionsQuery | undefined) => (
  queryRevisionOptions(payload)
));
ipcMain.handle('load-workbook-compare-mode', async (_, payload: {
  compareMode?: WorkbookCompareMode;
  baseRevisionId?: string;
  mineRevisionId?: string;
} | undefined) => (
  loadWorkbookCompareModeData(
    payload?.compareMode ?? 'strict',
    payload?.baseRevisionId,
    payload?.mineRevisionId,
  )
));
ipcMain.handle('load-workbook-metadata', async (_, payload: {
  baseRevisionId?: string;
  mineRevisionId?: string;
} | undefined) => (
  loadWorkbookMetadataData(
    payload?.baseRevisionId,
    payload?.mineRevisionId,
  )
));
ipcMain.handle('is-dev-mode', () => process.env.NODE_ENV === 'development');
ipcMain.handle('pick-diff-file', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select working copy file',
    properties: ['openFile'],
  });

  const selectedPath = result.canceled ? '' : (result.filePaths[0] ?? '');
  if (!selectedPath) return null;
  return {
    path: selectedPath,
    name: path.basename(selectedPath),
  };
});
ipcMain.handle('load-dev-working-copy-diff', async (_, payload: {
  filePath?: string;
  compareMode?: WorkbookCompareMode;
} | undefined) => (
  buildDevWorkingCopyDiffData(payload?.filePath ?? '', payload?.compareMode ?? 'strict')
));
ipcMain.handle('load-local-diff', async (_, payload: {
  basePath?: string;
  minePath?: string;
  compareMode?: WorkbookCompareMode;
} | undefined) => (
  buildLocalDiffData(payload?.basePath ?? '', payload?.minePath ?? '', payload?.compareMode ?? 'strict')
));
ipcMain.handle('get-svn-diff-viewer-status', async () => getSvnDiffViewerStatus());
ipcMain.handle('configure-svn-diff-viewer', async (_, payload: {
  scope?: SvnDiffViewerScope;
} | undefined) => (
  configureSvnDiffViewer(payload?.scope ?? 'excel-only')
));
ipcMain.handle('get-theme', () => (nativeTheme.shouldUseDarkColors ? 'dark' : 'light'));
ipcMain.handle('uses-native-window-controls', () => USE_NATIVE_WINDOW_CONTROLS);
ipcMain.handle('get-window-frame-state', () => ({
  isMaximized: Boolean(mainWindow?.isMaximized()),
}));
ipcMain.handle('get-update-state', () => appUpdater.getState());
ipcMain.handle('check-app-update', async (_, payload: { manual?: boolean } | undefined) => (
  appUpdater.checkForUpdates({ manual: payload?.manual ?? false })
));
ipcMain.handle('download-app-update', async () => appUpdater.downloadUpdate());
ipcMain.handle('install-downloaded-update', async () => appUpdater.installUpdate());

ipcMain.on('clipboard-write-text', (_, text: unknown) => {
  if (typeof text === 'string') {
    clipboard.writeText(text);
  }
});

ipcMain.on('set-title-bar-overlay', (_, payload: TitleBarOverlayPayload | undefined) => {
  if (!USE_NATIVE_WINDOW_CONTROLS || !mainWindow || mainWindow.isDestroyed()) return;
  const color = typeof payload?.color === 'string' ? payload.color : '#f2efe6';
  const symbolColor = typeof payload?.symbolColor === 'string' ? payload.symbolColor : '#141413';
  const rawHeight = typeof payload?.height === 'number' ? payload.height : Number(payload?.height);
  const height = Number.isFinite(rawHeight) && rawHeight > 0 ? rawHeight : 44;
  mainWindow.setTitleBarOverlay({
    color,
    symbolColor,
    height,
  });
});

ipcMain.on('debug-log', (_, payload: unknown) => {
  if (!payload || typeof payload !== 'object') return;
  const message = typeof (payload as { message?: unknown }).message === 'string'
    ? (payload as { message: string }).message
    : '';
  if (!message) return;
  logDebugTiming(`renderer:${message}`, (payload as { payload?: unknown }).payload);
  if (AUTO_EXIT_AFTER_LOAD_MS > 0 && message === 'apply-diff-data:done') {
    setTimeout(() => {
      app.quit();
    }, AUTO_EXIT_AFTER_LOAD_MS);
  }
});

ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-maximize', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
    return;
  }
  mainWindow.maximize();
});
ipcMain.on('window-close', () => mainWindow?.close());

ipcMain.on('open-external', (_, url: unknown) => {
  if (typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'))) {
    void shell.openExternal(url);
  }
});

if (!gotSingleInstanceLock) {
  console.warn('[electron] single-instance lock denied; another SvnDiffTool instance is already running');
  app.quit();
} else {
  app.on('second-instance', (_event, commandLine) => {
    const nextArgs = parseCliArgsFromSecondInstance(commandLine);
    logDebugTiming('second-instance:raw-command-line', { commandLine });
    if (nextArgs) {
      logDebugTiming('second-instance:cli-args-updated', {
        fileName: nextArgs.fileName,
        basePath: nextArgs.basePath,
        minePath: nextArgs.minePath,
      });
      setActiveCliArgs(nextArgs);
      notifyCliArgsUpdated();
    }
    focusMainWindow();
  });

  ensureLegacyUserDataMigration();
  configureDevelopmentPaths();
  void app.whenReady().then(() => {
    appUpdater.initialize();
    createWindow();
  });
}

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
