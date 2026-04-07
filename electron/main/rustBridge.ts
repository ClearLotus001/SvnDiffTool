import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { performance } from 'node:perf_hooks';
import { promisify } from 'node:util';
import { APP_ROOT, RUST_MAX_BUFFER, RUST_PARSER_NAME, SVN_BINARY_MAX_BUFFER, SVN_TEXT_MAX_BUFFER } from './constants.js';
import { logRustDebugStderr } from './logger.js';
import { logMainWarn } from '../logging.js';
import type {
  DiffLine,
  RustDiffLinePayload,
  RustWorkbookDiffPayload,
  WorkbookCellDeltaKind,
  WorkbookCellDeltaPayload,
  WorkbookCellSnapshot,
  WorkbookCompareMode,
  WorkbookMetadataMap,
  WorkbookPrecomputedDeltaPayload,
  WorkbookRowDeltaPayload,
  WorkbookSheetMetadata,
} from './types.js';

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Command execution helpers
// ---------------------------------------------------------------------------

export async function execFileTextCommand(
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

export async function execFileBufferCommand(
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

// ---------------------------------------------------------------------------
// SVN command wrappers
// ---------------------------------------------------------------------------

export function runSvnUtf8(args: string[]): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  return execFileTextCommand('svn', args, SVN_TEXT_MAX_BUFFER);
}

export function runSvnBuffer(args: string[]): Promise<{ ok: boolean; stdout: Buffer; stderr: string }> {
  return execFileBufferCommand('svn', args, SVN_BINARY_MAX_BUFFER);
}

// ---------------------------------------------------------------------------
// Rust parser path resolution
// ---------------------------------------------------------------------------

export function resolveRustParserPath(): string | null {
  const candidates = [
    path.join(APP_ROOT, 'rust', 'target', 'release', RUST_PARSER_NAME),
    path.join(process.resourcesPath, 'bin', RUST_PARSER_NAME),
  ];

  return candidates.find(candidate => fs.existsSync(candidate)) ?? null;
}

// ---------------------------------------------------------------------------
// Rust parser operations
// ---------------------------------------------------------------------------

export async function tryParseWorkbookWithRust(
  filePath: string,
): Promise<{ content: string | null; parseMs: number }> {
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
      logMainWarn('rust-parser', result.stderr.trim());
    }
    return { content: null, parseMs };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logMainWarn('rust-parser', message);
    return { content: null, parseMs: performance.now() - parseStart };
  }
}

// ---------------------------------------------------------------------------
// Workbook metadata normalization
// ---------------------------------------------------------------------------

