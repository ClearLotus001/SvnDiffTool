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

interface UseTextSelectionContextMenuResult {
  contextMenuPoint: DiffContextMenuPoint | null;
  contextMenuSections: DiffContextMenuSection[];
  closeContextMenu: () => void;
  openTextSelectionContextMenu: (
    event: ReactMouseEvent<HTMLElement>,
    textSelectionCopyText: string | null | undefined,
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

  const openTextSelectionContextMenu = useCallback((
    event: ReactMouseEvent<HTMLElement>,
    textSelectionCopyText: string | null | undefined,
  ) => {
    if (!textSelectionCopyText) return false;
    event.preventDefault();
    setContextMenuPoint({ x: event.clientX, y: event.clientY });
    setContextMenuSections([{
      items: [{
        id: 'copy-selected-text',
        label: t('diffContextCopySelectedText'),
        shortcut: copyShortcutLabel,
        onSelect: () => { void copyText(textSelectionCopyText); },
      }],
    }]);
    return true;
  }, [copyShortcutLabel, t]);

  const openLineSelectionContextMenu = useCallback((
    event: ReactMouseEvent<HTMLElement>,
    sideMode: TextSelectionContextMenuSideMode,
  ) => {
    if (!normalizedLineRangeSelection) return false;

    const { startLineIdx, endLineIdx } = normalizedLineRangeSelection;
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
    baseVersionLabel,
    diffLines,
    mineVersionLabel,
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
