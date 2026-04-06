import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';

import type { DiffLine } from '@/types';
import { copyText } from '@/utils/app/clipboard';
import {
  buildSelectAllLogicalTextSelection,
  buildLogicalTextSelectionCopyText,
  expandLogicalTextSelectionToWord,
  getLogicalTextSelectionRangeForLine,
  isLogicalTextPointWithinSelection,
  isLogicalTextSelectionCollapsed,
  moveLogicalTextSelectionPoint,
  resolveLogicalTextLineContentForSide,
  type LogicalTextSelection,
  type LogicalTextSelectionMode,
  type LogicalTextSelectionPoint,
  type LogicalTextSelectionRange,
  type LogicalTextSelectionSide,
} from '@/utils/diff/logicalTextSelection';
import { resolveLogicalTextSelectionPointFromClientPoint } from '@/utils/diff/logicalTextSelectionDom';

interface DragState {
  anchorPoint: LogicalTextSelectionPoint;
  pointerId: number;
  startX: number;
  startY: number;
  didDrag: boolean;
  keepSelectionOnClick: boolean;
}

interface UseLogicalTextSelectionStateParams {
  enabled: boolean;
  hostRef: RefObject<HTMLElement | null>;
  diffLines: readonly DiffLine[];
  copyMode: LogicalTextSelectionMode;
  onSelectionIntent?: (() => void) | undefined;
}

interface UseLogicalTextSelectionStateResult {
  textSelection: LogicalTextSelection | null;
  textSelectionCopyText: string | null;
  clearTextSelection: () => void;
  getTextSelectionRangeForLine: (
    lineIdx: number,
    side: LogicalTextSelectionSide,
    textLength: number,
  ) => LogicalTextSelectionRange | null;
}

function isInteractiveElement(target: Element | null) {
  return Boolean(target?.closest('button, [role="button"], a[href], input, select, textarea, [contenteditable="true"]'));
}

function isEditableActiveElement() {
  const active = document.activeElement;
  return active instanceof HTMLElement
    && (active.matches('input, textarea, select') || active.isContentEditable);
}

