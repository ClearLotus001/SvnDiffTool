# Module Inventory

This file is the fixed review map for full-library audits.

## Review order

1. Electron main process and IPC
2. Top-level app orchestration and state
3. Workbook UI and virtualization
4. Text diff engine
5. Rust workbook pipeline
6. Build, installer, release, and config

## Units

| Unit | Scope | Hotspots | Primary concerns | Current conclusion |
| --- | --- | --- | --- | --- |
| Electron main process and IPC | `electron/main.ts`, `preload`, CLI args, cache, updater, config | `electron/main.ts`, `electron/installerBootstrap.ts`, `electron/runtimePaths.ts` | IPC contract stability, cache merge correctness, single-instance behavior, update and installer safety | Conditional pass. Deep review required because `electron/main.ts` remains the largest process-critical file. |
| Top-level app orchestration and state | `src/App.tsx`, `src/hooks/app/*`, app-shell composition | `src/App.tsx`, `src/hooks/app/useDiffLoader.ts`, `src/hooks/app/useRevisionCompare.ts` | state ownership, effect ordering, async race handling, top-level contract drift | Conditional pass. Lint and type gates now cover this layer, but state orchestration is still high-risk. |
| Workbook UI and virtualization | `src/components/workbook/*`, `src/hooks/virtualization/*`, `src/utils/workbook/*` | `WorkbookComparePanel.tsx`, `WorkbookHorizontalPanel.tsx`, `WorkbookColumnsCanvasStrip.tsx` | large workbook performance, scroll sync, freeze and hidden-column consistency, selection behavior | Conditional pass. Strong test coverage exists, but component size and interaction density still justify focused review. |
| Text diff engine | `src/engine/text/*`, `src/utils/diff/*` | `textChangeAlignment.ts`, `diff.ts`, `search.ts` | replacement pairing, search correctness, collapse alignment, large-file behavior | Pass with monitoring. Regression tests are already strong; manual review should focus on algorithm boundary changes. |
| Rust workbook pipeline | `rust/src/*` | `rust/src/diff.rs`, `rust/src/workbook/scan.rs`, `rust/src/workbook/metadata.rs` | parser correctness, shared strings, memory behavior, JS-Rust payload contract | Conditional pass. CI now enforces `rustfmt` and `clippy`, but code review still needs to confirm parser semantics. |
| Build, installer, release, and config | `scripts/*`, `bootstrapper/*`, workflow files, config and i18n | `scripts/build-win-installer.ts`, `bootstrapper/main.ts`, `.github/workflows/*` | release reproducibility, bootstrapper UX, config migration, platform assumptions | Improved. The daily quality gate now exists; release flow also reuses the same checks. |

## Reviewer roles

For each unit, capture all three roles in the ledger or PR:

- Architecture reviewer: module ownership, layering, file-size pressure, refactor recommendations
- Domain reviewer: behavior correctness and user-facing risk
- Verification reviewer: tests, repro steps, acceptance evidence

## Current hotspot ranking

These files should be inspected early in every full-library audit:

1. `electron/main.ts`
2. `src/components/workbook/WorkbookComparePanel.tsx`
3. `src/components/workbook/WorkbookHorizontalPanel.tsx`
4. `src/App.tsx`
5. `rust/src/workbook/scan.rs`
6. `src/hooks/app/useDiffLoader.ts`
