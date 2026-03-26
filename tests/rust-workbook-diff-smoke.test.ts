import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

import { zipSync, strToU8 } from 'fflate';
import type { DiffLine } from '../src/types';
import { getWorkbookSections } from '../src/utils/workbookSections';
import { buildWorkbookSectionRowIndex } from '../src/utils/workbookSheetIndex';
import { buildWorkbookCompareCells, parseWorkbookRowLine } from '../src/utils/workbookCompare';

interface RustDiffLinePayload {
  type?: string;
  t?: string;
  base?: string | null;
  b?: string | null;
  mine?: string | null;
  m?: string | null;
  baseLineNo?: number | null;
  bl?: number | null;
  mineLineNo?: number | null;
  ml?: number | null;
}

interface RustWorkbookDiffOutput {
  diffLines: DiffLine[];
  workbookDelta: {
    compareMode: 'strict';
    sections: Array<{
      name: string;
      rows: Array<{
        lineIdx: number;
        lineIdxs: number[];
        leftLineIdx: number | null;
        rightLineIdx: number | null;
        changedColumns: number[];
      }>;
    }>;
  } | null;
}

function normalizeRustDiffLines(input: unknown): DiffLine[] {
  if (!Array.isArray(input)) return [];

  return input.flatMap((entry): DiffLine[] => {
    if (!entry || typeof entry !== 'object') return [];

    const payload = entry as RustDiffLinePayload;
    const typeValue = payload.type ?? payload.t;
    const type = typeValue === 'equal' || typeValue === 'add' || typeValue === 'delete'
      ? typeValue
      : null;
    if (!type) return [];

    const base = typeof (payload.base ?? payload.b) === 'string' ? String(payload.base ?? payload.b) : null;
    const mine = typeof (payload.mine ?? payload.m) === 'string' ? String(payload.mine ?? payload.m) : null;
    const baseLineNo = payload.baseLineNo == null && payload.bl == null ? null : Number(payload.baseLineNo ?? payload.bl);
    const mineLineNo = payload.mineLineNo == null && payload.ml == null ? null : Number(payload.mineLineNo ?? payload.ml);

    return [{
      type,
      base,
      mine: mine ?? (type === 'equal' ? base : null),
      baseLineNo: Number.isFinite(baseLineNo) ? baseLineNo : null,
      mineLineNo: Number.isFinite(mineLineNo) ? mineLineNo : (type === 'equal' ? baseLineNo : null),
      baseCharSpans: null,
      mineCharSpans: null,
    }];
  });
}

function normalizeWorkbookDelta(input: unknown): RustWorkbookDiffOutput['workbookDelta'] {
  if (!input || typeof input !== 'object') return null;
  const payload = input as Record<string, unknown>;
  const compareMode = payload.compareMode ?? payload.m;
  if (compareMode !== 'strict') return null;
  const rawSections = Array.isArray(payload.sections ?? payload.s)
    ? ((payload.sections ?? payload.s) as unknown[])
    : [];

  return {
    compareMode: 'strict',
    sections: rawSections.flatMap((entry) => {
      if (!entry || typeof entry !== 'object') return [];
      const rawSection = entry as Record<string, unknown>;
      const name = typeof (rawSection.name ?? rawSection.n) === 'string'
        ? String(rawSection.name ?? rawSection.n)
        : '';
      if (!name) return [];
      const rawRows = Array.isArray(rawSection.rows ?? rawSection.r)
        ? ((rawSection.rows ?? rawSection.r) as unknown[])
        : [];
      return [{
        name,
        rows: rawRows.flatMap((rowEntry) => {
          if (!rowEntry || typeof rowEntry !== 'object') return [];
          const rawRow = rowEntry as Record<string, unknown>;
          const leftLineIdx = rawRow.leftLineIdx == null && rawRow.l == null ? null : Number(rawRow.leftLineIdx ?? rawRow.l);
          const rightLineIdx = rawRow.rightLineIdx == null && rawRow.r == null ? null : Number(rawRow.rightLineIdx ?? rawRow.r);
          const rawCellDeltas = Array.isArray(rawRow.cellDeltas ?? rawRow.c)
            ? ((rawRow.cellDeltas ?? rawRow.c) as unknown[])
            : [];
          const changedColumns = Array.isArray(rawRow.changedColumns)
            ? rawRow.changedColumns.map((value) => Number(value)).filter((value) => Number.isFinite(value))
            : rawCellDeltas
                .map((cellEntry) => {
                  if (!cellEntry || typeof cellEntry !== 'object') return null;
                  const rawCell = cellEntry as Record<string, unknown>;
                  const column = Number(rawCell.column ?? rawCell.c);
                  return Number.isFinite(column) ? column : null;
                })
                .filter((value): value is number => value != null);
          const lineIdxs = [leftLineIdx, rightLineIdx].filter((value): value is number => Number.isFinite(value));
          return [{
            lineIdx: lineIdxs[0] ?? 0,
            lineIdxs,
            leftLineIdx: Number.isFinite(leftLineIdx) ? leftLineIdx : null,
            rightLineIdx: Number.isFinite(rightLineIdx) ? rightLineIdx : null,
            changedColumns,
          }];
        }),
      }];
    }),
  };
}

