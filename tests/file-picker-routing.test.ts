import test from 'node:test';
import assert from 'node:assert/strict';

import { shouldOpenTwoFilePicker } from '../src/utils/app/filePickerRouting';

test('single working-copy sessions keep the toolbar switch action on the single-file picker', () => {
  assert.equal(shouldOpenTwoFilePicker({
    compareContext: 'literal_two_file_compare',
    basePath: '',
    minePath: '',
  }), false);
  assert.equal(shouldOpenTwoFilePicker({
    compareContext: 'literal_two_file_compare',
    basePath: 'E:\\WorkingCopy\\sample.xlsx',
    minePath: 'e:/workingcopy/sample.xlsx',
  }), false);
});

test('only literal comparisons with two distinct paths open the two-file picker', () => {
  assert.equal(shouldOpenTwoFilePicker({
    compareContext: 'literal_two_file_compare',
    basePath: 'E:\\Publish\\sample.xlsx',
    minePath: 'E:\\Trunk\\sample.xlsx',
  }), true);
  assert.equal(shouldOpenTwoFilePicker({
    compareContext: 'standard_local_compare',
    basePath: 'E:\\Publish\\sample.xlsx',
    minePath: 'E:\\Trunk\\sample.xlsx',
  }), false);
});
