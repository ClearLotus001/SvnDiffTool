import test from 'node:test';
import assert from 'node:assert/strict';

import { detectSyntaxLanguage } from '../src/utils/diff/detectSyntaxLanguage';
import { shouldUseAsyncSyntaxHighlighting } from '../src/utils/diff/syntaxHighlighting';

test('detectSyntaxLanguage resolves common extensions and special filenames', () => {
  assert.equal(detectSyntaxLanguage('example.tsx'), 'tsx');
  assert.equal(detectSyntaxLanguage('Dockerfile'), 'dockerfile');
  assert.equal(detectSyntaxLanguage('Jenkinsfile'), 'groovy');
  assert.equal(detectSyntaxLanguage('config.yaml'), 'yaml');
  assert.equal(detectSyntaxLanguage('module.nix'), 'nix');
  assert.equal(detectSyntaxLanguage('script.nu'), 'nu');
});

test('detectSyntaxLanguage falls back to shebang detection', () => {
  const pythonScript = '#!/usr/bin/env python3\nprint("hello")\n';
  const shellScript = '#!/bin/bash\necho hello\n';

  assert.equal(detectSyntaxLanguage('script', pythonScript), 'python');
  assert.equal(detectSyntaxLanguage('script', shellScript), 'shellscript');
});

test('shouldUseAsyncSyntaxHighlighting rejects oversized payloads', () => {
  const shortText = 'const value = 1;\n';
  const hugeText = 'x'.repeat(350_000);

  assert.equal(shouldUseAsyncSyntaxHighlighting(shortText, shortText, 'typescript'), true);
  assert.equal(shouldUseAsyncSyntaxHighlighting(hugeText, '', 'typescript'), false);
  assert.equal(
    shouldUseAsyncSyntaxHighlighting('x'.repeat(2_100), shortText, 'typescript'),
    false,
  );
  assert.equal(shouldUseAsyncSyntaxHighlighting(shortText, shortText, null), false);
});
