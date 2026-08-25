import { startTransition, useEffect, useRef, type MutableRefObject } from 'react';

import type { WorkbookMoveDirection, WorkbookSelectedCell } from '@/types';
import type { DialogController } from '@/hooks/app/contracts';
import { useAppStore } from '@/store/appStore';

interface UseAppKeyboardShortcutsArgs {
  dialogs: DialogController;
  isWorkbookMode: boolean;
  hunkNavigationEnabled: boolean;
  selectedCell: WorkbookSelectedCell | null;
  handleNavigationStep: (direction: -1 | 1) => void;
  handleSearchPreviewNav: (dir: 1 | -1) => void;
  handleSearchNav: (dir: 1 | -1) => void;
  workbookMoveRef: MutableRefObject<((direction: WorkbookMoveDirection) => void) | null>;
  collapseNavigationRef: MutableRefObject<((direction: 'prev' | 'next') => void) | null>;
}

interface AppShortcutKeyLike {
  key: string;
  code?: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}

export function shouldSuppressAppShortcutForModal(event: AppShortcutKeyLike): boolean {
  if (event.key === 'F1' || event.key === 'F3' || event.key === 'F7') return true;
  if ((event.ctrlKey || event.metaKey) && ['f', 'g', '[', ']', '\\'].includes(event.key)) return true;
  return Boolean(
    event.altKey
    && (event.code === 'BracketLeft' || event.code === 'BracketRight'),
  );
}

function isEditableTarget(target: EventTarget | null) {
  const el = target instanceof HTMLElement ? target : null;
  if (!el) return false;
  return el.isContentEditable || Boolean(el.closest(
    'input, textarea, select, [contenteditable="true"], [data-app-shortcuts="local"]',
  ));
}

export default function useAppKeyboardShortcuts({
  dialogs,
  isWorkbookMode,
  hunkNavigationEnabled,
  selectedCell,
  handleNavigationStep,
  handleSearchPreviewNav,
  handleSearchNav,
  workbookMoveRef,
  collapseNavigationRef,
}: UseAppKeyboardShortcutsArgs) {
  // ── Read setters directly from Zustand store ──────────────────────────
  const setShowWhitespace = useAppStore((s) => s.setShowWhitespace);
  const setFontSize = useAppStore((s) => s.setFontSize);
  const setWorkbookContextMenu = useAppStore((s) => s.setWorkbookContextMenu);
  const showOnlyDifferences = useAppStore((s) => s.showOnlyDifferences);
  const diffTypeFilter = useAppStore((s) => s.diffTypeFilter);
  const canGotoLine = !(
    isWorkbookMode && (showOnlyDifferences || diffTypeFilter !== 'all')
  );

  const { state: dialogState, actions: dialogActions } = dialogs;
  const {
    showSearch,
    showGoto,
    showHelp,
    showAbout,
    showSvnConfig,
    showLocalFileCompare,
  } = dialogState;
  const hasBlockingModal = showGoto
    || showHelp
    || showAbout
    || showSvnConfig
    || showLocalFileCompare;
  const showSearchRef = useRef(showSearch);

  useEffect(() => {
    showSearchRef.current = showSearch;
  }, [showSearch]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        dialogActions.closeAll();
        setWorkbookContextMenu(null);
        return;
      }
      if (hasBlockingModal) {
        if (shouldSuppressAppShortcutForModal(e)) e.preventDefault();
        return;
      }
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
        if (hunkNavigationEnabled) {
          startTransition(() => handleNavigationStep(e.shiftKey ? -1 : 1));
        }
        return;
      }
      if (e.key === 'f' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        dialogActions.toggle('search');
        return;
      }
      if (e.key === 'g' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (canGotoLine) dialogActions.toggle('goto');
        return;
      }
      if (e.key === 'F1') {
        e.preventDefault();
        dialogActions.toggle('help');
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
    canGotoLine,
    collapseNavigationRef,
    handleNavigationStep,
    handleSearchPreviewNav,
    handleSearchNav,
    hasBlockingModal,
    hunkNavigationEnabled,
    isWorkbookMode,
    selectedCell,
    dialogActions,
    setFontSize,
    setShowWhitespace,
    setWorkbookContextMenu,
    showGoto,
    showHelp,
    workbookMoveRef,
  ]);
}
