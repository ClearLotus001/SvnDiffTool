import { computeDiff } from '@/engine/text/diff';
import { prepareTextDiffAnalysisFromDiffLines } from '@/utils/diff/preparedTextAnalysis';
import type { DiffData, LayoutMode } from '@/types';

export interface E2ELoadTextDiffPayload {
  fileName?: string;
  baseName?: string;
  mineName?: string;
  baseContent: string;
  mineContent: string;
  layout?: LayoutMode;
  collapseCtx?: boolean;
}

export interface E2ELoadWorkbookDiffPayload {
  fileName?: string;
  baseName?: string;
  mineName?: string;
  baseContent: string;
  mineContent: string;
  layout?: LayoutMode;
  collapseCtx?: boolean;
}

export interface E2EBridgeSnapshot {
  hasLoadedDiff: boolean;
  layout: LayoutMode;
  isWorkbookMode: boolean;
  fileName: string;
}

export interface E2EBridge {
  loadTextDiff(payload: E2ELoadTextDiffPayload): Promise<void>;
  loadWorkbookDiff(payload: E2ELoadWorkbookDiffPayload): Promise<void>;
  getSnapshot(): E2EBridgeSnapshot;
}

export function shouldEnableE2EBridge() {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('__e2e') === '1';
}

declare global {
  interface Window {
    __SVN_DIFF_E2E__?: E2EBridge;
  }
}

export function buildE2EDiffData(payload: E2ELoadTextDiffPayload): DiffData {
  const fileName = payload.fileName?.trim() || 'selection-sample.ts';
  const baseName = payload.baseName?.trim() || 'base.ts';
  const mineName = payload.mineName?.trim() || 'mine.ts';
  const diffLines = computeDiff(payload.baseContent, payload.mineContent);
  return {
    svnUrl: '',
    fileName,
    baseName,
    mineName,
    launchBaseName: baseName,
    launchMineName: mineName,
    compareContext: 'literal_two_file_compare',
    baseContent: payload.baseContent,
    mineContent: payload.mineContent,
    baseBytes: null,
    mineBytes: null,
    analysisSnapshotsByMode: {
      strict: {
        compareMode: 'strict',
        textAnalysis: prepareTextDiffAnalysisFromDiffLines(diffLines),
        workbookAnalysis: null,
      },
    },
    revisionOptions: null,
    baseRevisionInfo: null,
    mineRevisionInfo: null,
    canSwitchRevisions: false,
    workbookArtifactDiff: null,
    sourceNoticeCode: null,
    perf: {
      source: 'local-dev',
    },
  };
}

export function buildE2EWorkbookDiffData(payload: E2ELoadWorkbookDiffPayload): DiffData {
  const fileName = payload.fileName?.trim() || 'workbook-sample.xlsx';
  const baseName = payload.baseName?.trim() || 'workbook-base.xlsx';
  const mineName = payload.mineName?.trim() || 'workbook-mine.xlsx';
  return {
    svnUrl: '',
    fileName,
    baseName,
    mineName,
    launchBaseName: baseName,
    launchMineName: mineName,
    compareContext: 'literal_two_file_compare',
    baseContent: payload.baseContent,
    mineContent: payload.mineContent,
    baseBytes: null,
    mineBytes: null,
    analysisSnapshotsByMode: null,
    revisionOptions: null,
    baseRevisionInfo: null,
    mineRevisionInfo: null,
    canSwitchRevisions: false,
    workbookArtifactDiff: null,
    sourceNoticeCode: null,
    perf: {
      source: 'local-dev',
    },
  };
}