function normalizeRustWorkbookDiffOutput(output: string): RustWorkbookDiffOutput {
  const parsed = JSON.parse(output) as unknown;
  if (Array.isArray(parsed)) {
    return {
      diffLines: normalizeRustDiffLines(parsed),
      workbookDelta: null,
    };
  }

  const record = parsed as Record<string, unknown>;
  return {
    diffLines: normalizeRustDiffLines(record.diffLines ?? record.diff_lines ?? record.d ?? []),
    workbookDelta: normalizeWorkbookDelta(record.workbookDelta ?? record.workbook_delta ?? record.w ?? null),
  };
}

function buildWorkbookZip(sheetName: string, rows: string[][]) {
  const sheetRows = rows.map((cells, rowIndex) => {
    const cellXml = cells.map((value, columnIndex) => {
      const columnLabel = String.fromCharCode(65 + columnIndex);
      const escapedValue = value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      const preserveWhitespace = value.trim() !== value;
      const textNode = preserveWhitespace
        ? `<t xml:space="preserve">${escapedValue}</t>`
        : `<t>${escapedValue}</t>`;
      return `<c r="${columnLabel}${rowIndex + 1}" t="inlineStr"><is>${textNode}</is></c>`;
    }).join('');
    return `<row r="${rowIndex + 1}">${cellXml}</row>`;
  }).join('');

  return zipSync({
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?>
      <workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
        <sheets>
          <sheet name="${sheetName}" sheetId="1" r:id="rId1" />
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

function buildFormulaWorkbookZip(sheetName: string, formula: string, resultValue: string) {
  return zipSync({
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?>
      <workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
        <sheets>
          <sheet name="${sheetName}" sheetId="1" r:id="rId1" />
        </sheets>
      </workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml" />
      </Relationships>`),
    'xl/worksheets/sheet1.xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?>
      <worksheet>
        <sheetData>
          <row r="1">
            <c r="A1" t="inlineStr"><is><t>ID</t></is></c>
            <c r="B1" t="inlineStr"><is><t>Total</t></is></c>
          </row>
          <row r="2">
            <c r="A2" t="inlineStr"><is><t>10001</t></is></c>
            <c r="B2"><f>${formula}</f><v>${resultValue}</v></c>
          </row>
        </sheetData>
      </worksheet>`),
  });
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildSharedStringWorkbookZip(sheetName: string, rows: string[][]) {
  const sharedStrings: string[] = [];
  const sharedStringIndex = new Map<string, number>();
  const getSharedStringIndex = (value: string) => {
    const existing = sharedStringIndex.get(value);
    if (existing != null) return existing;
    const next = sharedStrings.length;
    sharedStrings.push(value);
    sharedStringIndex.set(value, next);
    return next;
  };

  const sheetRows = rows.map((cells, rowIndex) => {
    const cellXml = cells.map((value, columnIndex) => {
      const columnLabel = String.fromCharCode(65 + columnIndex);
      return `<c r="${columnLabel}${rowIndex + 1}" t="s"><v>${getSharedStringIndex(value)}</v></c>`;
    }).join('');
    return `<row r="${rowIndex + 1}">${cellXml}</row>`;
  }).join('');

  const sharedStringsXml = sharedStrings.map((value) => {
    const escapedValue = escapeXml(value);
    const preserveWhitespace = value.trim() !== value;
    return preserveWhitespace
      ? `<si><t xml:space="preserve">${escapedValue}</t></si>`
      : `<si><t>${escapedValue}</t></si>`;
  }).join('');

  return zipSync({
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?>
      <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
        <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" />
        <Default Extension="xml" ContentType="application/xml" />
        <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml" />
        <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml" />
        <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml" />
      </Types>`),
    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml" />
      </Relationships>`),
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?>
      <workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
        <sheets>
          <sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1" />
        </sheets>
      </workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml" />
        <Relationship Id="rIdShared" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml" />
      </Relationships>`),
    'xl/sharedStrings.xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?>
      <sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${sharedStrings.length}" uniqueCount="${sharedStrings.length}">
        ${sharedStringsXml}
      </sst>`),
    'xl/worksheets/sheet1.xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?>
      <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
        <sheetData>${sheetRows}</sheetData>
      </worksheet>`),
  });
}

function buildSharedStringWorkbookZipWithOrder(
  sheetName: string,
  rows: string[][],
  sharedStringOrder: string[],
) {
  const sharedStringIndex = new Map<string, number>();
  sharedStringOrder.forEach((value, index) => {
    sharedStringIndex.set(value, index);
  });

  const sheetRows = rows.map((cells, rowIndex) => {
    const cellXml = cells.map((value, columnIndex) => {
      const sharedIndex = sharedStringIndex.get(value);
      assert.notEqual(sharedIndex, undefined, `missing shared string for value "${value}"`);
      const columnLabel = String.fromCharCode(65 + columnIndex);
      return `<c r="${columnLabel}${rowIndex + 1}" t="s"><v>${sharedIndex}</v></c>`;
    }).join('');
    return `<row r="${rowIndex + 1}">${cellXml}</row>`;
  }).join('');

  const sharedStringsXml = sharedStringOrder.map((value) => {
    const escapedValue = escapeXml(value);
    const preserveWhitespace = value.trim() !== value;
    return preserveWhitespace
      ? `<si><t xml:space="preserve">${escapedValue}</t></si>`
      : `<si><t>${escapedValue}</t></si>`;
  }).join('');

  return zipSync({
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?>
      <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
        <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" />
        <Default Extension="xml" ContentType="application/xml" />
        <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml" />
        <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml" />
        <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml" />
      </Types>`),
    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml" />
      </Relationships>`),
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?>
      <workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
        <sheets>
          <sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1" />
        </sheets>
      </workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml" />
        <Relationship Id="rIdShared" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml" />
      </Relationships>`),
    'xl/sharedStrings.xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?>
      <sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${sharedStringOrder.length}" uniqueCount="${sharedStringOrder.length}">
        ${sharedStringsXml}
      </sst>`),
    'xl/worksheets/sheet1.xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?>
      <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
        <sheetData>${sheetRows}</sheetData>
      </worksheet>`),
  });
}

