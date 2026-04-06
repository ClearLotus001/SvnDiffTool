import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  countRemainingCollapses,
  findCyclicCollapseIndex,
  getCollapseIndexes,
  resolveActiveCollapsePosition,
} from '@/utils/collapse/collapseNavigation';

export type CollapseNavigationDirection = 'prev' | 'next';
export type CollapseNavigationHandler = (direction: CollapseNavigationDirection) => void;

interface UseCollapseNavigationStateParams<TItem> {
  items: readonly TItem[];
  startIdx: number;
  endIdx: number;
  isCollapseItem: (item: TItem) => boolean;
  scrollToIndex: (idx: number, align?: 'start' | 'center') => void;
  onCollapseNavigationReady?: ((navigate: CollapseNavigationHandler | null) => void) | undefined;
}

interface UseCollapseNavigationStateResult {
  activeCollapseIndex: number | null;
  activeCollapsePosition: number;
  totalCollapseCount: number;
  handleJumpToNextCollapse: () => void;
  handleJumpToPreviousCollapse: () => void;
  resetActiveCollapseNavigation: () => void;
}

export function useCollapseNavigationState<TItem>({
  items,
  startIdx,
  endIdx,
  isCollapseItem,
  scrollToIndex,
  onCollapseNavigationReady,
}: UseCollapseNavigationStateParams<TItem>): UseCollapseNavigationStateResult {
  const [activeCollapseIndex, setActiveCollapseIndex] = useState<number | null>(null);

  const collapseIndexes = useMemo(
    () => getCollapseIndexes(items, isCollapseItem),
    [isCollapseItem, items],
  );
  const totalCollapseCount = useMemo(
    () => countRemainingCollapses(items, 0, isCollapseItem),
    [isCollapseItem, items],
  );

  useEffect(() => {
    if (activeCollapseIndex == null) return;
    if (collapseIndexes.includes(activeCollapseIndex)) return;
    setActiveCollapseIndex(null);
  }, [activeCollapseIndex, collapseIndexes]);

  const activeCollapsePosition = useMemo(
    () => resolveActiveCollapsePosition(collapseIndexes, activeCollapseIndex, startIdx),
    [activeCollapseIndex, collapseIndexes, startIdx],
  );

  const handleJumpToNextCollapse = useCallback(() => {
    const nextCollapseIndex = findCyclicCollapseIndex(
      collapseIndexes,
      activeCollapseIndex,
      endIdx,
      'next',
    );
    if (nextCollapseIndex < 0) return;
    setActiveCollapseIndex(nextCollapseIndex);
    scrollToIndex(nextCollapseIndex, 'start');
  }, [activeCollapseIndex, collapseIndexes, endIdx, scrollToIndex]);

  const handleJumpToPreviousCollapse = useCallback(() => {
    const previousCollapseIndex = findCyclicCollapseIndex(
      collapseIndexes,
      activeCollapseIndex,
      startIdx,
      'prev',
    );
    if (previousCollapseIndex < 0) return;
    setActiveCollapseIndex(previousCollapseIndex);
    scrollToIndex(previousCollapseIndex, 'start');
  }, [activeCollapseIndex, collapseIndexes, scrollToIndex, startIdx]);

  useEffect(() => {
    onCollapseNavigationReady?.((direction) => {
      if (direction === 'prev') {
        handleJumpToPreviousCollapse();
        return;
      }
      handleJumpToNextCollapse();
    });
    return () => onCollapseNavigationReady?.(null);
  }, [handleJumpToNextCollapse, handleJumpToPreviousCollapse, onCollapseNavigationReady]);

  const resetActiveCollapseNavigation = useCallback(() => {
    setActiveCollapseIndex(null);
  }, []);

  return {
    activeCollapseIndex,
    activeCollapsePosition,
    totalCollapseCount,
    handleJumpToNextCollapse,
    handleJumpToPreviousCollapse,
    resetActiveCollapseNavigation,
  };
}
