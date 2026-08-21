import { useCallback, useEffect, useMemo, useState } from 'react';

import type { WorkbookHiddenColumnSegment } from '@/types';
import type { WorkbookCollapsedSheetTabItem } from '@/utils/workbook/workbookAutoCollapse';

export interface WorkbookRowCollapseNavigationTarget {
  key: string;
  itemIndex: number;
}

type WorkbookCollapseNavigationTarget =
  | { kind: 'sheet'; key: string; group: WorkbookCollapsedSheetTabItem }
  | { kind: 'column'; key: string; segment: WorkbookHiddenColumnSegment }
  | { kind: 'row'; key: string; target: WorkbookRowCollapseNavigationTarget };

interface UseWorkbookCollapseNavigationStateParams {
  scopeKey: string;
  sheetGroups: readonly WorkbookCollapsedSheetTabItem[];
  columnSegments: readonly WorkbookHiddenColumnSegment[];
  rowTargets: readonly WorkbookRowCollapseNavigationTarget[];
  startIdx: number;
  endIdx: number;
  onNavigateSheet: (group: WorkbookCollapsedSheetTabItem) => void;
  onNavigateColumn: (segment: WorkbookHiddenColumnSegment) => void;
  onNavigateRow: (target: WorkbookRowCollapseNavigationTarget) => void;
}

function findInitialRowTarget(
  rowTargets: readonly WorkbookRowCollapseNavigationTarget[],
  direction: 'prev' | 'next',
  startIdx: number,
  endIdx: number,
) {
  if (direction === 'next') {
    return rowTargets.find((target) => target.itemIndex > endIdx) ?? rowTargets[0] ?? null;
  }
  for (let index = rowTargets.length - 1; index >= 0; index -= 1) {
    const target = rowTargets[index]!;
    if (target.itemIndex < startIdx) return target;
  }
  return rowTargets[rowTargets.length - 1] ?? null;
}

export function useWorkbookCollapseNavigationState({
  scopeKey,
  sheetGroups,
  columnSegments,
  rowTargets,
  startIdx,
  endIdx,
  onNavigateSheet,
  onNavigateColumn,
  onNavigateRow,
}: UseWorkbookCollapseNavigationStateParams) {
  const [activeTargetKey, setActiveTargetKey] = useState<string | null>(null);
  const targets = useMemo<WorkbookCollapseNavigationTarget[]>(() => [
    ...sheetGroups.map((group) => ({
      kind: 'sheet' as const,
      key: `sheet:${group.key}`,
      group,
    })),
    ...columnSegments.map((segment) => ({
      kind: 'column' as const,
      key: `column:${scopeKey}:${segment.startCol}:${segment.endCol}`,
      segment,
    })),
    ...rowTargets.map((target) => ({
      kind: 'row' as const,
      key: `row:${target.key}`,
      target,
    })),
  ], [columnSegments, rowTargets, scopeKey, sheetGroups]);

  const activeTargetPosition = activeTargetKey == null
    ? -1
    : targets.findIndex((target) => target.key === activeTargetKey);

  useEffect(() => {
    if (activeTargetKey == null || activeTargetPosition >= 0) return;
    setActiveTargetKey(null);
  }, [activeTargetKey, activeTargetPosition]);

  const activateTarget = useCallback((target: WorkbookCollapseNavigationTarget) => {
    setActiveTargetKey(target.key);
    if (target.kind === 'sheet') {
      onNavigateSheet(target.group);
      return;
    }
    if (target.kind === 'column') {
      onNavigateColumn(target.segment);
      return;
    }
    onNavigateRow(target.target);
  }, [onNavigateColumn, onNavigateRow, onNavigateSheet]);

  const navigate = useCallback((direction: 'prev' | 'next') => {
    if (targets.length === 0) return;
    if (activeTargetPosition >= 0) {
      const delta = direction === 'next' ? 1 : -1;
      const position = (activeTargetPosition + delta + targets.length) % targets.length;
      activateTarget(targets[position]!);
      return;
    }

    const initialRowTarget = findInitialRowTarget(rowTargets, direction, startIdx, endIdx);
    const initialTarget = initialRowTarget
      ? targets.find((target) => target.kind === 'row' && target.target.key === initialRowTarget.key)
      : direction === 'next'
        ? targets[0]
        : targets[targets.length - 1];
    if (initialTarget) activateTarget(initialTarget);
  }, [activateTarget, activeTargetPosition, endIdx, rowTargets, startIdx, targets]);

  const handleJumpToNextCollapse = useCallback(() => navigate('next'), [navigate]);
  const handleJumpToPreviousCollapse = useCallback(() => navigate('prev'), [navigate]);
  const resetActiveCollapseNavigation = useCallback(() => setActiveTargetKey(null), []);
  const activeTarget = activeTargetPosition >= 0 ? targets[activeTargetPosition] ?? null : null;

  return {
    activeCollapseIndex: activeTarget?.kind === 'row' ? activeTarget.target.itemIndex : null,
    activeCollapsePosition: activeTargetPosition,
    totalCollapseCount: targets.length,
    handleJumpToNextCollapse,
    handleJumpToPreviousCollapse,
    resetActiveCollapseNavigation,
  };
}
