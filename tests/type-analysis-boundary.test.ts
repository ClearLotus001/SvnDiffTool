import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('analysis payload types do not create an svn/workbook cycle', () => {
  const workbookTypes = fs.readFileSync('src/types/workbook.ts', 'utf8');
  const svnTypes = fs.readFileSync('src/types/svn.ts', 'utf8');
  const analysisTypes = fs.readFileSync('src/types/analysis.ts', 'utf8');
  const barrel = fs.readFileSync('src/types/index.ts', 'utf8');

  assert.doesNotMatch(workbookTypes, /types\/svn/);
  assert.match(svnTypes, /types\/analysis/);
  assert.match(analysisTypes, /interface DiffAnalysisSnapshot/);
  assert.match(analysisTypes, /interface WorkbookCompareModePayload/);
  assert.match(analysisTypes, /interface WorkbookMetadataPayload/);
  assert.match(barrel, /types\/analysis/);
});
