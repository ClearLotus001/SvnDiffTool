import type { DiffLine, WorkbookCompareMode } from '@/types';
import type { Locale } from '@/i18n/core';
import type { DiffTextSourceInput } from '@/utils/diff/diffSource';

export interface WorkbookDiffAsyncInput extends DiffTextSourceInput {
  compareMode?: WorkbookCompareMode;
  locale?: Locale;
}

export interface WorkbookDiffAsyncResult {
  diffLines: DiffLine[];
  textResolveMs: number;
  diffMs: number;
}

export interface WorkbookDiffWorkerRequest {
  requestId: number;
  source: DiffTextSourceInput;
  compareMode: WorkbookCompareMode;
  locale: Locale;
}

export interface WorkbookDiffWorkerSuccess {
  ok: true;
  requestId: number;
  result: WorkbookDiffAsyncResult;
}

export interface WorkbookDiffWorkerFailure {
  ok: false;
  requestId: number;
  error: string;
}

export type WorkbookDiffWorkerResponse = WorkbookDiffWorkerSuccess | WorkbookDiffWorkerFailure;