export function useLogicalTextSelectionState({
  enabled,
  hostRef,
  diffLines,
  copyMode,
  onSelectionIntent,
}: UseLogicalTextSelectionStateParams): UseLogicalTextSelectionStateResult {
  const [textSelection, setTextSelection] = useState<LogicalTextSelection | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const lastInteractionInHostRef = useRef(false);
  const lastResolvedPointRef = useRef<LogicalTextSelectionPoint | null>(null);
  const textSelectionRef = useRef<LogicalTextSelection | null>(null);
  const onSelectionIntentRef = useRef(onSelectionIntent);

  const clearTextSelection = useCallback(() => {
    setTextSelection(null);
  }, []);

  useEffect(() => {
    textSelectionRef.current = textSelection;
  }, [textSelection]);

  useEffect(() => {
    onSelectionIntentRef.current = onSelectionIntent;
  }, [onSelectionIntent]);

  const textSelectionCopyText = useMemo(() => {
    if (!textSelection || isLogicalTextSelectionCollapsed(textSelection)) return null;
    const next = buildLogicalTextSelectionCopyText(diffLines, textSelection, copyMode);
    return next || null;
  }, [copyMode, diffLines, textSelection]);

  const getTextSelectionRangeForLine = useCallback((
    lineIdx: number,
    side: LogicalTextSelectionSide,
    textLength: number,
  ) => getLogicalTextSelectionRangeForLine(textSelection, lineIdx, side, textLength), [textSelection]);

  useEffect(() => {
    if (!enabled) {
      setTextSelection(null);
    }
  }, [enabled]);

  useEffect(() => {
    setTextSelection(null);
  }, [diffLines]);

  useEffect(() => {
    if (!enabled) return undefined;
    const host = hostRef.current;
    if (!host) return undefined;

    const clearDragState = (pointerId?: number) => {
      const dragState = dragStateRef.current;
      if (!dragState) return;
      if (pointerId != null && dragState.pointerId !== pointerId) return;
      dragStateRef.current = null;
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const target = event.target instanceof Element ? event.target : null;
      if (isInteractiveElement(target)) {
        lastInteractionInHostRef.current = host.contains(target);
        return;
      }

      const resolvedAnchorPoint = resolveLogicalTextSelectionPointFromClientPoint(host, event.clientX, event.clientY, null);
      const currentTextSelection = textSelectionRef.current;
      if (!resolvedAnchorPoint) {
        if (currentTextSelection) clearTextSelection();
        return;
      }

      lastInteractionInHostRef.current = true;
      lastResolvedPointRef.current = resolvedAnchorPoint;
      const clickedTextContent = Boolean(target?.closest('[data-selectable-text-content="true"]'));
      const shouldExtendExistingSelection = event.shiftKey && currentTextSelection && !isLogicalTextSelectionCollapsed(currentTextSelection);
      const anchorPoint = shouldExtendExistingSelection ? currentTextSelection.anchor : resolvedAnchorPoint;
      const keepSelectionOnClick = shouldExtendExistingSelection
        || (clickedTextContent && isLogicalTextPointWithinSelection(currentTextSelection, anchorPoint));

      if (clickedTextContent && event.detail >= 3) {
        const line = diffLines[anchorPoint.lineIdx];
        const content = line ? resolveLogicalTextLineContentForSide(line, anchorPoint.side) ?? '' : '';
        onSelectionIntentRef.current?.();
        setTextSelection({
          anchor: { ...anchorPoint, column: 0 },
          focus: { ...anchorPoint, column: content.length },
        });
        lastResolvedPointRef.current = { ...anchorPoint, column: content.length };
        dragStateRef.current = null;
        event.preventDefault();
        return;
      }

      if (clickedTextContent && event.detail === 2) {
        const line = diffLines[anchorPoint.lineIdx];
        const content = line ? resolveLogicalTextLineContentForSide(line, anchorPoint.side) ?? '' : '';
        const wordRange = expandLogicalTextSelectionToWord(content, anchorPoint.column);
        onSelectionIntentRef.current?.();
        setTextSelection({
          anchor: { ...anchorPoint, column: wordRange.start },
          focus: { ...anchorPoint, column: wordRange.end },
        });
        lastResolvedPointRef.current = { ...anchorPoint, column: wordRange.end };
        dragStateRef.current = null;
        event.preventDefault();
        return;
      }

      if (shouldExtendExistingSelection) {
        onSelectionIntentRef.current?.();
        setTextSelection({
          anchor: currentTextSelection.anchor,
          focus: resolvedAnchorPoint,
        });
        lastResolvedPointRef.current = resolvedAnchorPoint;
      }

      dragStateRef.current = {
        anchorPoint,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        didDrag: false,
        keepSelectionOnClick,
      };
      event.preventDefault();
    };

    const handlePointerMove = (event: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) return;
      if ((event.buttons & 1) !== 1) return;

      const distance = Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY);
      if (!dragState.didDrag && distance < 3) return;

      const focusPoint = resolveLogicalTextSelectionPointFromClientPoint(
        host,
        event.clientX,
        event.clientY,
        dragState.anchorPoint,
      ) ?? dragState.anchorPoint;

      if (!dragState.didDrag) {
        onSelectionIntentRef.current?.();
      }
      dragState.didDrag = true;
      dragStateRef.current = dragState;
      lastResolvedPointRef.current = focusPoint;
      setTextSelection({
        anchor: dragState.anchorPoint,
        focus: focusPoint,
      });
      event.preventDefault();
    };

    const handlePointerUp = (event: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) return;

      if (!dragState.didDrag && !dragState.keepSelectionOnClick) {
        clearTextSelection();
      }
      clearDragState(event.pointerId);
    };

    const handlePointerCancel = (event: PointerEvent) => {
      clearDragState(event.pointerId);
    };

    const handleDocumentPointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Node ? event.target : null;
      if (!target || !host.contains(target)) {
        lastInteractionInHostRef.current = false;
      }
    };

    const handleDragStart = (event: DragEvent) => {
      const target = event.target instanceof Node ? event.target : null;
      if (target && host.contains(target)) {
        event.preventDefault();
      }
    };

    host.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
    document.addEventListener('pointercancel', handlePointerCancel);
    document.addEventListener('pointerdown', handleDocumentPointerDown, true);
    document.addEventListener('dragstart', handleDragStart, true);

    return () => {
      host.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
      document.removeEventListener('pointercancel', handlePointerCancel);
      document.removeEventListener('pointerdown', handleDocumentPointerDown, true);
      document.removeEventListener('dragstart', handleDragStart, true);
      dragStateRef.current = null;
    };
  }, [clearTextSelection, diffLines, enabled, hostRef]);

  useEffect(() => {
    if (!enabled) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!lastInteractionInHostRef.current) return;
      if (isEditableActiveElement()) return;
      if (!event.ctrlKey && !event.metaKey && event.shiftKey && !event.altKey && (
        event.key === 'ArrowLeft'
        || event.key === 'ArrowRight'
        || event.key === 'ArrowUp'
        || event.key === 'ArrowDown'
      )) {
        const focusPoint = textSelection?.focus ?? lastResolvedPointRef.current;
        if (!focusPoint) return;

        const directionMap = {
          ArrowLeft: 'left',
          ArrowRight: 'right',
          ArrowUp: 'up',
          ArrowDown: 'down',
        } as const;
        const direction = directionMap[event.key as keyof typeof directionMap];
        const nextFocus = moveLogicalTextSelectionPoint(diffLines, focusPoint, direction);
        if (!nextFocus) return;

        const currentTextSelection = textSelectionRef.current;
        const anchorPoint = currentTextSelection?.anchor ?? focusPoint;
        onSelectionIntentRef.current?.();
        lastResolvedPointRef.current = nextFocus;
        setTextSelection({
          anchor: anchorPoint,
          focus: nextFocus,
        });
        event.preventDefault();
        return;
      }
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      if (event.key.toLowerCase() === 'a') {
        const nextSelection = buildSelectAllLogicalTextSelection(diffLines, copyMode);
        if (!nextSelection) return;

        event.preventDefault();
        onSelectionIntentRef.current?.();
        lastResolvedPointRef.current = nextSelection.focus;
        setTextSelection(nextSelection);
        return;
      }
      if (event.key.toLowerCase() !== 'c') return;
      if (!textSelectionCopyText) return;

      event.preventDefault();
      void copyText(textSelectionCopyText);
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [copyMode, diffLines, enabled, onSelectionIntent, textSelection, textSelectionCopyText]);

  return {
    textSelection,
    textSelectionCopyText,
    clearTextSelection,
    getTextSelectionRangeForLine,
  };
}
