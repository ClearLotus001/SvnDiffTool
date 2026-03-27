# Frontend Structure

This document summarizes the current frontend code layout after the directory and hook refactors.

## Top-level layering

`src/components`
- Reusable UI grouped by responsibility such as `app`, `app-shell`, `diff`, `navigation`, `shared`, and `workbook`.

`src/hooks`
- The single root for all hooks.
- `app/` contains app orchestration hooks, contracts, and helper utilities.
- `virtualization/` contains reusable virtual scrolling hooks.
- `workbook/` contains workbook-specific reusable hooks.

`src/utils`
- Pure helper logic grouped by `app`, `collapse`, `diff`, and `workbook`.

`src/engine`
- Diff algorithms and processing logic split by `text` and `workbook`.

`src/types`
- Shared type barrel split into domain files and re-exported from `index.ts`.

## App orchestration

`src/App.tsx`
- Owns high-level state assembly and component composition.
- Delegates orchestration behavior to `src/hooks/app`.

`src/components/app-shell`
- Contains the shell-level content and dialog composition used by `App.tsx`.

`src/hooks/app/contracts.ts`
- Defines the controller shapes shared across app hooks:
  - `DialogController`
  - `DiffLoadController`
  - `RevisionQueryController`
  - `WorkbookUiController`

## Controller pattern

App-level state hooks return `{ state, actions }` instead of many unrelated setter exports.

Benefits:
- Hook signatures stay stable as state grows.
- Callers pass a small number of domain controllers instead of long setter lists.
- Related state and actions stay grouped by responsibility.

## Import guidance

Prefer importing app hooks and app-level contracts from:

```ts
import {
  useDiffLoader,
  useRevisionCompare,
  type WorkbookUiController,
} from '@/hooks/app';
```

Prefer importing shared types from:

```ts
import type { DiffData, WorkbookCompareMode } from '@/types';
```

This keeps imports consistent and reduces coupling to individual file paths.
