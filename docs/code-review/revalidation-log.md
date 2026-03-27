# Revalidation Log

Record every machine-gate rerun and every manual verification pass here.

## Baseline

| Date | Environment | Command or scenario | Result | Notes |
| --- | --- | --- | --- | --- |
| 2026-03-27 | Local Windows workspace | `npm run lint` | pass | Includes ESLint plus unused-export gate with baseline allowlist |
| 2026-03-27 | Local Windows workspace | `npm run typecheck` | pass | Renderer, Electron, scripts, and bootstrapper typecheck all green |
| 2026-03-27 | Local Windows workspace | `npm run test:workbook` | pass | Workbook and diff regression suite passed |
| 2026-03-27 | Local Windows workspace | `cargo fmt --manifest-path rust/Cargo.toml --check` | blocked | `cargo` not installed in this local environment; CI is the source of truth |
| 2026-03-27 | Local Windows workspace | `cargo clippy --manifest-path rust/Cargo.toml -- -D warnings` | blocked | `cargo` not installed in this local environment; CI is the source of truth |
| 2026-03-27 | Local Windows workspace | `npm run build` | pass | Renderer, Electron, and Rust release build all completed locally |

## Review samples

| Sample | Focus area | Expected review focus |
| --- | --- | --- |
| `1bdd5df` | Workbook cache coverage and merge logic | Cache coverage merge rules, payload completeness, stale cache satisfaction |
| `22e7f3f` | Workbook diff UX and release flow | UI state transitions, workbook compare ergonomics, release pipeline correctness |
| `7e900fa` | Window startup behavior | Desktop UX defaults, regressions around window state, missing acceptance coverage |

## Update rule

- Add a new row whenever a blocking finding is fixed and re-run.
- Do not overwrite old rows; append new evidence.
