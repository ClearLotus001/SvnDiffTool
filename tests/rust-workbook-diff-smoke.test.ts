import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

import { zipSync, strToU8 } from 'fflate';

function buildWorkbookZip(sheetName: string, rows: string[][]) {
  const sheetRows = rows.map((cells, rowIndex) => {
    const cellXml = cells.map((value, columnIndex) => {
      const columnLabel = String.fromCharCode(65 + columnIndex);
      return `<c r="${columnLabel}${rowIndex + 1}" t="inlineStr"><is><t>${value}</t></is></c>`;
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
  const diffLines = JSON.parse(output) as Array<{ type: string; base?: string | null; mine?: string | null }>;

  assert.equal(diffLines[0]?.type, 'equal');
  assert.equal(diffLines.some(line => line.type === 'delete'), true);
  assert.equal(diffLines.some(line => line.type === 'add'), true);
});
