# SvnDiffTool

[中文](./README.md) | [English](./README.en.md)

> A Windows external diff viewer for TortoiseSVN, built with Electron + React + Rust for a clearer text and workbook comparison experience.

`SvnDiffTool` is designed to replace the default TortoiseSVN diff window. It keeps the familiar external-tool integration model while providing a more modern UI, stronger navigation and search workflows, and a dedicated comparison experience for workbook files.

If your goal is "make SVN diffs easier to read", this project is built for that. If your goal is "full Office-semantic comparison and merge", this is not that kind of heavyweight tool yet.

## Where It Fits

| Scenario | Fit | Notes |
|----------|-----|-------|
| Everyday TortoiseSVN file comparison | Excellent | Can be plugged in directly as the external diff tool |
| Reviewing text-based files | Excellent | Line diff, character highlighting, search, navigation, and collapsing are all covered |
| Exploring workbook differences | Good | Supports worksheet-, row-, column-, and cell-level visual comparison |
| Reading very large text files | Good | Includes virtualization, collapse controls, and performance guards |
| Full Office-semantic compare or merge | Limited | Not intended to handle comments, styles, charts, or macro merging as a primary use case |

## Core Capabilities

### Text Comparison

- Supports `Unified`, side-by-side horizontal, and side-by-side vertical layouts
- Provides line-level diffing with character-level highlights
- Collapses unchanged regions to reduce noise in long files
- Supports plain search, regex search, and case-sensitive matching
- Includes line jump, hunk jump, and keyboard-driven navigation
- Supports whitespace visualization, font zoom, and full-text copy

### SVN Integration

- Compatible with TortoiseSVN external diff arguments
- Supports revision switching and reload for the same SVN file
- In development mode, lets you load a working-copy file directly for local testing

### Workbook Comparison

- Uses a dedicated workbook comparison panel instead of flattening everything into plain text
- Supports worksheet switching, diff-region targeting, and cell-level change highlighting
- Supports both `strict` and `content` comparison modes
- Includes a formula bar, freeze panes, row/column hide and reveal, and mirrored selection behavior
- Uses a Rust workbook parsing pipeline to improve resilience on larger and more complex files

### Desktop Experience

- Built-in Chinese and English UI
- Ships with light, dark, and high-contrast themes
- Windows installer builds support auto-updates through GitHub Releases

## Tech Stack

- Frontend: React 18 + TypeScript
- Desktop shell: Electron 28
- Build system: Vite
- Workbook parsing and diff computation: Rust + `calamine` + `quick-xml`
- Testing: Node.js test runner + `tsx`

## Maintenance Notes

- If you are touching workbook comparison colors, highlights, selection states, overlays, or helper bars, read [`docs/workbook-visual-semantics.md`](./docs/workbook-visual-semantics.md) first

## Requirements

### To run the packaged app

- Windows
- TortoiseSVN, only if you want to wire it in as your external diff tool
- The first installation now requires internet access to fetch the main app package

### To develop or build from source

- Windows
- Node.js 18+
- npm
- Rust stable with `cargo`

> Note: workbook regression tests depend on the Rust parser artifact. Run `npm run build:rust` before the first test run, or run `npm run verify:ci`.

## Quick Start

```bash
npm install
npm run typecheck
npm run dev:app
```

If you launch the app directly instead of letting TortoiseSVN pass file arguments, it will enter development mode. From there you can:

- Load an SVN working-copy file for local comparison debugging
- Use the built-in sample data to inspect UI behavior

## Common Commands

| Command | Description |
|---------|-------------|
| `npm run dev:app` | Starts Vite, Electron, and Electron TypeScript watch mode |
| `npm run typecheck` | Runs type checks for renderer, electron, and scripts |
| `npm run test:workbook` | Checks the Rust parser artifact and runs the repository test suite, including workbook-focused regressions |
| `npm run test:workbook:unit` | Runs repository tests that do not directly require the Rust parser artifact, useful for quick checks without a Rust toolchain |
| `npm run test:workbook:rust` | Checks the Rust parser artifact and runs only the Rust parser integration tests |
| `npm run test:workbook:js` | Compatibility alias for `test:workbook:unit` |
| `npm run verify:electron` | Checks Electron binary artifacts and reruns Electron's install script when they are missing |
| `npm run verify:ci` | Reproduces the main CI gate locally: static checks, Rust build and lint, unit tests, Rust integration tests, Electron artifact checks, and app build |
| `npm run verify:single-instance-cache` | Verifies single-instance and cache-related behavior |
| `npm run build` | Builds renderer, Electron, and Rust artifacts |
| `npm run build:win` | Produces the native Windows installer plus auto-update assets |
| `npm run report:package-sizes` | Prints the current Windows package size report |

The default local installer output path is:

```text
release/SvnDiffTool-<version>.exe
```

The `release/` directory also keeps the auto-update assets, for example:

```text
release/SvnDiffTool-<version>.exe
release/latest.yml
release/<package-name>-<version>-x64.nsis.7z
```

## TortoiseSVN Integration

1. Open `TortoiseSVN -> Settings -> Diff Viewer`
2. Enable `External`
3. Set the external diff command to:

```text
"C:\Path\To\SvnDiffTool.exe" %base %mine %bname %yname %burl %yurl %brev %yrev %peg %fname
```

Argument reference:

| Argument | Meaning |
|----------|---------|
| `%base` | Temporary file path for the old revision |
| `%mine` | Temporary file path for the new revision |
| `%bname` | Display name for the old revision |
| `%yname` | Display name for the new revision |
| `%burl` | SVN URL for the left side |
| `%yurl` | SVN URL for the right side |
| `%brev` | Revision for the left side |
| `%yrev` | Revision for the right side |
| `%peg` | Peg revision |
| `%fname` | Current file name |

