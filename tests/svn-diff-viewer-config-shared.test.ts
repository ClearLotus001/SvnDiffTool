import test from 'node:test';
import assert from 'node:assert/strict';

import {
  canRestoreSvnDefaultDiffViewer,
  getOwnedSvnDiffRegistryEntries,
  normalizeSvnDiffViewerCommand,
} from '../electron/svnDiffViewerConfigShared';

const OUR_COMMAND = String.raw`"C:\Program Files\SvnDiffTool\svn_diff_launcher.exe" %base %mine %bname %yname %burl %yurl %brev %yrev %peg %fname`;

test('normalizeSvnDiffViewerCommand ignores repeated whitespace and case', () => {
  assert.equal(
    normalizeSvnDiffViewerCommand(`  ${OUR_COMMAND.toUpperCase().replace(/\s+/g, '   ')}  `),
    normalizeSvnDiffViewerCommand(OUR_COMMAND),
  );
});

test('getOwnedSvnDiffRegistryEntries finds global and per-extension rules owned by SvnDiffTool', () => {
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

test('canRestoreSvnDefaultDiffViewer only enables restore when SvnDiffTool owns some current rule', () => {
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
