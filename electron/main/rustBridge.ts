import { execFile, spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { performance } from 'node:perf_hooks';
import { promisify } from 'node:util';
import { APP_ROOT, RUST_COMMAND_TIMEOUT_MS, RUST_MAX_BUFFER, RUST_PARSER_NAME, SVN_BINARY_MAX_BUFFER, SVN_TEXT_MAX_BUFFER } from './constants.js';
import { logDebugTiming, logRustDebugStderr } from './logger.js';
import { logMainWarn } from '../logging.js';
import {
  hasWorkbookCellContent,
  isWorkbookStrictOnlyDifference,
  resolveWorkbookCellDeltaKind,
  resolveWorkbookMiniMapDescriptorFromDeltas,
  resolveWorkbookRowDeltaTone,
  workbookCellsDiffer,
} from '../../shared/workbookCellSemantics.js';
import type {
  DiffLine,
  RustDiffLinePayload,
  RustWorkbookDiffPayload,
  WorkbookCellDeltaPayload,
  WorkbookCellSnapshot,
  WorkbookCompareMode,
  WorkbookMetadataMap,
  WorkbookPrecomputedDeltaPayload,
  WorkbookRowMiniMapPaintTone,
  WorkbookRowDeltaPayload,
  WorkbookSheetMetadata,
} from './types.js';

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Command execution helpers
// ---------------------------------------------------------------------------

async function execFileTextCommand(
  file: string,
  args: string[],
  maxBuffer: number,
  timeout?: number,
): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  try {
    const result = await execFileAsync(file, args, {
      encoding: 'utf-8',
      windowsHide: true,
      maxBuffer,
      ...(timeout != null ? { timeout } : {}),
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

function resolveRustParserPath(): string | null {
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
    const result = await execFileTextCommand(
      parserPath,
      [filePath],
      RUST_MAX_BUFFER,
      RUST_COMMAND_TIMEOUT_MS,
    );
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

export async function tryResolveWorkbookMetadataWithRust(
  filePath: string,
): Promise<{ metadata: WorkbookMetadataMap | null; parseMs: number }> {
  const parserPath = resolveRustParserPath();
  if (!parserPath) return { metadata: null, parseMs: 0 };

  const parseStart = performance.now();
  try {
    const result = await execFileTextCommand(
      parserPath,
      ['--metadata-json', filePath],
      RUST_MAX_BUFFER,
      RUST_COMMAND_TIMEOUT_MS,
    );
    const commandMs = performance.now() - parseStart;
    logRustDebugStderr('rust-parser-metadata', result.stderr);

    if (!result.ok || !result.stdout.trim()) {
      if (result.stderr.trim()) {
        logMainWarn('rust-parser-metadata', result.stderr.trim());
      }
      return { metadata: null, parseMs: commandMs };
    }

    const jsonParseStart = performance.now();
    const parsed = JSON.parse(result.stdout) as unknown;
    const jsonParseMs = performance.now() - jsonParseStart;
    const normalizeStart = performance.now();
    const metadata = normalizeWorkbookMetadata(parsed);
    const normalizeMs = performance.now() - normalizeStart;
    const parseMs = performance.now() - parseStart;
    logDebugTiming('rust-bridge-metadata:done', {
      filePath,
      commandMs: Number(commandMs.toFixed(1)),
      jsonParseMs: Number(jsonParseMs.toFixed(1)),
      normalizeMs: Number(normalizeMs.toFixed(1)),
      totalMs: Number(parseMs.toFixed(1)),
      stdoutBytes: Buffer.byteLength(result.stdout, 'utf-8'),
    });
    return {
      metadata,
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
  const hasBaseContent = hasWorkbookCellContent(baseCell, 'strict');
  const hasMineContent = hasWorkbookCellContent(mineCell, 'strict');
  const valueChanged = workbookCellsDiffer(baseCell, mineCell, 'strict');
  const changed = explicitChanged == null ? true : Boolean(explicitChanged);
  const kind = kindValue === 'equal' || kindValue === 'add' || kindValue === 'delete' || kindValue === 'modify'
    ? kindValue
    : (
      changed
        ? (valueChanged ? resolveWorkbookCellDeltaKind(baseCell, mineCell, 'strict') : 'modify')
        : 'equal'
    );
  if (!Number.isFinite(column) || !baseCell || !mineCell || !kind) return null;
  const strictOnly = isWorkbookStrictOnlyDifference(baseCell, mineCell);

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
  const baseRowNumber = payload.baseRowNumber == null && payload.br == null
    ? null
    : Number(payload.baseRowNumber ?? payload.br);
  const mineRowNumber = payload.mineRowNumber == null && payload.mr == null
    ? null
    : Number(payload.mineRowNumber ?? payload.mr);
  const rawLineIdxs = Array.isArray(payload.lineIdxs) ? payload.lineIdxs : null;
  const lineIdxs = rawLineIdxs
    ? Array.from(new Set(rawLineIdxs.map((value: unknown) => Number(value)).filter((value) => Number.isFinite(value))))
    : Array.from(new Set([leftLineIdx, rightLineIdx].filter((value): value is number => Number.isFinite(value))));
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
  const fallbackTone = resolveWorkbookRowDeltaTone(cellDeltas);
  const tone = toneValue === 'equal' || toneValue === 'add' || toneValue === 'delete' || toneValue === 'mixed'
    ? toneValue
    : fallbackTone;
  const rawMiniMapTone = payload.miniMapTone;
  const rawMiniMapPaintTones = Array.isArray(payload.miniMapPaintTones)
    ? payload.miniMapPaintTones
    : null;
  const fallbackMiniMapDescriptor = resolveWorkbookMiniMapDescriptorFromDeltas(cellDeltas);
  const miniMapTone = rawMiniMapTone === 'equal'
    || rawMiniMapTone === 'add'
    || rawMiniMapTone === 'delete'
    || rawMiniMapTone === 'modify'
    || rawMiniMapTone === 'strict-only'
    || rawMiniMapTone === 'mixed'
    ? rawMiniMapTone
    : fallbackMiniMapDescriptor.tone;
  const miniMapPaintTones = rawMiniMapPaintTones
    ? rawMiniMapPaintTones.filter((value): value is WorkbookRowMiniMapPaintTone => (
        value === 'delete'
        || value === 'modify'
        || value === 'add'
        || value === 'strict-only'
      ))
    : fallbackMiniMapDescriptor.tones;
  const lineIdx = Number.isFinite(Number(payload.lineIdx)) ? Number(payload.lineIdx) : (lineIdxs[0] ?? 0);
  if (!Number.isFinite(lineIdx) || !tone) return null;

  return {
    lineIdx,
    lineIdxs,
    leftLineIdx: Number.isFinite(leftLineIdx) ? leftLineIdx : null,
    rightLineIdx: Number.isFinite(rightLineIdx) ? rightLineIdx : null,
    baseRowNumber: Number.isFinite(baseRowNumber) ? baseRowNumber : null,
    mineRowNumber: Number.isFinite(mineRowNumber) ? mineRowNumber : null,
    cellDeltas,
    changedColumns,
    strictOnlyColumns,
    changedCount: Number.isFinite(Number(payload.changedCount))
      ? Number(payload.changedCount)
      : cellDeltas.filter((delta) => delta.changed).length,
    hasChanges: payload.hasChanges == null ? changedColumns.length > 0 : Boolean(payload.hasChanges),
    tone,
    miniMapTone,
    miniMapPaintTones,
  };
}

function normalizeWorkbookPrecomputedDeltaPayload(
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
        const normalizedSection = {
          name,
          rows,
        } as WorkbookPrecomputedDeltaPayload['sections'][number];
        const hasBaseSide = raw.hasBaseSide ?? raw.b;
        if (hasBaseSide != null) normalizedSection.hasBaseSide = Boolean(hasBaseSide);
        const hasMineSide = raw.hasMineSide ?? raw.e;
        if (hasMineSide != null) normalizedSection.hasMineSide = Boolean(hasMineSide);
        const startLineIdx = Number(raw.startLineIdx ?? raw.sl);
        if (Number.isFinite(startLineIdx)) normalizedSection.startLineIdx = startLineIdx;
        const endLineIdx = Number(raw.endLineIdx ?? raw.el);
        if (Number.isFinite(endLineIdx)) normalizedSection.endLineIdx = endLineIdx;
        const maxColumns = Number(raw.maxColumns ?? raw.mc);
        if (Number.isFinite(maxColumns)) normalizedSection.maxColumns = maxColumns;
        const rowCount = Number(raw.rowCount ?? raw.rc);
        if (Number.isFinite(rowCount)) normalizedSection.rowCount = rowCount;
        const firstDataLineIdx = Number(raw.firstDataLineIdx ?? raw.fdl);
        if (Number.isFinite(firstDataLineIdx)) normalizedSection.firstDataLineIdx = firstDataLineIdx;
        const firstDataRowNumber = Number(raw.firstDataRowNumber ?? raw.fdr);
        if (Number.isFinite(firstDataRowNumber)) normalizedSection.firstDataRowNumber = firstDataRowNumber;
        return [normalizedSection];
      })
    : [];

  return { compareMode, sections };
}

function normalizeRustWorkbookDiffPayload(
  input: unknown,
): {
  diffLines: DiffLine[] | null;
  workbookDelta: WorkbookPrecomputedDeltaPayload | null;
  baseMetadata: WorkbookMetadataMap | null;
  mineMetadata: WorkbookMetadataMap | null;
  metadataMs: number | null;
} {
  if (Array.isArray(input)) {
    return {
      diffLines: normalizeRustDiffLines(input),
      workbookDelta: null,
      baseMetadata: null,
      mineMetadata: null,
      metadataMs: null,
    };
  }

  if (!input || typeof input !== 'object') {
    return {
      diffLines: null,
      workbookDelta: null,
      baseMetadata: null,
      mineMetadata: null,
      metadataMs: null,
    };
  }

  const payload = input as RustWorkbookDiffPayload;
  const perf = (payload.perf ?? payload.p) as { metadataMs?: unknown; md?: unknown } | null | undefined;
  const metadataMs = Number(perf?.metadataMs ?? perf?.md);
  return {
    diffLines: normalizeRustDiffLines(payload.diffLines ?? payload.d),
    workbookDelta: normalizeWorkbookPrecomputedDeltaPayload(payload.workbookDelta ?? payload.w),
    baseMetadata: normalizeWorkbookMetadata(payload.baseMetadata ?? payload.mb),
    mineMetadata: normalizeWorkbookMetadata(payload.mineMetadata ?? payload.mm),
    metadataMs: Number.isFinite(metadataMs) ? metadataMs : null,
  };
}


export async function tryResolveWorkbookDiffWithRust(
  baseFilePath: string,
  mineFilePath: string,
  compareMode: WorkbookCompareMode = 'strict',
): Promise<{
  diffLines: DiffLine[] | null;
  workbookDelta: WorkbookPrecomputedDeltaPayload | null;
  baseMetadata: WorkbookMetadataMap | null;
  mineMetadata: WorkbookMetadataMap | null;
  metadataMs: number | null;
  parseMs: number;
}> {
  const parserPath = resolveRustParserPath();
  if (!parserPath) {
    return {
      diffLines: null,
      workbookDelta: null,
      baseMetadata: null,
      mineMetadata: null,
      metadataMs: null,
      parseMs: 0,
    };
  }

  const parseStart = performance.now();
  try {
    const result = await execFileTextCommand(
      parserPath,
      ['--diff-json', baseFilePath, mineFilePath, '--compare-mode', compareMode],
      RUST_MAX_BUFFER,
      RUST_COMMAND_TIMEOUT_MS,
    );
    const commandMs = performance.now() - parseStart;
    logRustDebugStderr('rust-parser-diff', result.stderr);
    if (!result.ok || !result.stdout.trim()) {
      if (result.stderr.trim()) logMainWarn('rust-parser-diff', result.stderr.trim());
      return {
        diffLines: null,
        workbookDelta: null,
        baseMetadata: null,
        mineMetadata: null,
        metadataMs: null,
        parseMs: commandMs,
      };
    }

    const jsonParseStart = performance.now();
    const parsed = JSON.parse(result.stdout) as unknown;
    const jsonParseMs = performance.now() - jsonParseStart;
    const normalizeStart = performance.now();
    const normalized = normalizeRustWorkbookDiffPayload(parsed);
    const normalizeMs = performance.now() - normalizeStart;
    const parseMs = performance.now() - parseStart;
    logDebugTiming('rust-bridge-diff:done', {
      baseFilePath,
      mineFilePath,
      compareMode,
      commandMs: Number(commandMs.toFixed(1)),
      jsonParseMs: Number(jsonParseMs.toFixed(1)),
      normalizeMs: Number(normalizeMs.toFixed(1)),
      totalMs: Number(parseMs.toFixed(1)),
      stdoutBytes: Buffer.byteLength(result.stdout, 'utf-8'),
      diffLineCount: normalized.diffLines?.length ?? 0,
      sectionCount: normalized.workbookDelta?.sections.length ?? 0,
    });
    return {
      diffLines: normalized.diffLines,
      workbookDelta: normalized.workbookDelta,
      baseMetadata: normalized.baseMetadata,
      mineMetadata: normalized.mineMetadata,
      metadataMs: normalized.metadataMs,
      parseMs,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logMainWarn('rust-parser-diff', message);
    return {
      diffLines: null,
      workbookDelta: null,
      baseMetadata: null,
      mineMetadata: null,
      metadataMs: null,
      parseMs: performance.now() - parseStart,
    };
  }
}


export function tryResolveWorkbookDiffStreamWithRust(
  baseFilePath: string,
  mineFilePath: string,
  primaryMode: WorkbookCompareMode,
  onAlternate?: (result: {
    compareMode: WorkbookCompareMode;
    diffLines: DiffLine[] | null;
    workbookDelta: WorkbookPrecomputedDeltaPayload | null;
    baseMetadata: WorkbookMetadataMap | null;
    mineMetadata: WorkbookMetadataMap | null;
    metadataMs: number | null;
    parseMs: number;
  }) => void,
): Promise<{
  diffLines: DiffLine[] | null;
  workbookDelta: WorkbookPrecomputedDeltaPayload | null;
  baseMetadata: WorkbookMetadataMap | null;
  mineMetadata: WorkbookMetadataMap | null;
  metadataMs: number | null;
  parseMs: number;
}> {
  const parserPath = resolveRustParserPath();
  if (!parserPath) {
    return Promise.resolve({
      diffLines: null,
      workbookDelta: null,
      baseMetadata: null,
      mineMetadata: null,
      metadataMs: null,
      parseMs: 0,
    });
  }

  return new Promise((resolve) => {
    const parseStart = performance.now();
    const alternateMode: WorkbookCompareMode = primaryMode === 'strict' ? 'content' : 'strict';
    const child = spawn(
      parserPath,
      ['--diff-json-stream', baseFilePath, mineFilePath, primaryMode],
      {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    child.stdout.setEncoding('utf-8');
    child.stderr.setEncoding('utf-8');

    let stdoutBuffer = '';
    let stderr = '';
    let primaryResolved = false;
    let lineIndex = 0;
    let terminated = false;
    const emptyResult = () => ({
      diffLines: null,
      workbookDelta: null,
      baseMetadata: null,
      mineMetadata: null,
      metadataMs: null,
      parseMs: performance.now() - parseStart,
    });
    const timeoutId = setTimeout(() => {
      terminated = true;
      child.kill();
      if (!primaryResolved) {
        primaryResolved = true;
        resolve(emptyResult());
      }
      logMainWarn('rust-parser-diff-stream', `timed out after ${RUST_COMMAND_TIMEOUT_MS}ms`);
    }, RUST_COMMAND_TIMEOUT_MS);
    timeoutId.unref?.();

    const handleLine = (line: string) => {
      if (!line.trim()) return;
      const jsonParseStart = performance.now();
      try {
        const parsed = JSON.parse(line) as unknown;
        const jsonParseMs = performance.now() - jsonParseStart;
        const normalizeStart = performance.now();
        const normalized = normalizeRustWorkbookDiffPayload(parsed);
        const normalizeMs = performance.now() - normalizeStart;
        const parseMs = performance.now() - parseStart;
        const result = {
          diffLines: normalized.diffLines,
          workbookDelta: normalized.workbookDelta,
          baseMetadata: normalized.baseMetadata,
          mineMetadata: normalized.mineMetadata,
          metadataMs: normalized.metadataMs,
          parseMs,
        };
        if (lineIndex === 0) {
          primaryResolved = true;
          resolve(result);
          logDebugTiming('rust-bridge-diff-stream:primary', {
            primaryMode,
            totalMs: Number(parseMs.toFixed(1)),
            jsonParseMs: Number(jsonParseMs.toFixed(1)),
            normalizeMs: Number(normalizeMs.toFixed(1)),
            stdoutBytes: Buffer.byteLength(line, 'utf-8'),
          });
        } else if (lineIndex === 1) {
          try {
            onAlternate?.({ compareMode: alternateMode, ...result });
          } catch (error) {
            logMainWarn(
              'rust-parser-diff-stream',
              'alternate callback failed:',
              error instanceof Error ? error.message : String(error),
            );
          }
          logDebugTiming('rust-bridge-diff-stream:alternate', {
            alternateMode,
            totalMs: Number(parseMs.toFixed(1)),
            jsonParseMs: Number(jsonParseMs.toFixed(1)),
            normalizeMs: Number(normalizeMs.toFixed(1)),
            stdoutBytes: Buffer.byteLength(line, 'utf-8'),
          });
        }
        lineIndex += 1;
      } catch (error) {
        logMainWarn(
          'rust-parser-diff-stream',
          'decode failed:',
          error instanceof Error ? error.message : String(error),
        );
        if (!primaryResolved) {
          primaryResolved = true;
          resolve(emptyResult());
        }
      }
    };
    const drainLines = () => {
      let lineEnd = stdoutBuffer.indexOf('\n');
      while (lineEnd >= 0) {
        const line = stdoutBuffer.slice(0, lineEnd);
        stdoutBuffer = stdoutBuffer.slice(lineEnd + 1);
        handleLine(line);
        lineEnd = stdoutBuffer.indexOf('\n');
      }
    };

    child.stdout.on('data', (chunk: string) => {
      stdoutBuffer += chunk;
      if (Buffer.byteLength(stdoutBuffer, 'utf-8') > RUST_MAX_BUFFER) {
        terminated = true;
        child.kill();
        logMainWarn('rust-parser-diff-stream', 'output exceeded buffer limit');
        if (!primaryResolved) {
          primaryResolved = true;
          resolve(emptyResult());
        }
        return;
      }
      drainLines();
    });
    child.stderr.on('data', (chunk: string) => {
      if (stderr.length < 1024 * 1024) stderr += chunk;
    });
    child.on('error', (error) => {
      clearTimeout(timeoutId);
      logMainWarn('rust-parser-diff-stream', error.message);
      if (!primaryResolved) {
        primaryResolved = true;
        resolve(emptyResult());
      }
    });
    child.on('close', (code) => {
      clearTimeout(timeoutId);
      if (stdoutBuffer.trim()) handleLine(stdoutBuffer);
      logRustDebugStderr('rust-parser-diff-stream', stderr);
      if (!primaryResolved) {
        primaryResolved = true;
        resolve(emptyResult());
      }
      if (!terminated && code !== 0) {
        logMainWarn('rust-parser-diff-stream', stderr.trim() || `exited with code ${code}`);
      }
    });
  });
}