test('rust workbook diff smoke', async (t) => {
  const parserPath = join(process.cwd(), 'rust', 'target', 'release', process.platform === 'win32' ? 'svn_excel_parser.exe' : 'svn_excel_parser');
  if (!existsSync(parserPath)) {
    t.skip('rust parser binary not built');
    return;
  }

  const os = await import('node:os');
  const fs = await import('node:fs/promises');
  const tempDir = await fs.mkdtemp(join(os.tmpdir(), 'rust-workbook-diff-'));
  const basePath = join(tempDir, 'base.xlsx');
  const minePath = join(tempDir, 'mine.xlsx');
  await fs.writeFile(basePath, Buffer.from(buildWorkbookZip('Thing', [['ID', 'Name'], ['10001', 'A']])));
  await fs.writeFile(minePath, Buffer.from(buildWorkbookZip('Thing', [['ID', 'Name'], ['10001', 'B']]))); 

  const output = execFileSync(parserPath, ['--diff-json', basePath, minePath], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  const diffOutput = normalizeRustWorkbookDiffOutput(output);
  const diffLines = diffOutput.diffLines;

  assert.equal(diffLines[0]?.type, 'equal');
  assert.equal(diffLines.some(line => line.type === 'delete'), true);
  assert.equal(diffLines.some(line => line.type === 'add'), true);
  assert.equal(diffOutput.workbookDelta?.compareMode, 'strict');
});

test('rust workbook diff detects shared-string-only changes during equal-sheet inspection', async (t) => {
  const parserPath = join(process.cwd(), 'rust', 'target', 'release', process.platform === 'win32' ? 'svn_excel_parser.exe' : 'svn_excel_parser');
  if (!existsSync(parserPath)) {
    t.skip('rust parser binary not built');
    return;
  }

  const os = await import('node:os');
  const fs = await import('node:fs/promises');
  const tempDir = await fs.mkdtemp(join(os.tmpdir(), 'rust-workbook-diff-shared-'));
  const basePath = join(tempDir, 'base.xlsx');
  const minePath = join(tempDir, 'mine.xlsx');
  await fs.writeFile(basePath, Buffer.from(buildSharedStringWorkbookZip('Thing', [['ID', 'Name'], ['10001', 'A']]))); 
  await fs.writeFile(minePath, Buffer.from(buildSharedStringWorkbookZip('Thing', [['ID', 'Name'], ['10001', 'B']]))); 

  const output = execFileSync(parserPath, ['--diff-json', basePath, minePath], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  const diffOutput = normalizeRustWorkbookDiffOutput(output);
  const diffLines = diffOutput.diffLines;

  assert.equal(diffLines.some(line => line.type === 'delete'), true);
  assert.equal(diffLines.some(line => line.type === 'add'), true);
  assert.deepEqual(diffOutput.workbookDelta?.sections[0]?.rows[1]?.changedColumns, [1]);
});

test('rust workbook diff keeps formula changes visible with native zip full parse', async (t) => {
  const parserPath = join(process.cwd(), 'rust', 'target', 'release', process.platform === 'win32' ? 'svn_excel_parser.exe' : 'svn_excel_parser');
  if (!existsSync(parserPath)) {
    t.skip('rust parser binary not built');
    return;
  }

  const os = await import('node:os');
  const fs = await import('node:fs/promises');
  const tempDir = await fs.mkdtemp(join(os.tmpdir(), 'rust-workbook-diff-formula-'));
  const basePath = join(tempDir, 'base.xlsx');
  const minePath = join(tempDir, 'mine.xlsx');
  await fs.writeFile(basePath, Buffer.from(buildFormulaWorkbookZip('Thing', '1+1', '2')));
  await fs.writeFile(minePath, Buffer.from(buildFormulaWorkbookZip('Thing', '1+2', '3')));

  const output = execFileSync(parserPath, ['--diff-json', basePath, minePath], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  const diffOutput = normalizeRustWorkbookDiffOutput(output);
  const diffLines = diffOutput.diffLines;
  const rows = buildWorkbookSectionRowIndex(diffLines, getWorkbookSections(diffLines)).get('Thing')?.rows ?? [];
  const changedRow = rows.find((row) => {
    const left = parseWorkbookRowLine(row.left);
    const right = parseWorkbookRowLine(row.right);
    return left?.rowNumber === 2 && right?.rowNumber === 2;
  });

  assert.ok(changedRow);
  const compareCells = buildWorkbookCompareCells(changedRow.left, changedRow.right);
  assert.equal(compareCells.get(1)?.changed, true);
  assert.equal(compareCells.get(1)?.baseCell.formula, '=1+1');
  assert.equal(compareCells.get(1)?.mineCell.formula, '=1+2');
  assert.deepEqual(diffOutput.workbookDelta?.sections[0]?.rows[1]?.changedColumns, [1]);
});

test('rust workbook diff keeps semantic equality when shared-string tables differ', async (t) => {
  const parserPath = join(process.cwd(), 'rust', 'target', 'release', process.platform === 'win32' ? 'svn_excel_parser.exe' : 'svn_excel_parser');
  if (!existsSync(parserPath)) {
    t.skip('rust parser binary not built');
    return;
  }

  const os = await import('node:os');
  const fs = await import('node:fs/promises');
  const tempDir = await fs.mkdtemp(join(os.tmpdir(), 'rust-workbook-diff-shared-order-'));
  const basePath = join(tempDir, 'base.xlsx');
  const minePath = join(tempDir, 'mine.xlsx');
  const rows = [['ID', 'Name'], ['10001', 'A']];
  await fs.writeFile(basePath, Buffer.from(buildSharedStringWorkbookZipWithOrder('Thing', rows, ['ID', 'Name', '10001', 'A'])));
  await fs.writeFile(minePath, Buffer.from(buildSharedStringWorkbookZipWithOrder('Thing', rows, ['10001', 'A', 'ID', 'Name'])));

  const output = execFileSync(parserPath, ['--diff-json', basePath, minePath], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  const diffOutput = normalizeRustWorkbookDiffOutput(output);

  assert.equal(diffOutput.diffLines.every((line) => line.type === 'equal'), true);
  assert.equal(diffOutput.workbookDelta?.compareMode, 'strict');
});

test('rust workbook diff handles large aligned workbooks without stack overflow', async (t) => {
  const parserPath = join(process.cwd(), 'rust', 'target', 'release', process.platform === 'win32' ? 'svn_excel_parser.exe' : 'svn_excel_parser');
  if (!existsSync(parserPath)) {
    t.skip('rust parser binary not built');
    return;
  }

  const os = await import('node:os');
  const fs = await import('node:fs/promises');
  const tempDir = await fs.mkdtemp(join(os.tmpdir(), 'rust-workbook-diff-large-'));
  const basePath = join(tempDir, 'base.xlsx');
  const minePath = join(tempDir, 'mine.xlsx');
  const rows = [
    ['ID', 'Name'],
    ...Array.from({ length: 6000 }, (_, index) => [`${10000 + index}`, `Item-${index}`]),
  ];
  await fs.writeFile(basePath, Buffer.from(buildWorkbookZip('Thing', rows)));
  await fs.writeFile(minePath, Buffer.from(buildWorkbookZip('Thing', rows)));

  const output = execFileSync(parserPath, ['--diff-json', basePath, minePath], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const diffOutput = normalizeRustWorkbookDiffOutput(output);
  const diffLines = diffOutput.diffLines;

  assert.equal(diffLines.length >= rows.length, true);
  assert.equal(diffLines.every(line => line.type === 'equal'), true);
});

test('rust workbook diff supports same-file fast path', async (t) => {
  const parserPath = join(process.cwd(), 'rust', 'target', 'release', process.platform === 'win32' ? 'svn_excel_parser.exe' : 'svn_excel_parser');
  if (!existsSync(parserPath)) {
    t.skip('rust parser binary not built');
    return;
  }

  const os = await import('node:os');
  const fs = await import('node:fs/promises');
  const tempDir = await fs.mkdtemp(join(os.tmpdir(), 'rust-workbook-diff-same-file-'));
  const workbookPath = join(tempDir, 'same.xlsx');
  await fs.writeFile(workbookPath, Buffer.from(buildWorkbookZip('Thing', [['ID', 'Name'], ['10001', 'A']])));

  const output = execFileSync(parserPath, ['--diff-json', workbookPath, workbookPath], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  const diffOutput = normalizeRustWorkbookDiffOutput(output);

  assert.equal(diffOutput.diffLines.every((line) => line.type === 'equal'), true);
  assert.equal(diffOutput.workbookDelta?.compareMode, 'strict');
});

test('rust workbook diff supports equal workbooks at different paths', async (t) => {
  const parserPath = join(process.cwd(), 'rust', 'target', 'release', process.platform === 'win32' ? 'svn_excel_parser.exe' : 'svn_excel_parser');
  if (!existsSync(parserPath)) {
    t.skip('rust parser binary not built');
    return;
  }

  const os = await import('node:os');
  const fs = await import('node:fs/promises');
  const tempDir = await fs.mkdtemp(join(os.tmpdir(), 'rust-workbook-diff-equal-files-'));
  const basePath = join(tempDir, 'base.xlsx');
  const minePath = join(tempDir, 'mine.xlsx');
  const workbook = Buffer.from(buildWorkbookZip('Thing', [['ID', 'Name'], ['10001', 'A']]));
  await fs.writeFile(basePath, workbook);
  await fs.writeFile(minePath, workbook);

  const output = execFileSync(parserPath, ['--diff-json', basePath, minePath], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  const diffOutput = normalizeRustWorkbookDiffOutput(output);

  assert.equal(diffOutput.diffLines.every((line) => line.type === 'equal'), true);
  assert.equal(diffOutput.workbookDelta?.compareMode, 'strict');
});

test('rust workbook diff preserves whitespace-only changed cells for workbook compare', async (t) => {
  const parserPath = join(process.cwd(), 'rust', 'target', 'release', process.platform === 'win32' ? 'svn_excel_parser.exe' : 'svn_excel_parser');
  if (!existsSync(parserPath)) {
    t.skip('rust parser binary not built');
    return;
  }

  const os = await import('node:os');
  const fs = await import('node:fs/promises');
  const tempDir = await fs.mkdtemp(join(os.tmpdir(), 'rust-workbook-diff-whitespace-'));
  const basePath = join(tempDir, 'base.xlsx');
  const minePath = join(tempDir, 'mine.xlsx');
  await fs.writeFile(basePath, Buffer.from(buildWorkbookZip('Thing', [['ID', 'Flag'], ['10001', ' ']])));
  await fs.writeFile(minePath, Buffer.from(buildWorkbookZip('Thing', [['ID', 'Flag'], ['10001', '']])));

  const output = execFileSync(parserPath, ['--diff-json', basePath, minePath], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  const diffOutput = normalizeRustWorkbookDiffOutput(output);
  const diffLines = diffOutput.diffLines;
  const rows = buildWorkbookSectionRowIndex(diffLines, getWorkbookSections(diffLines)).get('Thing')?.rows ?? [];
  const changedRow = rows.find((row) => {
    const left = parseWorkbookRowLine(row.left);
    const right = parseWorkbookRowLine(row.right);
    return left?.rowNumber === 2 && right?.rowNumber === 2;
  });

  assert.ok(changedRow);
  const compareCells = buildWorkbookCompareCells(changedRow.left, changedRow.right);
  assert.equal(compareCells.get(1)?.changed, true);
  assert.equal(compareCells.get(1)?.baseCell.value, ' ');
  assert.equal(compareCells.get(1)?.mineCell.value, '');
  assert.deepEqual(diffOutput.workbookDelta?.sections[0]?.rows[1]?.changedColumns, [1]);
});

test('rust workbook diff can emit content-mode equality for whitespace-only changes', async (t) => {
  const parserPath = join(process.cwd(), 'rust', 'target', 'release', process.platform === 'win32' ? 'svn_excel_parser.exe' : 'svn_excel_parser');
  if (!existsSync(parserPath)) {
    t.skip('rust parser binary not built');
    return;
  }

  const os = await import('node:os');
  const fs = await import('node:fs/promises');
  const tempDir = await fs.mkdtemp(join(os.tmpdir(), 'rust-workbook-diff-content-'));
  const basePath = join(tempDir, 'base.xlsx');
  const minePath = join(tempDir, 'mine.xlsx');
  await fs.writeFile(basePath, Buffer.from(buildWorkbookZip('Thing', [['ID', 'Flag'], ['10001', ' ']])));
  await fs.writeFile(minePath, Buffer.from(buildWorkbookZip('Thing', [['ID', 'Flag'], ['10001', '']])));

  const output = execFileSync(parserPath, ['--diff-json', basePath, minePath, '--compare-mode', 'content'], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  const diffOutput = normalizeRustWorkbookDiffOutput(output);

  assert.equal(diffOutput.workbookDelta, null);
  assert.equal(diffOutput.diffLines.every((line) => line.type === 'equal'), true);
});
