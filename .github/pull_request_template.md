## Summary

- What changed:
- Why this change is needed:

## Review Units

- [ ] `renderer`
- [ ] `electron`
- [ ] `rust`
- [ ] `release`
- [ ] `i18n-config`

## Risk Level

- [ ] `S0` crash, data corruption, wrong diff result, installer/update failure, security boundary break
- [ ] `S1` core behavior bug, cache/state corruption, IPC risk, performance disaster, compatibility break
- [ ] `S2` maintainability issue, module ownership blur, missing regression coverage, visible UX regression
- [ ] `S3` naming, duplication, localized cleanup, docs-only gap

## Runtime Impact

- [ ] Renderer React UI
- [ ] Electron main or preload
- [ ] Rust workbook parser
- [ ] Installer or bootstrapper
- [ ] Build or release workflow
- [ ] Settings, i18n, or persisted user data

## Public Contract Changes

- User-visible strings, settings keys, IPC contracts, Rust or TS payload shapes, or release behavior changed:
- If yes, list the contract and the compatibility expectation:

## Test Evidence

- Commands run:
- Manual scenarios verified:
- New or updated regression coverage:

## Rollback Plan

- How to revert safely if this change fails in production:
- Which user-visible or persisted artifacts may need cleanup:

## Review Sign-Off

- [ ] Architecture review completed
- [ ] Domain review completed
- [ ] Verification review completed

## Single-Maintainer Record

- First-pass review time:
- Second-pass review time:
- Checklist or issue ledger links:
