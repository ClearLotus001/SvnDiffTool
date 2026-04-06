import type {
  DiffLine,
  SearchMatch,
  WorkbookDiffRegion,
} from '@/types';
import {
  resolveWorkbookSheetNameForLineContext,
  type WorkbookLineSheetContext,
} from '@/utils/workbook/workbookSections';

export interface WorkbookSheetSyncRequest {
  eventKey: string;
  sheetName: string;
}

interface ResolveWorkbookSearchSheetSyncArgs {
  isWorkbookMode: boolean;
  activeSearchIdx: number;
  searchJumpNonce: number;
  searchMatches: SearchMatch[];
  diffLines: DiffLine[];
  lineSheetContexts: WorkbookLineSheetContext[];
  preferredSheetName: string | null;
  fallbackSheetName: string | null;
}

interface ResolveWorkbookNavigationSheetSyncArgs {
  isWorkbookMode: boolean;
  activeSearchIdx: number;
  searchMatches: SearchMatch[];
  activeWorkbookDiffRegion: WorkbookDiffRegion | null;
  hunkIdx: number;
  hunkPositions: number[];
  diffLines: DiffLine[];
  lineSheetContexts: WorkbookLineSheetContext[];
  preferredSheetName: string | null;
}

function normalizeSyncKeyPart(value: string | number | null | undefined): string {
  return value == null ? '' : String(value);
}

export function resolveWorkbookSearchSheetSyncRequest({
  isWorkbookMode,
  activeSearchIdx,
  searchJumpNonce,
  searchMatches,
  diffLines,
  lineSheetContexts,
  preferredSheetName,
  fallbackSheetName,
}: ResolveWorkbookSearchSheetSyncArgs): WorkbookSheetSyncRequest | null {
  if (!isWorkbookMode || activeSearchIdx < 0) return null;

  const activeSearchMatch = searchMatches[activeSearchIdx] ?? null;
  const lineIdx = activeSearchMatch?.lineIdx;
  if (lineIdx == null) return null;

  const sheetName = activeSearchMatch?.workbookTarget?.sheetName
    ?? resolveWorkbookSheetNameForLineContext({
      line: diffLines[lineIdx] ?? null,
      context: lineSheetContexts[lineIdx] ?? null,
      preferredSheetName: preferredSheetName ?? fallbackSheetName ?? null,
    });
  if (!sheetName) return null;

  return {
    sheetName,
    eventKey: [
      'search',
      searchJumpNonce,
      activeSearchIdx,
      lineIdx,
      activeSearchMatch?.workbookTarget?.sheetName ?? '',
      activeSearchMatch?.workbookTarget?.side ?? '',
      activeSearchMatch?.workbookTarget?.rowNumber ?? '',
      activeSearchMatch?.workbookTarget?.colIndex ?? '',
    ].map(normalizeSyncKeyPart).join('::'),
  };
}

export function resolveWorkbookNavigationSheetSyncRequest({
  isWorkbookMode,
  activeSearchIdx,
  searchMatches,
  activeWorkbookDiffRegion,
  hunkIdx,
  hunkPositions,
  diffLines,
  lineSheetContexts,
  preferredSheetName,
}: ResolveWorkbookNavigationSheetSyncArgs): WorkbookSheetSyncRequest | null {
  if (!isWorkbookMode) return null;

  const activeSearchMatch = activeSearchIdx >= 0
    ? (searchMatches[activeSearchIdx] ?? null)
    : null;
  if (activeSearchMatch) return null;

  const targetLineIdx = hunkPositions[hunkIdx] ?? null;
  const sheetName = activeWorkbookDiffRegion?.sheetName
    ?? (targetLineIdx == null
      ? null
      : resolveWorkbookSheetNameForLineContext({
        line: diffLines[targetLineIdx] ?? null,
        context: lineSheetContexts[targetLineIdx] ?? null,
        preferredSheetName,
      }));
  if (!sheetName) return null;

  return {
    sheetName,
    eventKey: [
      'navigation',
      activeWorkbookDiffRegion?.id ?? '',
      activeWorkbookDiffRegion?.sheetName ?? '',
      hunkIdx,
      targetLineIdx ?? '',
    ].map(normalizeSyncKeyPart).join('::'),
  };
}
