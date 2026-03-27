# SvnDiffTool Code Review Program

This directory contains the repository-level code review system for `SvnDiffTool`.
It is designed for full-library health checks first, then reused for day-to-day PR review.

## Review assets

- [Module Inventory](./module-inventory.md)
- [Canonical Checklist](./checklist.md)
- [Issue Ledger](./issue-ledger.md)
- [Revalidation Log](./revalidation-log.md)
- [Unused Exports Baseline](./unused-exports-baseline.txt)

## Machine gates

The required machine gates are wired into `.github/workflows/ci-review-gates.yml` and also run in the release workflow.

Local command sequence:

```bash
npm run lint
npm run typecheck
npm run test:workbook
cargo fmt --manifest-path rust/Cargo.toml --check
cargo clippy --manifest-path rust/Cargo.toml -- -D warnings
npm run build
```

Notes:

- `npm run lint` covers `src/`, `electron/`, `scripts/`, and `bootstrapper/`.
- The lint gate includes a custom unused-export detector with an explicit baseline allowlist.
- Rust format and clippy checks are authoritative in CI when a local machine does not have `cargo`.

## Severity and labels

Severity:

- `S0`: crash, data corruption, wrong diff result, installer or update failure, security boundary break
- `S1`: core behavior bug, cache or state corruption, IPC risk, performance disaster, compatibility break
- `S2`: maintainability issue, module ownership blur, missing regression coverage, visible UX regression
- `S3`: naming, duplication, localized cleanup, documentation gap

Area labels:

- `renderer`
- `electron`
- `rust`
- `release`
- `i18n-config`

Every finding and every module conclusion should include one severity and one area label.

## Review flow

1. Run all machine gates. Do not start manual review if any gate is red.
2. Review modules in the order listed in [Module Inventory](./module-inventory.md).
3. Record findings in [Issue Ledger](./issue-ledger.md) with severity, label, owner, due date, and required evidence.
4. Re-run the required commands and capture results in [Revalidation Log](./revalidation-log.md).
5. Close the review only when all `S0` and `S1` findings are fixed and revalidated.

## Ownership and single-maintainer fallback

- `CODEOWNERS` maps all current review units to `@ClearLotus001`.
- If there is only one maintainer available, the required fallback is:

```text
First pass: checklist-based self review
Second pass: re-review after at least 24 hours with a fresh issue ledger pass
```

Both passes must be recorded in the PR template or the review ledger.

## Branch protection expectation

Repository settings should require the `CI Review Gates / review-gates` check before merge to `main`.
