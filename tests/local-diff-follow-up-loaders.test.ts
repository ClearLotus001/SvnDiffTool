import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { strToU8, zipSync } from 'fflate';

import { EMPTY_CLI_ARGS } from '../electron/cliArgs';
import {
  buildLocalDiffData,
  loadWorkbookCompareModeData,
  loadWorkbookMetadataData,
} from '../electron/main/diffBuilder';
import {
  filePayloadCache,
  revisionPayloadCache,
  setActiveCliArgs,
  workbookCompareCache,
  workbookMetadataCache,
} from '../electron/main/state';

function buildWorkbookZip(sheetName: string, rows: string[][]) {
  const sheetRows = rows.map((cells, rowIndex) => {
    const cellXml = cells.map((value, columnIndex) => {
      const columnLabel = String.fromCharCode(65 + columnIndex);
      return `<c r="${columnLabel}${rowIndex + 1}" t="inlineStr"><is><t>${value}</t></is></c>`;
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

test('local diff keeps compare-mode and metadata loaders usable after initial load', async () => {
  if (!process.resourcesPath) {
    Object.defineProperty(process, 'resourcesPath', {
      value: '',
      configurable: true,
    });
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'svn-diff-local-follow-up-'));
  const basePath = path.join(tempDir, 'base.xlsx');
  const minePath = path.join(tempDir, 'mine.xlsx');

  try {
    await fs.writeFile(basePath, Buffer.from(buildWorkbookZip('Thing', [['ID', 'Name'], ['10001', 'Alpha']])));
    await fs.writeFile(minePath, Buffer.from(buildWorkbookZip('Thing', [['ID', 'Name'], ['10001', 'Bravo']])));

    const initial = await buildLocalDiffData(basePath, minePath, 'strict');
    const contentPayload = await loadWorkbookCompareModeData('content');
    const metadataPayload = await loadWorkbookMetadataData();

    assert.ok((initial.precomputedDiffLinesByMode?.strict?.length ?? 0) > 0);
    assert.ok((contentPayload.diffLines?.length ?? 0) > 0);
    assert.equal(Object.keys(metadataPayload.base?.sheets ?? {}).length, 1);
    assert.equal(Object.keys(metadataPayload.mine?.sheets ?? {}).length, 1);
  } finally {
    filePayloadCache.clear();
    revisionPayloadCache.clear();
    workbookCompareCache.clear();
    workbookMetadataCache.clear();
    setActiveCliArgs(EMPTY_CLI_ARGS);
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