Recommended setup notes:

- Keep the executable path quoted if it contains spaces
- Do not reorder the arguments; the main process parses them in a fixed order
- You can configure file-extension-specific mappings in `Advanced...`, for example `.ts`, `.tsx`, `.js`, `.json`, and `.xml`

The installed app also includes a built-in setup panel:

- Open it from the home screen via `Connect to TortoiseSVN`
- Switch between `All-file mode`, `Text-only mode`, and `Workbook-only mode`
- Use `Restore default diff` to hand control back to TortoiseSVN's default diff behavior

During uninstall, the app automatically restores TortoiseSVN's default diff settings before removing SvnDiffTool, so SVN diff commands are not left pointing at a missing executable.

## Supported File Types and Boundaries

### Text files

The current version is best suited for:

- `.js`
- `.ts`
- `.tsx`
- `.json`
- `.xml`
- `.py`
- `.java`
- `.txt`
- and other text-oriented files that benefit from readable diff output

### Workbook files

Workbook comparison is one of the main feature areas of this project.

- OpenXML formats such as `.xlsx`, `.xlsm`, `.xltx`, and `.xltm` are explicitly supported
- Formats like `.xls` and `.xlsb` can go through the Rust workbook parsing pipeline, with actual results depending on file content and parser compatibility
- The tool is oriented toward structured difference inspection rather than full Office-semantic merge behavior

What it does well:

- Shows which sheets, rows, columns, and cells changed
- Helps with review, regression checking, and version backtracking

What it is not currently trying to be:

- A full Office-semantic merge tool for comments, charts, styles, macros, or pivot-table behavior
- An Excel editor that modifies and writes workbook files back out

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `F7` | Next diff hunk |
| `Shift+F7` | Previous diff hunk |
| `Ctrl+F` | Toggle the search bar |
| `Enter` / `F3` | Next search result |
| `Shift+Enter` | Previous search result |
| `Ctrl+G` | Go to line |
| `Ctrl+]` | Increase font size |
| `Ctrl+[` | Decrease font size |
| `Ctrl+\` | Toggle whitespace visibility |
| `Escape` | Close the search bar or dialog |
| `?` | Open the shortcuts help panel |

## Auto Update

- Auto update is currently available only for the Windows installer build
- The downloadable `SvnDiffTool-<version>.exe` is the native Windows installer and downloads the main app package on first install
- The app checks GitHub Releases for new stable versions
- When an update is found, it prompts before download
- Once the download finishes, installation can be triggered from inside the app
- The first install shows the setup wizard; later upgrades are applied as silent in-place installs without walking through setup again
- Upgrades keep the current install directory, managed cache location, and integration settings; only uninstalling and installing again is treated as a fresh install

## Release Flow

The repository already includes a GitHub Release workflow:

- Trigger: push a tag matching `v*`
- CI environment: `windows-latest`
- Build contents: Node.js dependencies, the Rust parser, the native Windows installer, and auto-update assets
- Publish flow: `electron-builder` publishes the Windows installer and update metadata directly

A typical release flow looks like this:

```bash
# Bump the version
npm version 1.1.0

# Push code
git push origin main

# Push the tag to trigger the GitHub Release workflow
git push origin v1.1.0
```

## Project Structure

```text
SvnDiffTool/
├── .github/workflows/        # GitHub Release workflow
├── assets/                   # Icons and static assets
├── electron/                 # Electron main process, preload, and updater logic
├── rust/                     # Workbook parsing and diff pipeline
├── scripts/                  # Development and build scripts
├── src/
│   ├── components/           # UI components
│   ├── context/              # Theme and i18n context
│   ├── engine/               # Core diff / search / tokenizer logic
│   ├── hooks/                # Custom hooks
│   ├── locales/              # Chinese and English copy
│   ├── types/                # Shared types
│   └── utils/                # Workbook, cache, and settings utilities
├── tests/                    # Regression, performance, and workbook-related tests
├── package.json
└── vite.config.mts
```

## FAQ

### 1. Clicking Diff does not open the tool

Check these first:

- The `SvnDiffTool.exe` path is correct
- The executable path is quoted if needed
- The argument order is still `%base %mine %bname %yname %burl %yurl %brev %yrev %peg %fname`

### 2. The app opens with no content when started directly

That is usually expected. If the app is launched manually or via the development script without TortoiseSVN passing file arguments, it enters development mode and waits for you to choose a working-copy file or load sample data.

### 3. What is the difference between `strict` and `content` modes

- `strict` is more sensitive to whitespace, formula text, and exact workbook representation
- `content` is more normalized and is better when you want to downplay "technically different but not materially important" changes

### 4. `npm run build` or `npm run verify:ci` fails because `cargo` is missing

The build and CI verification pipelines compile the Rust parser. Install Rust stable and make sure `cargo` is available in your `PATH`; if it is not, set the `CARGO` environment variable to a working cargo executable.

### 5. Can very large files still be opened

The current implementation includes virtualization, caching, and performance guards for large text files and complex workbooks. Very large inputs can still take longer to parse and render, but they are no longer blocked by a fixed file-size threshold.

## Development Notes

A practical local development flow is:

```bash
npm install
npm run verify:ci
npm run dev:app
```

Before committing, at minimum run:

```bash
npm run verify:ci
```

That covers lint, TypeScript checks, the Rust parser build, repository tests, and app build output in one pass.
