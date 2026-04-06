import { useCallback, useEffect, useRef, type Dispatch, type MutableRefObject, type RefObject, type SetStateAction } from 'react';

import type { TextSplitLayoutSnapshot } from '@/types';
import {
  areCollapseExpansionStatesEqual,
  cloneCollapseExpansionState,
  EMPTY_COLLAPSE_EXPANSION_STATE,
  type CollapseExpansionState,
} from '@/utils/collapse/collapseState';

interface UseSplitPanelLayoutSnapshotEffectsParams {
  diffIdentity: unknown;
  isWorkbookMode: boolean;
  horizontalSplitEnabled: boolean;
  layoutSnapshot: TextSplitLayoutSnapshot | null;
  sharedExpandedBlocks: CollapseExpansionState | null;
  expandedBlocks: CollapseExpansionState;
  setExpandedBlocks: Dispatch<SetStateAction<CollapseExpansionState>>;
  onLayoutSnapshotChange?: ((snapshot: TextSplitLayoutSnapshot) => void) | undefined;
  onExpandedBlocksChange?: ((expandedBlocks: CollapseExpansionState) => void) | undefined;
  scrollRef: RefObject<HTMLDivElement | null>;
  leftPaneScrollRef: RefObject<HTMLDivElement | null>;
  rightPaneScrollRef: RefObject<HTMLDivElement | null>;
  restoreSplitRatio: (ratio: number) => number;
  splitRatio: number;
  splitRatioRef: MutableRefObject<number>;
  defaultSplitRatio: number;
}

export function useSplitPanelLayoutSnapshotEffects({
  diffIdentity,
  isWorkbookMode,
  horizontalSplitEnabled,
  layoutSnapshot,
  sharedExpandedBlocks,
  expandedBlocks,
  setExpandedBlocks,
  onLayoutSnapshotChange,
  onExpandedBlocksChange,
  scrollRef,
  leftPaneScrollRef,
  rightPaneScrollRef,
  restoreSplitRatio,
  splitRatio,
  splitRatioRef,
  defaultSplitRatio,
}: UseSplitPanelLayoutSnapshotEffectsParams) {
  const snapshotEmitRafRef = useRef(0);

  useEffect(() => {
    if (isWorkbookMode) return;
    const snapshotState = sharedExpandedBlocks
      ?? layoutSnapshot?.expandedBlocks
      ?? EMPTY_COLLAPSE_EXPANSION_STATE;
    setExpandedBlocks((previous) => (
      areCollapseExpansionStatesEqual(previous, snapshotState)
        ? previous
        : cloneCollapseExpansionState(snapshotState)
    ));

    if (horizontalSplitEnabled) {
      const nextRatio = layoutSnapshot?.layout === 'split-h'
        ? layoutSnapshot.splitRatio
        : defaultSplitRatio;
      restoreSplitRatio(nextRatio);

      const left = leftPaneScrollRef.current;
      const right = rightPaneScrollRef.current;
      const rafId = requestAnimationFrame(() => {
        if (left) {
          left.scrollTop = layoutSnapshot?.layout === 'split-h' ? layoutSnapshot.leftScrollTop : 0;
          left.scrollLeft = layoutSnapshot?.layout === 'split-h' ? layoutSnapshot.leftScrollLeft : 0;
        }
        if (right) {
          right.scrollTop = layoutSnapshot?.layout === 'split-h' ? layoutSnapshot.rightScrollTop : 0;
          right.scrollLeft = layoutSnapshot?.layout === 'split-h' ? layoutSnapshot.rightScrollLeft : 0;
        }
      });
      return () => cancelAnimationFrame(rafId);
    }

    const scroller = scrollRef.current;
    if (!scroller) return;
    const rafId = requestAnimationFrame(() => {
      scroller.scrollTop = layoutSnapshot?.layout === 'split-v' ? layoutSnapshot.scrollTop : 0;
      scroller.scrollLeft = layoutSnapshot?.layout === 'split-v' ? layoutSnapshot.scrollLeft : 0;
    });
    return () => cancelAnimationFrame(rafId);
  }, [
    defaultSplitRatio,
    diffIdentity,
    horizontalSplitEnabled,
    isWorkbookMode,
    layoutSnapshot,
    leftPaneScrollRef,
    restoreSplitRatio,
    rightPaneScrollRef,
    scrollRef,
    setExpandedBlocks,
    sharedExpandedBlocks,
  ]);

  const emitLayoutSnapshot = useCallback(() => {
    if (isWorkbookMode || !onLayoutSnapshotChange) return;

    if (horizontalSplitEnabled) {
      const left = leftPaneScrollRef.current;
      const right = rightPaneScrollRef.current;
      onLayoutSnapshotChange({
        layout: 'split-h',
        leftScrollTop: left?.scrollTop ?? 0,
        leftScrollLeft: left?.scrollLeft ?? 0,
        rightScrollTop: right?.scrollTop ?? 0,
        rightScrollLeft: right?.scrollLeft ?? 0,
        splitRatio: splitRatioRef.current,
        expandedBlocks: cloneCollapseExpansionState(expandedBlocks),
      });
      return;
    }

    const scroller = scrollRef.current;
    onLayoutSnapshotChange({
      layout: 'split-v',
      scrollTop: scroller?.scrollTop ?? 0,
      scrollLeft: scroller?.scrollLeft ?? 0,
      expandedBlocks: cloneCollapseExpansionState(expandedBlocks),
    });
  }, [
    expandedBlocks,
    horizontalSplitEnabled,
    isWorkbookMode,
    leftPaneScrollRef,
    onLayoutSnapshotChange,
    rightPaneScrollRef,
    scrollRef,
    splitRatioRef,
  ]);

  useEffect(() => {
    if (isWorkbookMode || !onLayoutSnapshotChange) return;
    emitLayoutSnapshot();
  }, [emitLayoutSnapshot, expandedBlocks, isWorkbookMode, onLayoutSnapshotChange, splitRatio]);

  useEffect(() => {
    if (isWorkbookMode || !onExpandedBlocksChange) return;
    onExpandedBlocksChange(expandedBlocks);
  }, [expandedBlocks, isWorkbookMode, onExpandedBlocksChange]);

  useEffect(() => {
    if (isWorkbookMode || !onLayoutSnapshotChange) return undefined;
    const scrollTargets = horizontalSplitEnabled
      ? [leftPaneScrollRef.current, rightPaneScrollRef.current]
      : [scrollRef.current];

    const handleScroll = () => {
      if (snapshotEmitRafRef.current) return;
      snapshotEmitRafRef.current = requestAnimationFrame(() => {
        snapshotEmitRafRef.current = 0;
        emitLayoutSnapshot();
      });
    };

    scrollTargets.forEach((target) => target?.addEventListener('scroll', handleScroll, { passive: true }));
    return () => {
      scrollTargets.forEach((target) => target?.removeEventListener('scroll', handleScroll));
      if (snapshotEmitRafRef.current) {
        cancelAnimationFrame(snapshotEmitRafRef.current);
        snapshotEmitRafRef.current = 0;
      }
      emitLayoutSnapshot();
    };
  }, [emitLayoutSnapshot, horizontalSplitEnabled, isWorkbookMode, leftPaneScrollRef, onLayoutSnapshotChange, rightPaneScrollRef, scrollRef]);
}
