import test from 'node:test';
import assert from 'node:assert/strict';

import {
  canRestoreSvnDefaultDiffViewer,
  getOwnedSvnDiffRegistryEntries,
  normalizeSvnDiffViewerCommand,
  resolveSvnDiffViewerAvailabilityReason,
  resolveSvnDiffViewerMode,
} from '../electron/svnDiffViewerConfigShared';

const OUR_COMMAND = String.raw`"C:\Program Files\Versora\resources\bin\svn_diff_launcher.exe" %base %mine %bname %yname %burl %yurl %brev %yrev %peg %fname`;
const WORKBOOK_EXTENSIONS = ['.xls', '.xlsx', '.xlsm', '.xlsb', '.xltx', '.xltm'] as const;

test('resolveSvnDiffViewerAvailabilityReason requires the packaged Windows launcher', () => {
  assert.equal(resolveSvnDiffViewerAvailabilityReason('linux', true, true), 'windows-only');
  assert.equal(resolveSvnDiffViewerAvailabilityReason('win32', false, true), 'packaged-only');
  assert.equal(resolveSvnDiffViewerAvailabilityReason('win32', true, false), 'launcher-missing');
  assert.equal(resolveSvnDiffViewerAvailabilityReason('win32', true, true), 'ready');
});

test('normalizeSvnDiffViewerCommand ignores repeated whitespace and case', () => {
  assert.equal(
    normalizeSvnDiffViewerCommand(`  ${OUR_COMMAND.toUpperCase().replace(/\s+/g, '   ')}  `),
    normalizeSvnDiffViewerCommand(OUR_COMMAND),
  );
});

test('getOwnedSvnDiffRegistryEntries finds global and per-extension rules owned by Versora', () => {
  const owned = getOwnedSvnDiffRegistryEntries(OUR_COMMAND, {
    globalDiffCommand: OUR_COMMAND.toUpperCase(),
    diffToolCommands: {
      '.xlsx': OUR_COMMAND,
      '.xlsm': `  ${OUR_COMMAND}  `,
      '.txt': '"C:\\Windows\\System32\\notepad.exe" %mine',
    },
  });

  assert.equal(owned.ownsGlobalDiffCommand, true);
  assert.deepEqual(owned.ownedDiffToolKeys.sort(), ['.xlsx', '.xlsm'].sort());
});

test('canRestoreSvnDefaultDiffViewer only enables restore when Versora owns some current rule', () => {
  assert.equal(
    canRestoreSvnDefaultDiffViewer(OUR_COMMAND, {
      globalDiffCommand: null,
      diffToolCommands: {
        '.xlsx': OUR_COMMAND,
      },
    }),
    true,
  );

  assert.equal(
    canRestoreSvnDefaultDiffViewer(OUR_COMMAND, {
      globalDiffCommand: '"C:\\Tools\\OtherDiff.exe" %base %mine',
      diffToolCommands: {
        '.xlsx': '"C:\\Tools\\OtherDiff.exe" %base %mine',
      },
    }),
    false,
  );

  assert.equal(
    canRestoreSvnDefaultDiffViewer(null, {
      globalDiffCommand: OUR_COMMAND,
      diffToolCommands: {
        '.xlsx': OUR_COMMAND,
      },
    }),
    false,
  );
});

test('resolveSvnDiffViewerMode distinguishes all-file, text-only, and workbook-only setups', () => {
  assert.equal(
    resolveSvnDiffViewerMode(OUR_COMMAND, {
      globalDiffCommand: OUR_COMMAND,
      diffToolCommands: {
        '.xls': OUR_COMMAND,
        '.xlsx': OUR_COMMAND,
        '.xlsm': OUR_COMMAND,
        '.xlsb': OUR_COMMAND,
        '.xltx': OUR_COMMAND,
        '.xltm': OUR_COMMAND,
      },
    }, WORKBOOK_EXTENSIONS),
    'all-files',
  );

  assert.equal(
    resolveSvnDiffViewerMode(OUR_COMMAND, {
      globalDiffCommand: OUR_COMMAND,
      diffToolCommands: {
        '.xlsx': '"C:\\Tools\\OtherWorkbookDiff.exe" %base %mine',
      },
    }, WORKBOOK_EXTENSIONS),
    'text-only',
  );

  assert.equal(
    resolveSvnDiffViewerMode(OUR_COMMAND, {
      globalDiffCommand: null,
      diffToolCommands: {
        '.xls': OUR_COMMAND,
        '.xlsx': OUR_COMMAND,
        '.xlsm': OUR_COMMAND,
        '.xlsb': OUR_COMMAND,
        '.xltx': OUR_COMMAND,
        '.xltm': OUR_COMMAND,
      },
    }, WORKBOOK_EXTENSIONS),
    'workbook-only',
  );
});
