# Versora comparison-source architecture

Versora separates **where content comes from** from **how content is compared and rendered**.

```text
Local files ─┐
Git objects ─┼─> source materialization ─> DiffData ─> text/workbook analysis ─> viewer
SVN revisions┤
External CLI ┘
```

## Source boundaries

- `electron/main/localFileCompare.ts` validates literal local pairs.
- `electron/main/gitOperations.ts` detects whether a selected file belongs to Git, queries that file's commit history, resolves selected versions, and reads blobs without mutating the repository.
- `electron/main/gitDiffBuilder.ts` dispatches a selected working-copy file to Git or SVN/local handling and materializes Git file versions into managed temporary inputs.
- `electron/main/svnOperations.ts` and `electron/main/svnHelpers.ts` own SVN history and working-copy behavior.
- `electron/main/diffBuilder.ts` remains the shared content-to-analysis pipeline.

Source adapters must not implement presentation-specific comparison. They produce two stable inputs and descriptive metadata, then hand off to the shared text/workbook pipeline.

## Git safety rules

The Git adapter uses `spawn` with an argument array and never invokes a shell. Versions are resolved to commit hashes before object reads, repository-relative paths are validated, working-tree symlinks cannot escape the repository, and command output is bounded. Supported operations are read-only (`rev-parse`, `log`, `show`, `cat-file`, and `ls-files`).

## Compatibility

The renderer uses a single `window.versora` bridge. TortoiseSVN launches enter through the command-line adapter and do not require a second renderer global. New settings use `versora.*` keys and fall back to the legacy `svn-excel-diff-tool.*` keys on first read.

The Windows cache root is now `Versora/Cache`. Runtime safety checks also recognize the legacy `SvnDiffTool/Cache` root so installer maintenance can migrate or clean previous versions safely.
