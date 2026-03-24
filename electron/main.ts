import { app, BrowserWindow, clipboard, dialog, nativeTheme, ipcMain, shell } from 'electron';
import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { performance } from 'node:perf_hooks';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { XMLParser } from 'fast-xml-parser';

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
const DEV_PROFILE_ROOT = process.env.ELECTRON_DEV_PROFILE_DIR?.trim() || '';

let mainWindow: BrowserWindow | null = null;
let cachedSvnTarget: string | null | undefined;
let activeCliArgs: CliArgs = { ...cliArgs };
let cachedRevisionOptions: SvnRevisionInfo[] | undefined;
const filePayloadCache = new Map<string, { mtimeMs: number; size: number; payload: FilePayload; memoryBytes: number }>();
const revisionPayloadCache = new Map<string, { payload: FilePayload; memoryBytes: number }>();

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
  base?: unknown;
  mine?: unknown;
  baseLineNo?: unknown;
  mineLineNo?: unknown;
}

interface RustWorkbookDiffPayload {
  diffLines?: unknown;
  workbookDelta?: unknown;
}

interface RustWorkbookDiffCollection {
  diffLinesByMode: Partial<Record<WorkbookCompareMode, DiffLine[] | null>>;
  workbookDeltaByMode: Partial<Record<WorkbookCompareMode, WorkbookPrecomputedDeltaPayload | null>>;
  parseMs: number;
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
  cachedRevisionOptions = undefined;
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
  const rawSheets = (input as { sheets?: unknown }).sheets;
  if (!rawSheets || typeof rawSheets !== 'object') return null;

