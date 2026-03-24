import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

import { zipSync, strToU8 } from 'fflate';
import { getWorkbookSections } from '../src/utils/workbookSections';
import { buildWorkbookSectionRowIndex } from '../src/utils/workbookSheetIndex';
import { buildWorkbookCompareCells, parseWorkbookRowLine } from '../src/utils/workbookCompare';

interface RustWorkbookDiffOutput {
  diffLines: Array<{ type: string; base?: string | null; mine?: string | null; baseLineNo?: number | null; mineLineNo?: number | null }>;
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
  };
}

function normalizeRustWorkbookDiffOutput(output: string): RustWorkbookDiffOutput {
  const parsed = JSON.parse(output) as unknown;
  if (Array.isArray(parsed)) {
    return {
      diffLines: parsed as RustWorkbookDiffOutput['diffLines'],
      workbookDelta: {
        compareMode: 'strict',
        sections: [],
      },
    };
  }

  const record = parsed as Record<string, unknown>;
  return {
    diffLines: (record.diffLines ?? record.diff_lines ?? []) as RustWorkbookDiffOutput['diffLines'],
    workbookDelta: (record.workbookDelta ?? record.workbook_delta ?? {
      compareMode: 'strict',
      sections: [],
    }) as RustWorkbookDiffOutput['workbookDelta'],
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
  assert.equal(diffOutput.workbookDelta.compareMode, 'strict');
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
  assert.deepEqual(diffOutput.workbookDelta.sections[0]?.rows[1]?.changedColumns, [1]);
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

  assert.equal(diffOutput.workbookDelta.compareMode, 'content');
  assert.equal(diffOutput.diffLines.every((line) => line.type === 'equal'), true);
  assert.deepEqual(diffOutput.workbookDelta.sections[0]?.rows[1]?.changedColumns ?? [], []);
});
