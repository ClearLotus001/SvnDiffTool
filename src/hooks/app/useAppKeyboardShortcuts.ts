import { useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';

import type { WorkbookMoveDirection, WorkbookSelectedCell } from '@/types';
import { cycleHunkIndex } from '@/hooks/app/helpers';
import type { WorkbookContextMenuState } from '@/hooks/app/types';
import type { DialogController } from '@/hooks/app/contracts';

interface UseAppKeyboardShortcutsArgs {
  dialogs: DialogController;
  isWorkbookMode: boolean;
  selectedCell: WorkbookSelectedCell | null;
  navigationCount: number;
  handleSearchNav: (dir: 1 | -1) => void;
  setHunkIdx: Dispatch<SetStateAction<number>>;
  setShowWhitespace: Dispatch<SetStateAction<boolean>>;
  setFontSize: Dispatch<SetStateAction<number>>;
  setWorkbookContextMenu: Dispatch<SetStateAction<WorkbookContextMenuState | null>>;
  workbookMoveRef: MutableRefObject<((direction: WorkbookMoveDirection) => void) | null>;
  collapseNavigationRef: MutableRefObject<((direction: 'prev' | 'next') => void) | null>;
}

function isEditableTarget(target: EventTarget | null) {
  const el = target instanceof HTMLElement ? target : null;
  if (!el) return false;
  return el.isContentEditable || Boolean(el.closest('input, textarea, select, [contenteditable="true"]'));
}

export default function useAppKeyboardShortcuts({
  dialogs,
  isWorkbookMode,
  selectedCell,
  navigationCount,
  handleSearchNav,
  setHunkIdx,
  setShowWhitespace,
  setFontSize,
  setWorkbookContextMenu,
  workbookMoveRef,
  collapseNavigationRef,
}: UseAppKeyboardShortcutsArgs) {
  const { state: dialogState, actions: dialogActions } = dialogs;
  const { showSearch, showGoto, showHelp } = dialogState;
  const showSearchRef = useRef(showSearch);

  useEffect(() => {
    showSearchRef.current = showSearch;
  }, [showSearch]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        isWorkbookMode
        && selectedCell
        && selectedCell.kind === 'cell'
        && !showGoto
        && !showHelp
        && !isEditableTarget(e.target)
        && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)
      ) {
        const directionMap: Record<string, WorkbookMoveDirection> = {
          ArrowUp: 'up',
          ArrowDown: 'down',
          ArrowLeft: 'left',
          ArrowRight: 'right',
        };
        const direction = directionMap[e.key];
        if (direction) {
          e.preventDefault();
          workbookMoveRef.current?.(direction);
          return;
        }
      }
      if (!showGoto && !showHelp && !isEditableTarget(e.target) && e.altKey && !e.ctrlKey && !e.metaKey) {
        if (e.code === 'BracketRight') {
          e.preventDefault();
          collapseNavigationRef.current?.('next');
          return;
        }
        if (e.code === 'BracketLeft') {
          e.preventDefault();
          collapseNavigationRef.current?.('prev');
          return;
        }
      }
      if (e.key === 'F7') {
        e.preventDefault();
        setHunkIdx((i) => cycleHunkIndex(i, navigationCount, e.shiftKey ? -1 : 1));
        return;
      }
      if (e.key === 'f' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        dialogActions.toggle('search');
        return;
      }
      if (e.key === 'g' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        dialogActions.toggle('goto');
        return;
      }
      if (e.key === 'F1') {
        e.preventDefault();
        dialogActions.toggle('help');
        return;
      }
      if (e.key === 'Escape') {
        dialogActions.closeAll();
        setWorkbookContextMenu(null);
        return;
      }
      if (showSearchRef.current && e.key === 'F3') {
        e.preventDefault();
        handleSearchNav(e.shiftKey ? -1 : 1);
        return;
      }
      if (e.ctrlKey && e.key === ']') {
        e.preventDefault();
        setFontSize((s) => Math.min(20, s + 1));
      }
      if (e.ctrlKey && e.key === '[') {
        e.preventDefault();
        setFontSize((s) => Math.max(10, s - 1));
      }
      if (e.ctrlKey && e.key === '\\') {
        e.preventDefault();
        setShowWhitespace((v) => !v);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [
    collapseNavigationRef,
    handleSearchNav,
    isWorkbookMode,
    navigationCount,
    selectedCell,
    dialogActions,
    setFontSize,
    setHunkIdx,
    setShowWhitespace,
    setWorkbookContextMenu,
    showGoto,
    showHelp,
    workbookMoveRef,
  ]);
}
