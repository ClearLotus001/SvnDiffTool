import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { strToU8, zipSync } from 'fflate';

import {
  buildAnalysisSnapshotCacheKey,
  clearAnalysisSnapshotCache,
  peekAnalysisSnapshot,
  resolveAnalysisSnapshot,
} from '../electron/main/analysisSnapshotService';
import type { FilePayload } from '../electron/main/types';

function createTextPayload(content: string): FilePayload {
  return {
    content,
    bytes: null,
    metadata: null,
    perf: {
      readMs: 0,
      parserMs: 0,
      metadataMs: 0,
      byteLength: Buffer.byteLength(content, 'utf-8'),
    },
  };
}

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

test('buildAnalysisSnapshotCacheKey differentiates compare modes and revision pairs', () => {
  const strictKey = buildAnalysisSnapshotCacheKey({
    sourceIdentity: 'cli::same-source',
    baseRevisionId: 'r10',
    mineRevisionId: 'r11',
    compareMode: 'strict',
  });
  const contentKey = buildAnalysisSnapshotCacheKey({
    sourceIdentity: 'cli::same-source',
    baseRevisionId: 'r10',
    mineRevisionId: 'r11',
    compareMode: 'content',
  });
  const otherRevisionKey = buildAnalysisSnapshotCacheKey({
    sourceIdentity: 'cli::same-source',
    baseRevisionId: 'r10',
    mineRevisionId: 'r12',
    compareMode: 'strict',
  });

  assert.notEqual(strictKey, contentKey);
  assert.notEqual(strictKey, otherRevisionKey);
});

test('resolveAnalysisSnapshot reuses cached text analysis for identical keys', async () => {
  clearAnalysisSnapshotCache();
  const basePayload = createTextPayload(['header', 'alpha', 'tail'].join('\n'));
  const minePayload = createTextPayload(['header', 'alpha updated', 'tail'].join('\n'));

  const first = await resolveAnalysisSnapshot({
    sourceIdentity: 'cli::text-source',
    compareMode: 'strict',
    fileName: 'example.ts',
    isWorkbook: false,
    basePayload,
    minePayload,
    baseLocalPath: '',
    mineLocalPath: '',
  });
  const second = await resolveAnalysisSnapshot({
    sourceIdentity: 'cli::text-source',
    compareMode: 'strict',
    fileName: 'example.ts',
    isWorkbook: false,
    basePayload: createTextPayload(basePayload.content ?? ''),
    minePayload: createTextPayload(minePayload.content ?? ''),
    baseLocalPath: '',
    mineLocalPath: '',
  });

  assert.equal(first, second);
  assert.ok((first.textAnalysis?.diffLines.length ?? 0) > 0);
  assert.ok((first.textAnalysis?.splitRowDescriptors.length ?? 0) > 0);
  assert.ok((first.textAnalysis?.replacementPairs.length ?? 0) > 0);
});

test('peekAnalysisSnapshot returns cached analysis without recomputing payload-dependent work', async () => {
  clearAnalysisSnapshotCache();
  const basePayload = createTextPayload(['header', 'alpha', 'tail'].join('\n'));
  const minePayload = createTextPayload(['header', 'alpha updated', 'tail'].join('\n'));

  const resolved = await resolveAnalysisSnapshot({
    sourceIdentity: 'cli::peek-source',
    compareMode: 'strict',
    fileName: 'peek.ts',
    isWorkbook: false,
    basePayload,
    minePayload,
    baseLocalPath: '',
    mineLocalPath: '',
  });
  const cached = peekAnalysisSnapshot({
    sourceIdentity: 'cli::peek-source',
    compareMode: 'strict',
    baseRevisionId: undefined,
    mineRevisionId: undefined,
  });

  assert.equal(cached, resolved);
  assert.equal(cached?.textAnalysis?.diffLines.length, resolved.textAnalysis?.diffLines.length);
});

test('resolveAnalysisSnapshot can hydrate local workbook metadata when payload metadata is omitted', async () => {
  clearAnalysisSnapshotCache();
  if (!process.resourcesPath) {
    Object.defineProperty(process, 'resourcesPath', {
      value: '',
      configurable: true,
    });
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'svn-diff-analysis-snapshot-'));
  const basePath = path.join(tempDir, 'base.xlsx');
  const minePath = path.join(tempDir, 'mine.xlsx');

  try {
    await fs.writeFile(basePath, Buffer.from(buildWorkbookZip('Thing', [['ID', 'Name'], ['10001', 'Alpha']])));
    await fs.writeFile(minePath, Buffer.from(buildWorkbookZip('Thing', [['ID', 'Name'], ['10001', 'Bravo']])));

    const snapshot = await resolveAnalysisSnapshot({
      sourceIdentity: 'local-dev::snapshot-workbook',
      compareMode: 'strict',
      fileName: 'sample.xlsx',
      isWorkbook: true,
      basePayload: {
        content: null,
        bytes: null,
        metadata: null,
        perf: { readMs: 0, parserMs: 0, metadataMs: 0, byteLength: 0 },
      },
      minePayload: {
        content: null,
        bytes: null,
        metadata: null,
        perf: { readMs: 0, parserMs: 0, metadataMs: 0, byteLength: 0 },
      },
      baseLocalPath: basePath,
      mineLocalPath: minePath,
    });

    assert.ok((snapshot.workbookAnalysis?.diffLinesByMode.strict?.length ?? 0) > 0);
    assert.equal(Object.keys(snapshot.workbookAnalysis?.metadata.base?.sheets ?? {}).length, 1);
    assert.equal(Object.keys(snapshot.workbookAnalysis?.metadata.mine?.sheets ?? {}).length, 1);
    assert.ok((snapshot.workbookAnalysis?.sectionsByMode?.strict?.length ?? 0) > 0);
    assert.ok((snapshot.workbookAnalysis?.navigationRegionsByMode?.strict?.length ?? 0) > 0);
    assert.ok((snapshot.workbookAnalysis?.perf?.metadataMs ?? 0) > 0);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
