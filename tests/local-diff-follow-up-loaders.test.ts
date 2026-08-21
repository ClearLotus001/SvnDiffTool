import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { strToU8, zipSync } from 'fflate';

import { EMPTY_CLI_ARGS } from '../electron/cliArgs';
import {
  clearAnalysisSnapshotCache,
  peekAnalysisSnapshot,
} from '../electron/main/analysisSnapshotService';
import {
  buildLocalDiffData,
  loadWorkbookCompareModeData,
  loadWorkbookMetadataData,
} from '../electron/main/diffBuilder';
import { buildSourceIdentity } from '../electron/main/svnHelpers';
import {
  filePayloadCache,
  revisionPayloadCache,
  setActiveCliArgs,
  workbookCompareCache,
  workbookMetadataCache,
} from '../electron/main/state';

function resetLoaderCaches() {
  filePayloadCache.clear();
  revisionPayloadCache.clear();
  workbookCompareCache.clear();
  workbookMetadataCache.clear();
  clearAnalysisSnapshotCache();
  setActiveCliArgs(EMPTY_CLI_ARGS);
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

test('local diff keeps compare-mode and metadata loaders usable after initial load', async () => {
  resetLoaderCaches();
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
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if ([...workbookCompareCache.keys()].some((key) => key.includes('compare:content'))) break;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    const compareCacheKeysAfterInitialLoad = [...workbookCompareCache.keys()];
    const strictPayload = await loadWorkbookCompareModeData('strict');
    const contentPayload = await loadWorkbookCompareModeData('content');
    const metadataPayload = await loadWorkbookMetadataData();
    const strictSnapshot = initial.analysisSnapshotsByMode?.strict ?? null;
    const contentSnapshot = contentPayload.analysisSnapshot ?? null;

    assert.ok((initial.analysisSnapshotsByMode?.strict?.workbookAnalysis?.diffLinesByMode.strict?.length ?? 0) > 0);
    assert.equal(compareCacheKeysAfterInitialLoad.some((key) => key.includes('compare:strict')), true);
    assert.equal(compareCacheKeysAfterInitialLoad.some((key) => key.includes('compare:content')), true);
    assert.equal(Object.keys(initial.analysisSnapshotsByMode?.strict?.workbookAnalysis?.metadata.base?.sheets ?? {}).length, 1);
    assert.equal(Object.keys(initial.analysisSnapshotsByMode?.strict?.workbookAnalysis?.metadata.mine?.sheets ?? {}).length, 1);
    assert.equal(strictPayload.analysisSnapshot, strictSnapshot);
    assert.ok((contentSnapshot?.workbookAnalysis?.diffLinesByMode.content?.length ?? 0) > 0);
    assert.equal(peekAnalysisSnapshot({
      sourceIdentity: initial.sourceIdentity,
      compareMode: 'content',
      baseRevisionId: undefined,
      mineRevisionId: undefined,
    }), contentSnapshot);
    assert.equal(metadataPayload.analysisSnapshot, strictSnapshot);
    assert.equal(Object.keys(metadataPayload.base?.sheets ?? {}).length, 1);
    assert.equal(Object.keys(metadataPayload.mine?.sheets ?? {}).length, 1);
    assert.equal(Object.keys(metadataPayload.analysisSnapshot?.workbookAnalysis?.metadata.base?.sheets ?? {}).length, 1);
    assert.equal(Object.keys(metadataPayload.analysisSnapshot?.workbookAnalysis?.metadata.mine?.sheets ?? {}).length, 1);
  } finally {
    resetLoaderCaches();
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('cold metadata follow-up uses metadata pair cache without materializing a strict snapshot', async () => {
  resetLoaderCaches();
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'svn-diff-local-metadata-'));
  const basePath = path.join(tempDir, 'base.xlsx');
  const minePath = path.join(tempDir, 'mine.xlsx');

  try {
    await fs.writeFile(
      basePath,
      Buffer.from(buildWorkbookZip('Thing', [['ID', 'Name'], ['10001', 'Alpha']])),
    );
    await fs.writeFile(
      minePath,
      Buffer.from(buildWorkbookZip('Thing', [['ID', 'Name'], ['10001', 'Bravo']])),
    );

    setActiveCliArgs({
      basePath,
      minePath,
      baseName: path.basename(basePath),
      mineName: path.basename(minePath),
      baseUrl: '',
      mineUrl: '',
      baseRevision: '',
      mineRevision: '',
      pegRevision: '',
      fileName: path.basename(minePath),
    });

    const firstMetadataPayload = await loadWorkbookMetadataData();
    const secondMetadataPayload = await loadWorkbookMetadataData();
    const sourceIdentity = buildSourceIdentity({
      kind: 'local-dev',
      fileName: path.basename(minePath),
      baseUrl: '',
      mineUrl: '',
      baseRevision: '',
      mineRevision: '',
      pegRevision: '',
      basePath,
      minePath,
      baseName: path.basename(basePath),
      mineName: path.basename(minePath),
    });

    assert.equal(firstMetadataPayload.analysisSnapshot, null);
    assert.equal(secondMetadataPayload.analysisSnapshot, null);
    assert.equal(firstMetadataPayload, secondMetadataPayload);
    assert.equal(peekAnalysisSnapshot({
      sourceIdentity,
      compareMode: 'strict',
      baseRevisionId: undefined,
      mineRevisionId: undefined,
    }), null);
    assert.equal(Object.keys(firstMetadataPayload.base?.sheets ?? {}).length, 1);
    assert.equal(Object.keys(firstMetadataPayload.mine?.sheets ?? {}).length, 1);
    assert.equal(workbookMetadataCache.size, 1);
  } finally {
    resetLoaderCaches();
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('concurrent cold metadata follow-up dedupes workbook metadata pair loading', async () => {
  resetLoaderCaches();
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'svn-diff-local-metadata-concurrent-'));
  const basePath = path.join(tempDir, 'base.xlsx');
  const minePath = path.join(tempDir, 'mine.xlsx');

  try {
    await fs.writeFile(
      basePath,
      Buffer.from(buildWorkbookZip('Thing', [['ID', 'Name'], ['10001', 'Alpha']])),
    );
    await fs.writeFile(
      minePath,
      Buffer.from(buildWorkbookZip('Thing', [['ID', 'Name'], ['10001', 'Bravo']])),
    );

    setActiveCliArgs({
      basePath,
      minePath,
      baseName: path.basename(basePath),
      mineName: path.basename(minePath),
      baseUrl: '',
      mineUrl: '',
      baseRevision: '',
      mineRevision: '',
      pegRevision: '',
      fileName: path.basename(minePath),
    });

    const sourceIdentity = buildSourceIdentity({
      kind: 'local-dev',
      fileName: path.basename(minePath),
      baseUrl: '',
      mineUrl: '',
      baseRevision: '',
      mineRevision: '',
      pegRevision: '',
      basePath,
      minePath,
      baseName: path.basename(basePath),
      mineName: path.basename(minePath),
    });
    const [firstMetadataPayload, secondMetadataPayload] = await Promise.all([
      loadWorkbookMetadataData(),
      loadWorkbookMetadataData(),
    ]);

    assert.equal(firstMetadataPayload, secondMetadataPayload);
    assert.equal(firstMetadataPayload.analysisSnapshot, null);
    assert.equal(workbookMetadataCache.size, 1);
    assert.equal(peekAnalysisSnapshot({
      sourceIdentity,
      compareMode: 'strict',
      baseRevisionId: undefined,
      mineRevisionId: undefined,
    }), null);
    assert.equal(Object.keys(firstMetadataPayload.base?.sheets ?? {}).length, 1);
    assert.equal(Object.keys(firstMetadataPayload.mine?.sheets ?? {}).length, 1);
  } finally {
    resetLoaderCaches();
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