  const sheets = Object.fromEntries(
    Object.entries(rawSheets as Record<string, unknown>).flatMap(([name, rawSheet]) => {
      if (!rawSheet || typeof rawSheet !== 'object') return [];
      const sheet = rawSheet as Record<string, unknown>;
      const hiddenColumns = Array.isArray(sheet.hiddenColumns)
        ? sheet.hiddenColumns
            .map(value => Number(value))
            .filter(value => Number.isFinite(value) && value >= 0)
        : [];
      const mergeRanges = Array.isArray(sheet.mergeRanges)
        ? sheet.mergeRanges.flatMap((range) => {
            if (!range || typeof range !== 'object') return [];
            const rawRange = range as Record<string, unknown>;
            const startRow = Number(rawRange.startRow);
            const endRow = Number(rawRange.endRow);
            const startCol = Number(rawRange.startCol);
            const endCol = Number(rawRange.endCol);
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
        name: typeof sheet.name === 'string' ? sheet.name : name,
        hiddenColumns,
        mergeRanges,
      };
      const rowCount = Number(sheet.rowCount);
      if (Number.isFinite(rowCount) && rowCount >= 0) normalized.rowCount = rowCount;
      const maxColumns = Number(sheet.maxColumns);
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
    const type = payload.type === 'equal' || payload.type === 'add' || payload.type === 'delete'
      ? payload.type
      : null;
    if (!type) return [];

    const baseLineNo = payload.baseLineNo == null ? null : Number(payload.baseLineNo);
    const mineLineNo = payload.mineLineNo == null ? null : Number(payload.mineLineNo);
    return [{
      type,
      base: typeof payload.base === 'string' ? payload.base : null,
      mine: typeof payload.mine === 'string' ? payload.mine : null,
      baseLineNo: Number.isFinite(baseLineNo) ? baseLineNo : null,
      mineLineNo: Number.isFinite(mineLineNo) ? mineLineNo : null,
      baseCharSpans: null,
      mineCharSpans: null,
    }];
  });

  return diffLines;
}

function normalizeWorkbookCellSnapshot(input: unknown): WorkbookCellSnapshot | null {
  if (!input || typeof input !== 'object') return null;
  const value = typeof (input as { value?: unknown }).value === 'string' ? (input as { value: string }).value : null;
  const formula = typeof (input as { formula?: unknown }).formula === 'string' ? (input as { formula: string }).formula : null;
  if (value == null || formula == null) return null;
  return { value, formula };
}

function normalizeWorkbookCellDeltaPayload(input: unknown): WorkbookCellDeltaPayload | null {
  if (!input || typeof input !== 'object') return null;
  const payload = input as Record<string, unknown>;
  const column = Number(payload.column);
  const baseCell = normalizeWorkbookCellSnapshot(payload.baseCell);
  const mineCell = normalizeWorkbookCellSnapshot(payload.mineCell);
  const kind = payload.kind === 'equal' || payload.kind === 'add' || payload.kind === 'delete' || payload.kind === 'modify'
    ? payload.kind
    : null;
  if (!Number.isFinite(column) || !baseCell || !mineCell || !kind) return null;

  return {
    column,
    baseCell,
    mineCell,
    changed: Boolean(payload.changed),
    masked: Boolean(payload.masked),
    strictOnly: Boolean(payload.strictOnly),
    kind,
    hasBaseContent: Boolean(payload.hasBaseContent),
    hasMineContent: Boolean(payload.hasMineContent),
    hasContent: Boolean(payload.hasContent),
  };
}

function normalizeWorkbookRowDeltaPayload(input: unknown): WorkbookRowDeltaPayload | null {
  if (!input || typeof input !== 'object') return null;
  const payload = input as Record<string, unknown>;
  const lineIdx = Number(payload.lineIdx);
  const leftLineIdx = payload.leftLineIdx == null ? null : Number(payload.leftLineIdx);
  const rightLineIdx = payload.rightLineIdx == null ? null : Number(payload.rightLineIdx);
  const tone = payload.tone === 'equal' || payload.tone === 'add' || payload.tone === 'delete' || payload.tone === 'mixed'
    ? payload.tone
    : null;
  const lineIdxs = Array.isArray(payload.lineIdxs)
    ? payload.lineIdxs.map((value) => Number(value)).filter((value) => Number.isFinite(value))
    : [];
  const changedColumns = Array.isArray(payload.changedColumns)
    ? payload.changedColumns.map((value) => Number(value)).filter((value) => Number.isFinite(value))
    : [];
  const strictOnlyColumns = Array.isArray(payload.strictOnlyColumns)
    ? payload.strictOnlyColumns.map((value) => Number(value)).filter((value) => Number.isFinite(value))
    : [];
  const cellDeltas = Array.isArray(payload.cellDeltas)
    ? payload.cellDeltas
        .map(normalizeWorkbookCellDeltaPayload)
        .filter((value): value is WorkbookCellDeltaPayload => value != null)
    : [];
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
    hasChanges: Boolean(payload.hasChanges),
    tone,
  };
}

function normalizeWorkbookPrecomputedDeltaPayload(input: unknown): WorkbookPrecomputedDeltaPayload | null {
  if (!input || typeof input !== 'object') return null;
  const payload = input as Record<string, unknown>;
  if (payload.compareMode !== 'strict') return null;
  const sections = Array.isArray(payload.sections)
    ? payload.sections.flatMap((entry) => {
        if (!entry || typeof entry !== 'object') return [];
        const raw = entry as Record<string, unknown>;
        const name = typeof raw.name === 'string' ? raw.name : '';
        if (!name) return [];
        const rows = Array.isArray(raw.rows)
          ? raw.rows
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
    diffLines: normalizeRustDiffLines(payload.diffLines),
    workbookDelta: normalizeWorkbookPrecomputedDeltaPayload(payload.workbookDelta),
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

async function tryResolveWorkbookDiffsWithRust(
  baseFilePath: string,
  mineFilePath: string,
): Promise<RustWorkbookDiffCollection> {
  const [strictResult, contentResult] = await Promise.all([
    tryResolveWorkbookDiffWithRust(baseFilePath, mineFilePath, 'strict'),
    tryResolveWorkbookDiffWithRust(baseFilePath, mineFilePath, 'content'),
  ]);

  return {
    diffLinesByMode: {
      strict: strictResult.diffLines,
      content: contentResult.diffLines,
    },
    workbookDeltaByMode: {
      strict: strictResult.workbookDelta,
      content: contentResult.workbookDelta,
    },
    parseMs: strictResult.parseMs + contentResult.parseMs,
  };
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

async function readFilePayload(filePath: string): Promise<FilePayload> {
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
      return cachedPayload.payload;
    }

    if (isWorkbookFile(filePath)) {
      const readStart = performance.now();
      const buffer = await fs.promises.readFile(filePath);
      const workbookBytes = Uint8Array.from(buffer);
      const readMs = performance.now() - readStart;
      const [parsedWorkbook, metadataResult] = await Promise.all([
        tryParseWorkbookWithRust(filePath),
        tryResolveWorkbookMetadataWithRust(filePath),
      ]);
      const payload = {
        content: parsedWorkbook.content,
        bytes: workbookBytes,
        metadata: metadataResult.metadata,
        perf: {
          readMs,
          parserMs: parsedWorkbook.parseMs,
          metadataMs: metadataResult.parseMs,
          byteLength: workbookBytes.length,
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

async function buildPayloadFromBuffer(buffer: Buffer, fileName: string): Promise<FilePayload> {
  if (isWorkbookFile(fileName)) {
    const bytes = Uint8Array.from(buffer);
    const tempFilePath = path.join(
      os.tmpdir(),
      `svn-excel-diff-${Date.now()}-${Math.random().toString(16).slice(2)}${getExtension(fileName) || '.bin'}`,
    );

    try {
      await fs.promises.writeFile(tempFilePath, buffer);
      const [parsedWorkbook, metadataResult] = await Promise.all([
        tryParseWorkbookWithRust(tempFilePath),
        tryResolveWorkbookMetadataWithRust(tempFilePath),
      ]);
      return {
        content: parsedWorkbook.content,
        bytes,
        metadata: metadataResult.metadata,
        perf: {
          readMs: 0,
          parserMs: parsedWorkbook.parseMs,
          metadataMs: metadataResult.parseMs,
          byteLength: bytes.length,
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
      title: '当前基线',
      author: '',
      date: '',
      message: '当前已加载的基线输入文件',
      kind: 'input-file',
    });
  }

  if (args.minePath && fs.existsSync(args.minePath)) {
    entries.push({
      id: SPECIAL_MINE_ID,
      revision: extractRevisionToken(args.mineName) || 'LOCAL',
      title: '当前本地',
      author: '',
      date: '',
      message: '当前已加载的本地输入文件',
      kind: 'working-copy',
    });
  }

  return entries;
}

async function getRevisionOptions(): Promise<SvnRevisionInfo[]> {
  if (cachedRevisionOptions) return cachedRevisionOptions;

  const target = await resolveSvnTarget();
  const specials = buildSpecialRevisionEntries();
  if (!target) {
    cachedRevisionOptions = specials;
    return specials;
  }

  const result = await runSvnUtf8(['log', '--xml', '--limit', '60', target]);
  if (!result.ok) {
    if (result.stderr.trim()) console.warn('[svn-log]', result.stderr.trim());
    cachedRevisionOptions = specials;
    return specials;
  }

  const revisions = parseLogEntries(result.stdout);
  cachedRevisionOptions = [...specials, ...revisions];
  return cachedRevisionOptions;
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

async function readRevisionPayload(source: SvnRevisionInfo, target: string, fileName: string): Promise<FilePayload> {
  const args = getActiveCliArgs();
  if (source.id === SPECIAL_BASE_ID) return readFilePayload(args.basePath);
  if (source.id === SPECIAL_MINE_ID) return readFilePayload(args.minePath);

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

  const payload = await buildPayloadFromBuffer(result.stdout, fileName);
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

async function buildDiffData(
  baseRevisionId?: string,
  mineRevisionId?: string,
  revisionOptionsOverride?: SvnRevisionInfo[],
): Promise<DiffData> {
  const buildStart = performance.now();
  const args = getActiveCliArgs();
  const target = await resolveSvnTarget();
  const revisionOptions = revisionOptionsOverride ?? await getRevisionOptions();
  const resolvedFileName = args.fileName.trim()
    || path.basename(args.minePath || args.basePath || '');

  const baseRevisionInfo = resolveRevisionById('base', revisionOptions, baseRevisionId);
  const mineRevisionInfo = resolveRevisionById('mine', revisionOptions, mineRevisionId);
  const directRustDiffTask = !baseRevisionId
    && !mineRevisionId
    && canUseDirectWorkbookDiff(args.basePath, args.minePath, resolvedFileName)
      ? tryResolveWorkbookDiffsWithRust(args.basePath, args.minePath)
      : null;

  const [basePayload, minePayload, directRustDiffResult] = await Promise.all([
    baseRevisionId
      ? readRevisionPayload(baseRevisionInfo, target, resolvedFileName)
      : readFilePayload(args.basePath),
    mineRevisionId
      ? readRevisionPayload(mineRevisionInfo, target, resolvedFileName)
      : readFilePayload(args.minePath),
    directRustDiffTask ?? Promise.resolve(null),
  ]);
  const rustDiffResult = directRustDiffResult ?? (isWorkbookFile(resolvedFileName)
    ? await withWorkbookDiffSources(
        baseRevisionId ? '' : args.basePath,
        basePayload.bytes,
        mineRevisionId ? '' : args.minePath,
        minePayload.bytes,
        resolvedFileName,
        (basePath, minePath) => tryResolveWorkbookDiffsWithRust(basePath, minePath),
      )
    : null);

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
    baseContent: basePayload.content,
    mineContent: minePayload.content,
    baseBytes: basePayload.bytes,
    mineBytes: minePayload.bytes,
    precomputedDiffLines: rustDiffResult?.diffLinesByMode.strict ?? null,
    precomputedWorkbookDelta: rustDiffResult?.workbookDeltaByMode.strict ?? null,
    precomputedDiffLinesByMode: rustDiffResult?.diffLinesByMode ?? null,
    precomputedWorkbookDeltaByMode: rustDiffResult?.workbookDeltaByMode ?? null,
    baseWorkbookMetadata: basePayload.metadata,
    mineWorkbookMetadata: minePayload.metadata,
    revisionOptions,
    baseRevisionInfo,
    mineRevisionInfo,
    canSwitchRevisions: Boolean(target && revisionOptions.some(option => option.kind === 'revision')),
    perf: {
      source: baseRevisionId || mineRevisionId ? 'revision-switch' : 'cli',
      mainLoadMs: performance.now() - buildStart,
      baseReadMs: basePayload.perf.readMs,
      mineReadMs: minePayload.perf.readMs,
      baseParserMs: basePayload.perf.parserMs,
      mineParserMs: minePayload.perf.parserMs,
      metadataMs: basePayload.perf.metadataMs + minePayload.perf.metadataMs,
      rustDiffMs: rustDiffResult?.parseMs ?? 0,
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

async function buildDevWorkingCopyDiffData(filePath: string): Promise<DiffData> {
  const resolvedPath = filePath.trim();
  if (!resolvedPath) {
    throw new Error('Missing working copy path');
  }

  setActiveCliArgs(buildDevWorkingCopyCliArgs(resolvedPath));
  const revisionOptions = await getRevisionOptions();
  const { baseRevisionId, mineRevisionId } = resolveDefaultDevRevisionPair(revisionOptions);
  const data = await buildDiffData(baseRevisionId, mineRevisionId, revisionOptions);

  return {
    ...data,
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

async function buildLocalDiffData(basePath: string, minePath: string): Promise<DiffData> {
  const buildStart = performance.now();
  const resolvedBasePath = basePath.trim();
  const resolvedMinePath = minePath.trim();
  const resolvedFileName = path.basename(resolvedMinePath || resolvedBasePath || 'local-diff');
  const directRustDiffTask = canUseDirectWorkbookDiff(resolvedBasePath, resolvedMinePath, resolvedFileName)
    ? tryResolveWorkbookDiffsWithRust(resolvedBasePath, resolvedMinePath)
    : null;
  const [basePayload, minePayload, directRustDiffResult] = await Promise.all([
    readFilePayload(resolvedBasePath),
    readFilePayload(resolvedMinePath),
    directRustDiffTask ?? Promise.resolve(null),
  ]);
  const rustDiffResult = directRustDiffResult ?? (isWorkbookFile(resolvedFileName)
    ? await withWorkbookDiffSources(
        resolvedBasePath,
        basePayload.bytes,
        resolvedMinePath,
        minePayload.bytes,
        resolvedFileName,
        (baseFilePath, mineFilePath) => tryResolveWorkbookDiffsWithRust(baseFilePath, mineFilePath),
      )
    : null);

  return {
    svnUrl: '',
    fileName: resolvedFileName,
    baseName: resolveSideName('', resolvedBasePath),
    mineName: resolveSideName('', resolvedMinePath),
    baseContent: basePayload.content,
    mineContent: minePayload.content,
    baseBytes: basePayload.bytes,
    mineBytes: minePayload.bytes,
    precomputedDiffLines: rustDiffResult?.diffLinesByMode.strict ?? null,
    precomputedWorkbookDelta: rustDiffResult?.workbookDeltaByMode.strict ?? null,
    precomputedDiffLinesByMode: rustDiffResult?.diffLinesByMode ?? null,
    precomputedWorkbookDeltaByMode: rustDiffResult?.workbookDeltaByMode ?? null,
    baseWorkbookMetadata: basePayload.metadata,
    mineWorkbookMetadata: minePayload.metadata,
    revisionOptions: null,
    baseRevisionInfo: null,
    mineRevisionInfo: null,
    canSwitchRevisions: false,
    perf: {
      source: 'local-dev',
      mainLoadMs: performance.now() - buildStart,
      baseReadMs: basePayload.perf.readMs,
      mineReadMs: minePayload.perf.readMs,
      baseParserMs: basePayload.perf.parserMs,
      mineParserMs: minePayload.perf.parserMs,
      metadataMs: basePayload.perf.metadataMs + minePayload.perf.metadataMs,
      rustDiffMs: rustDiffResult?.parseMs ?? 0,
      baseBytes: basePayload.perf.byteLength,
      mineBytes: minePayload.perf.byteLength,
    },
  };
}

function createWindow() {
  const iconPath = resolveIconPath();

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

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error('[electron] failed to load window', {
      errorCode,
      errorDescription,
      validatedURL,
    });
  });
}

ipcMain.handle('get-diff-data', async () => buildDiffData());
ipcMain.handle('load-revision-diff', async (_, payload: { baseRevisionId?: string; mineRevisionId?: string } | undefined) => (
  buildDiffData(payload?.baseRevisionId, payload?.mineRevisionId)
));
ipcMain.handle('is-dev-mode', () => process.env.NODE_ENV === 'development');
ipcMain.handle('pick-diff-file', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select working copy file',
    properties: ['openFile'],
    filters: [
      { name: 'All files', extensions: ['*'] },
      {
        name: 'Supported files',
        extensions: ['xlsx', 'xlsm', 'xltx', 'xltm', 'xlsb', 'xls', 'csv', 'tsv', 'txt', 'json', 'js', 'ts', 'jsx', 'tsx', 'xml', 'lua', 'yaml', 'yml', 'ini', 'cfg', 'conf', 'md'],
      },
    ],
  });

  const selectedPath = result.canceled ? '' : (result.filePaths[0] ?? '');
  if (!selectedPath) return null;
  return {
    path: selectedPath,
    name: path.basename(selectedPath),
  };
});
ipcMain.handle('load-dev-working-copy-diff', async (_, payload: { filePath?: string } | undefined) => (
  buildDevWorkingCopyDiffData(payload?.filePath ?? '')
));
ipcMain.handle('load-local-diff', async (_, payload: { basePath?: string; minePath?: string } | undefined) => (
  buildLocalDiffData(payload?.basePath ?? '', payload?.minePath ?? '')
));
ipcMain.handle('get-theme', () => (nativeTheme.shouldUseDarkColors ? 'dark' : 'light'));

ipcMain.on('clipboard-write-text', (_, text: unknown) => {
  if (typeof text === 'string') {
    clipboard.writeText(text);
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

configureDevelopmentPaths();
void app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