export function normalizeWorkbookMetadata(input: unknown): WorkbookMetadataMap | null {
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

export async function tryResolveWorkbookMetadataWithRust(
  filePath: string,
): Promise<{ metadata: WorkbookMetadataMap | null; parseMs: number }> {
  const parserPath = resolveRustParserPath();
  if (!parserPath) return { metadata: null, parseMs: 0 };

  const parseStart = performance.now();
  try {
    const result = await execFileTextCommand(parserPath, ['--metadata-json', filePath], RUST_MAX_BUFFER);
    const parseMs = performance.now() - parseStart;
    logRustDebugStderr('rust-parser-metadata', result.stderr);

    if (!result.ok || !result.stdout.trim()) {
      if (result.stderr.trim()) {
        logMainWarn('rust-parser-metadata', result.stderr.trim());
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
    logMainWarn('rust-parser-metadata', message);
    return { metadata: null, parseMs: performance.now() - parseStart };
  }
}

// ---------------------------------------------------------------------------
// Diff line normalization
// ---------------------------------------------------------------------------

export function normalizeRustDiffLines(input: unknown): DiffLine[] | null {
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
    const baseLineNo = payload.baseLineNo == null && payload.bl == null
      ? null
      : Number(payload.baseLineNo ?? payload.bl);
    const mineLineNo = payload.mineLineNo == null && payload.ml == null
      ? null
      : Number(payload.mineLineNo ?? payload.ml);
    return [{
      type,
      base: baseValue,
      mine: mineValue ?? (type === 'equal' ? baseValue : null),
      baseLineNo: Number.isFinite(baseLineNo) ? baseLineNo : null,
      mineLineNo: Number.isFinite(mineLineNo)
        ? mineLineNo
        : (type === 'equal' ? (Number.isFinite(baseLineNo) ? baseLineNo : null) : null),
      baseCharSpans: null,
      mineCharSpans: null,
    }];
  });

  return diffLines;
}

// ---------------------------------------------------------------------------
// Workbook cell/row/delta normalization
// ---------------------------------------------------------------------------

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
  const explicitChanged = payload.changed ?? payload.x;
  const kindValue = payload.kind ?? payload.k;
  if (!Number.isFinite(column) || !baseCell || !mineCell) return null;
  const hasBaseContent = hasNormalizedWorkbookCellContent(baseCell, 'strict');
  const hasMineContent = hasNormalizedWorkbookCellContent(mineCell, 'strict');
  const valueChanged = workbookCellsDifferForMode(baseCell, mineCell, 'strict');
  const changed = explicitChanged == null ? true : Boolean(explicitChanged);
  const kind = kindValue === 'equal' || kindValue === 'add' || kindValue === 'delete' || kindValue === 'modify'
    ? kindValue
    : (
      changed
        ? (valueChanged ? getWorkbookCellDeltaKind(baseCell, mineCell, 'strict') : 'modify')
        : 'equal'
    );
  if (!Number.isFinite(column) || !baseCell || !mineCell || !kind) return null;
  const strictOnly = workbookCellsDifferForMode(baseCell, mineCell, 'strict')
    && !workbookCellsDifferForMode(baseCell, mineCell, 'content');

  return {
    column,
    baseCell,
    mineCell,
    changed,
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
  const leftLineIdx = payload.leftLineIdx == null && payload.l == null
    ? null
    : Number(payload.leftLineIdx ?? payload.l);
  const rightLineIdx = payload.rightLineIdx == null && payload.r == null
    ? null
    : Number(payload.rightLineIdx ?? payload.r);
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
    changedCount: Number.isFinite(Number(payload.changedCount))
      ? Number(payload.changedCount)
      : cellDeltas.filter((delta) => delta.changed).length,
    hasChanges: payload.hasChanges == null ? changedColumns.length > 0 : Boolean(payload.hasChanges),
    tone,
  };
}

export function normalizeWorkbookPrecomputedDeltaPayload(
  input: unknown,
): WorkbookPrecomputedDeltaPayload | null {
  if (!input || typeof input !== 'object') return null;
  const payload = input as Record<string, unknown>;
  const compareMode = payload.compareMode ?? payload.m ?? 'strict';
  if (compareMode !== 'strict' && compareMode !== 'content') return null;
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

  return { compareMode, sections };
}

export function normalizeRustWorkbookDiffPayload(
  input: unknown,
): { diffLines: DiffLine[] | null; workbookDelta: WorkbookPrecomputedDeltaPayload | null } {
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

export async function tryResolveWorkbookDiffWithRust(
  baseFilePath: string,
  mineFilePath: string,
  compareMode: WorkbookCompareMode = 'strict',
): Promise<{
  diffLines: DiffLine[] | null;
  workbookDelta: WorkbookPrecomputedDeltaPayload | null;
  parseMs: number;
}> {
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
      if (result.stderr.trim()) logMainWarn('rust-parser-diff', result.stderr.trim());
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
    logMainWarn('rust-parser-diff', message);
    return { diffLines: null, workbookDelta: null, parseMs: performance.now() - parseStart };
  }
}

export function createWorkbookDiffLinesByMode(
  compareMode: WorkbookCompareMode,
  diffLines: DiffLine[] | null,
): Partial<Record<WorkbookCompareMode, DiffLine[] | null>> | null {
  if (!diffLines) return null;
  return { [compareMode]: diffLines };
}

export function createWorkbookDeltaByMode(
  compareMode: WorkbookCompareMode,
  workbookDelta: WorkbookPrecomputedDeltaPayload | null,
): Partial<Record<WorkbookCompareMode, WorkbookPrecomputedDeltaPayload | null>> | null {
  if (!workbookDelta) return null;
  return { [compareMode]: workbookDelta };
}
