# Issue Ledger

Use this ledger for full-library audits and for high-risk PRs.

## Status values

- `open`
- `in-progress`
- `blocked`
- `resolved`
- `accepted-risk`

## Ledger

| ID | Severity | Label | Unit | Summary | Owner | Status | Due | Required evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CR-001 | S1 | release | Build, installer, release, and config | Daily CI quality gates were missing outside release tags. | `@ClearLotus001` | resolved | 2026-03-27 | `ci-review-gates.yml`, release workflow update, local lint/typecheck/test evidence |
| CR-002 | S2 | renderer | Top-level app orchestration and state | `src/App.tsx` remains a high-fan-in orchestrator with large shared state surface. | `@ClearLotus001` | open | 2026-04-10 | Refactor plan or reduced state surface evidence |
| CR-003 | S2 | electron | Electron main process and IPC | `electron/main.ts` remains the largest risk hotspot and should be split by responsibility. | `@ClearLotus001` | open | 2026-04-10 | Proposed seam split, ownership map, and regression checklist |
| CR-004 | S2 | renderer | Workbook UI and virtualization | Workbook compare panels are still large and interaction-dense, which raises regression cost. | `@ClearLotus001` | open | 2026-04-10 | Component decomposition plan or complexity reduction evidence |
| CR-005 | S2 | rust | Rust workbook pipeline | Rust parser semantics still need manual review even though format and clippy gates are now enforced. | `@ClearLotus001` | open | 2026-04-10 | Manual parser review notes plus CI evidence |
| CR-006 | S2 | renderer | Top-level app orchestration and state | Historical unused exports are tracked in `unused-exports-baseline.txt` and should trend toward zero. | `@ClearLotus001` | open | 2026-04-17 | Reduced baseline file plus green `npm run lint` |

## Usage rules

- Every new finding must include one severity and one label.
- Every `open` item must have an owner and due date.
- `accepted-risk` must include why the team is accepting it and what signal would reopen it.
