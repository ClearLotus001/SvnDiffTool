# Versora

[中文](./README.md) | [English](./README.en.md) | [Download the latest release](https://github.com/ClearLotus001/Versora/releases/latest)

> A Windows comparison workspace for reviewing text, Excel, Git versions, and SVN revisions in one interface.

Versora combines mature text and workbook viewers while treating Git, SVN, and plain local files as comparison sources that can be detected independently.

## Download and run

- Platform: Windows
- Installer: [GitHub Releases](https://github.com/ClearLotus001/Versora/releases)
- The installed app supports in-app updates and optional TortoiseSVN integration

The home screen provides three entry points:

1. **Open a working-copy file**: detect Git, SVN, or a plain local file automatically.
2. **Compare two files**: select two text files or Excel workbooks with the same extension.
3. **Connect to TortoiseSVN**: configure Versora as an external Diff Viewer.

## Highlights

### Text comparison

- Unified, side-by-side, and stacked layouts
- Line and character highlighting, syntax coloring, and whitespace display
- Unchanged-region folding, full-text search, diff navigation, go-to, and copy
- Git/SVN source badges with independent detection for each side
- Line attribution with version, author, and commit time; uncommitted lines use `WC*`
- Attribution appears only when a Git/SVN working-copy or revision context exists

### Excel workbooks

- A dedicated grid for OOXML workbooks such as `.xlsx`, `.xlsm`, `.xltx`, and `.xltm`
- Sheet, row, column, cell, and formula changes
- Strict and content comparison modes
- Formula bar, frozen panes, hidden rows and columns, diff-region navigation, and minimap
- Rust-accelerated parsing and diff computation
- Large comparisons use virtualization, structural-region compression, and compact IPC payloads instead of materializing every cell state in the renderer

### Git and SVN

| Source | Default behavior | History | Line attribution |
|---|---|---|---|
| Git working-tree file | Compare a repository version with current working-tree content | File-scoped commits, `HEAD`, and working tree | Git blame |
| SVN working copy | Compare a repository revision with the working copy | Revision history and working-copy switching | SVN blame |
| Plain local file | Use current file content directly | No version picker | Hidden |

In a two-file comparison, each side is detected independently. A Git/SVN side can switch history while a plain side remains local.

All Git operations are read-only. Versora never runs checkout, add, commit, or reset, and it does not mutate repository state.

## Usage

### Open one working-copy file

Choose “Open working-copy file” on the home screen. Versora detects the source and prepares a default comparison:

- Git: repository version versus working-tree file
- SVN: repository revision versus working copy
- Unversioned file: open locally without version switching

Use the header revision pickers to switch history. The toolbar Home button clears the active comparison and returns to the start screen.

### Compare two files

Choose “Compare two files,” then drop or select the left and right files. Both files must have the same extension. After “Compare files” is selected, the dialog closes and the shared “Preparing diff view” screen is shown.

### TortoiseSVN integration

The installed app can configure all-file, text-only, or workbook-only integration from the home screen. In-app setup is recommended. For manual setup, point the command to the bundled SVN launcher:

```text
"C:\Path\To\Versora\resources\bin\svn_diff_launcher.exe" %base %mine %bname %yname %burl %yurl %brev %yrev %peg %fname
```

Versora restores TortoiseSVN's default viewer before uninstalling so no external-viewer rule points to a removed executable.

## Compatibility and migration

- Exposes a single Electron renderer bridge at `window.versora`
- Stores settings under `versora.*`
- Uses `Versora/Cache` for managed Windows cache data
- Keeps the Windows `appId` stable to preserve installer upgrades and automatic updates

## Development

Requirements: Windows, Node.js 24+, and npm. Rust stable is required for the complete workbook verification suite.

```bash
npm install
npm run dev:app
```

| Command | Purpose |
|---|---|
| `npm run dev:app` | Start Vite, Electron, and main-process watch compilation |
| `npm run verify:static` | Run ESLint, unused-export checks, and TypeScript checks |
| `npm run test:workbook:unit` | Run unit tests that do not require Rust artifacts |
| `npm run test:workbook:rust` | Run workbook tests backed by the Rust parser |
| `npm run test:e2e` | Run Playwright user-flow tests |
| `npm run verify:ci` | Reproduce the complete CI verification locally |
| `npm run build:app` | Build the renderer and Electron main process |
| `npm run build:win` | Build the Windows installer |

## Architecture

```text
Local files ─┐
Git objects ─┼─> source materialization ─> DiffData ─> text/workbook analysis ─> viewer
SVN revisions┤
External CLI ┘
```

- [Comparison-source architecture](./docs/comparison-sources.md)
- [Workbook visual semantics](./docs/workbook-visual-semantics.md)

Repository layout:

```text
Versora/
├── electron/       # Electron main process, Git/SVN sources, installer, updates
├── shared/         # Contracts shared by main and renderer processes
├── src/            # React UI, text viewer, and workbook viewer
├── rust/           # Workbook parsing and comparison
├── tests/          # Unit, contract, and end-to-end tests
├── scripts/        # Build, verification, and release scripts
└── docs/           # Architecture and visual-semantics documentation
```

## Releases

The `package.json` version and Git tag must match. Pushing a `v*` tag starts the [Release workflow](./.github/workflows/release.yml), which runs static checks, Node tests, Rust tests, and app builds before publishing the Windows installer and update assets.

```bash
npm version patch --no-git-tag-version
git add -A
git commit -m "release: vX.Y.Z"
git tag vX.Y.Z
git push origin main
git push origin vX.Y.Z
```

## Scope

The current release focuses on reviewing changes. Directory comparison, three-way comparison, editable merge, automatic conflict resolution, and repository write operations are not included.

## License

This project is licensed under the [MIT License](./LICENSE).
