# Canonical Review Checklist

Apply the same checklist to every review unit.

## Correctness

- Are input and output contracts explicit and consistent with current callers?
- Are edge cases covered for empty input, same-file compare, large files, and partial payloads?
- Do error paths leave the app in a recoverable state?
- Are caches invalidated and merged correctly for the changed execution path?
- Are persisted settings, revision state, and workbook layout snapshots restored safely?

## Performance

- Does the change add repeated parsing, repeated diff computation, or avoidable object churn?
- Is main-thread work bounded for large text files and large workbooks?
- Are scroll, hover, tooltip, or selection handlers doing unnecessary work per frame?
- Does the cache still prevent re-reading or re-diffing the same payload when expected?
- If a large file path changed, is there benchmark or regression evidence?

## Security and boundaries

- Are Electron preload and IPC surfaces still minimal and typed?
- Are file paths, temp paths, cache roots, and installer paths normalized and validated?
- Are CLI arguments, SVN output, and XML or workbook payloads handled defensively?
- Does the change preserve update, install, and bootstrapper trust boundaries?
- Are renderer modules still isolated from Electron main and build-only code?

## Maintainability

- Does the module own one clear responsibility?
- Did any hot file become harder to reason about?
- Are helpers and exports still necessary, or should they be inlined or removed?
- Are new types, hooks, and utility names aligned with the existing structure?
- If complexity increased, is there a documented follow-up or decomposition issue?

## Tests and evidence

- Which automated commands were run, and what passed?
- Which manual scenarios were exercised?
- Is there regression coverage for the changed risk path?
- If coverage is intentionally missing, is the gap recorded in the issue ledger?
- Has revalidation been recorded after the fix?

## Sign-off rule

- `S0` and `S1` findings require a fix plus revalidation before the review can close.
- `S2` and `S3` findings require an owner, target milestone, and evidence expectations.
