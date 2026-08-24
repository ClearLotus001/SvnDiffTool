import { useCallback, useState, type MouseEvent as ReactMouseEvent } from 'react';

import type { DiffLine } from '@/types';
import { useI18n } from '@/context/i18n';
import { copyText } from '@/utils/app/clipboard';
import type { NormalizedLineRangeSelection } from '@/utils/diff/lineRangeSelection';
import {
  buildVersionRangeCopyText,
  hasVersionContentInRange,
} from '@/utils/diff/textCopy';
import type {
  DiffContextMenuPoint,
  DiffContextMenuSection,
} from '@/components/diff/DiffContextMenu';

export type TextSelectionContextMenuSideMode = 'base' | 'mine' | 'both';

function resolveCopyShortcutLabel() {
  if (typeof navigator === 'undefined') return 'Ctrl+C';
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform) ? '⌘C' : 'Ctrl+C';
}

interface UseTextSelectionContextMenuParams {
  diffLines: readonly DiffLine[];
  normalizedLineRangeSelection: NormalizedLineRangeSelection | null;
  selectedLineCount: number;
  baseVersionLabel?: string;
  mineVersionLabel?: string;
  onFoldSelectedRange: () => void;
  onClearSelectedRange: () => void;
}

interface TextSelectionContextMenuRequest {
  copyText: string | null | undefined;
  startLineIdx: number;
  endLineIdx: number;
  sideMode: TextSelectionContextMenuSideMode;
  onFoldSelectedRange: () => void;
  onClearSelectedRange: () => void;
}

interface UseTextSelectionContextMenuResult {
  contextMenuPoint: DiffContextMenuPoint | null;
  contextMenuSections: DiffContextMenuSection[];
  closeContextMenu: () => void;
  openTextSelectionContextMenu: (
    event: ReactMouseEvent<HTMLElement>,
    request: TextSelectionContextMenuRequest,
  ) => boolean;
  openLineSelectionContextMenu: (
    event: ReactMouseEvent<HTMLElement>,
    sideMode: TextSelectionContextMenuSideMode,
  ) => boolean;
}

export function useTextSelectionContextMenu({
  diffLines,
  normalizedLineRangeSelection,
  selectedLineCount,
  baseVersionLabel = '',
  mineVersionLabel = '',
  onFoldSelectedRange,
  onClearSelectedRange,
}: UseTextSelectionContextMenuParams): UseTextSelectionContextMenuResult {
  const { t } = useI18n();
  const copyShortcutLabel = resolveCopyShortcutLabel();
  const [contextMenuPoint, setContextMenuPoint] = useState<DiffContextMenuPoint | null>(null);
  const [contextMenuSections, setContextMenuSections] = useState<DiffContextMenuSection[]>([]);

  const closeContextMenu = useCallback(() => {
    setContextMenuPoint(null);
    setContextMenuSections([]);
  }, []);

  const buildVersionLineCopyItems = useCallback((
    sideMode: TextSelectionContextMenuSideMode,
    startLineIdx: number,
    endLineIdx: number,
  ) => {
    const items: DiffContextMenuSection['items'] = [];
    const canCopyBase = hasVersionContentInRange(diffLines, 'base', startLineIdx, endLineIdx);
    const canCopyMine = hasVersionContentInRange(diffLines, 'mine', startLineIdx, endLineIdx);

    if (sideMode === 'base' || sideMode === 'both') {
      items.push({
        id: 'copy-base-lines',
        label: t('diffContextCopyVersionLines', { version: baseVersionLabel || t('copySideBaseShort') }),
        disabled: !canCopyBase,
        onSelect: () => { void copyText(buildVersionRangeCopyText(diffLines, 'base', startLineIdx, endLineIdx)); },
      });
    }
    if (sideMode === 'mine' || sideMode === 'both') {
      items.push({
        id: 'copy-mine-lines',
        label: t('diffContextCopyVersionLines', { version: mineVersionLabel || t('copySideMineShort') }),
        disabled: !canCopyMine,
        onSelect: () => { void copyText(buildVersionRangeCopyText(diffLines, 'mine', startLineIdx, endLineIdx)); },
      });
    }

    return items;
  }, [baseVersionLabel, diffLines, mineVersionLabel, t]);

  const openTextSelectionContextMenu = useCallback((
    event: ReactMouseEvent<HTMLElement>,
    request: TextSelectionContextMenuRequest,
  ) => {
    const selectedText = request.copyText;
    if (!selectedText) return false;
    const items: DiffContextMenuSection['items'] = [{
      id: 'copy-selected-text',
      label: t('diffContextCopySelectedText'),
      shortcut: copyShortcutLabel,
      onSelect: () => { void copyText(selectedText); },
    }];
    items.push(
      ...buildVersionLineCopyItems(request.sideMode, request.startLineIdx, request.endLineIdx),
      {
        id: 'fold-selected-lines',
        label: t('diffContextFoldSelectedLines'),
        onSelect: request.onFoldSelectedRange,
      },
      {
        id: 'clear-selected-text',
        label: t('diffContextClearTextSelection'),
        onSelect: request.onClearSelectedRange,
      },
    );

    event.preventDefault();
    setContextMenuPoint({ x: event.clientX, y: event.clientY });
    setContextMenuSections([{
      title: t('manualSelectionBarLines', {
        count: request.endLineIdx - request.startLineIdx + 1,
      }),
      items,
    }]);
    return true;
  }, [buildVersionLineCopyItems, copyShortcutLabel, t]);

  const openLineSelectionContextMenu = useCallback((
    event: ReactMouseEvent<HTMLElement>,
    sideMode: TextSelectionContextMenuSideMode,
  ) => {
    if (!normalizedLineRangeSelection) return false;

    const { startLineIdx, endLineIdx } = normalizedLineRangeSelection;
    const items = buildVersionLineCopyItems(sideMode, startLineIdx, endLineIdx);

    items.push(
      {
        id: 'fold-selected-lines',
        label: t('diffContextFoldSelectedLines'),
        onSelect: onFoldSelectedRange,
      },
      {
        id: 'clear-selected-lines',
        label: t('diffContextClearSelectedLines'),
        onSelect: onClearSelectedRange,
      },
    );

    event.preventDefault();
    setContextMenuPoint({ x: event.clientX, y: event.clientY });
    setContextMenuSections([{
      title: t('manualSelectionBarLines', { count: selectedLineCount }),
      items,
    }]);
    return true;
  }, [
    buildVersionLineCopyItems,
    normalizedLineRangeSelection,
    onClearSelectedRange,
    onFoldSelectedRange,
    selectedLineCount,
    t,
  ]);

  return {
    contextMenuPoint,
    contextMenuSections,
    closeContextMenu,
    openTextSelectionContextMenu,
    openLineSelectionContextMenu,
  };
}
