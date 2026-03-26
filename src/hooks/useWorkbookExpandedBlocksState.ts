import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { WorkbookLayoutSnapshot } from '../types';
import type { CollapseExpansionState } from '../utils/collapseState';
import {
  cloneCollapseExpansionState,
  resolveWorkbookExpandedBlocksForContext,
} from '../utils/workbookLayoutSnapshot';

interface UseWorkbookExpandedBlocksStateOptions {
  sheetName: string | null;
  activeRegionId: string | null;
  layoutSnapshot: WorkbookLayoutSnapshot | null | undefined;
  sharedExpandedBlocks: CollapseExpansionState | null | undefined;
  syncKey?: string | number | null | undefined;
}

export function useWorkbookExpandedBlocksState({
  sheetName,
  activeRegionId,
  layoutSnapshot,
  sharedExpandedBlocks,
  syncKey = null,
}: UseWorkbookExpandedBlocksStateOptions) {
  const contextKey = `${sheetName ?? ''}::${activeRegionId ?? ''}`;
  const syncStateKey = `${contextKey}::${syncKey ?? ''}`;
  const resolvedExpandedBlocks = useMemo(
    () => resolveWorkbookExpandedBlocksForContext(
      layoutSnapshot,
      sharedExpandedBlocks,
      activeRegionId,
      sheetName,
    ),
    [activeRegionId, layoutSnapshot, sharedExpandedBlocks, sheetName],
  );
  const contextKeyRef = useRef(contextKey);
  const syncStateKeyRef = useRef(syncStateKey);
  const [expandedBlocks, setExpandedBlocks] = useState<CollapseExpansionState>(() => (
    cloneCollapseExpansionState(resolvedExpandedBlocks)
  ));

  useLayoutEffect(() => {
    if (contextKeyRef.current === contextKey && syncStateKeyRef.current === syncStateKey) return;
    contextKeyRef.current = contextKey;
    syncStateKeyRef.current = syncStateKey;
    setExpandedBlocks(cloneCollapseExpansionState(resolvedExpandedBlocks));
  }, [contextKey, resolvedExpandedBlocks, syncStateKey]);

  return {
    expandedBlocks,
    setExpandedBlocks,
    isContextSettled: contextKeyRef.current === contextKey,
  };
}
