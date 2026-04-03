import { startTransition, useEffect, useRef, type MutableRefObject } from 'react';

import type { WorkbookMoveDirection, WorkbookSelectedCell } from '@/types';
import { cycleHunkIndex } from '@/hooks/app/helpers';
import type { DialogController } from '@/hooks/app/contracts';
import { useAppStore } from '@/store/appStore';

interface UseAppKeyboardShortcutsArgs {
  dialogs: DialogController;
  isWorkbookMode: boolean;
  selectedCell: WorkbookSelectedCell | null;
  navigationCount: number;
  handleSearchPreviewNav: (dir: 1 | -1) => void;
  handleSearchNav: (dir: 1 | -1) => void;
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
  handleSearchPreviewNav,
  handleSearchNav,
  workbookMoveRef,
  collapseNavigationRef,
}: UseAppKeyboardShortcutsArgs) {
  // ── Read setters directly from Zustand store ──────────────────────────
  const setHunkIdx = useAppStore((s) => s.setHunkIdx);
  const setShowWhitespace = useAppStore((s) => s.setShowWhitespace);
  const setFontSize = useAppStore((s) => s.setFontSize);
  const setWorkbookContextMenu = useAppStore((s) => s.setWorkbookContextMenu);

  const { state: dialogState, actions: dialogActions } = dialogs;
  const { showSearch, showGoto, showHelp } = dialogState;
  const showSearchRef = useRef(showSearch);

  useEffect(() => {
    showSearchRef.current = showSearch;
  }, [showSearch]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        showSearchRef.current
        && !showGoto
        && !showHelp
        && !isEditableTarget(e.target)
        && (e.key === 'ArrowUp' || e.key === 'ArrowDown')
      ) {
        e.preventDefault();
        handleSearchPreviewNav(e.key === 'ArrowUp' ? -1 : 1);
        return;
      }
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
        startTransition(() => {
          setHunkIdx((i) => cycleHunkIndex(i, navigationCount, e.shiftKey ? -1 : 1));
        });
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
    handleSearchPreviewNav,
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
