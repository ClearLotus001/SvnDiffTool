import {
  useCallback,
  useMemo,
  useState,
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
} from 'react';

import {
  normalizeLineRangeSelection,
  type LineRangeSelection,
  updateLineRangeSelection,
} from '@/utils/diff/lineRangeSelection';

interface UseTextLineRangeSelectionStateParams {
  onFoldRange: (startLineIdx: number, endLineIdx: number) => void;
}

interface UseTextLineRangeSelectionStateResult {
  lineRangeSelection: LineRangeSelection | null;
  setLineRangeSelection: Dispatch<SetStateAction<LineRangeSelection | null>>;
  normalizedLineRangeSelection: ReturnType<typeof normalizeLineRangeSelection> | null;
  selectedLineCount: number;
  selectedLineRangeLabel: string | null;
  handleLineNumberSelection: (lineIdx: number, extend: boolean) => void;
  clearLineRangeSelection: () => void;
  handleFoldSelectedRange: () => void;
  handleClearSelectedRange: () => void;
  handleBlankAreaPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
}

const LINE_RANGE_SEPARATOR = '\u2013';

export function useTextLineRangeSelectionState({
  onFoldRange,
}: UseTextLineRangeSelectionStateParams): UseTextLineRangeSelectionStateResult {
  const [lineRangeSelection, setLineRangeSelection] = useState<LineRangeSelection | null>(null);

  const normalizedLineRangeSelection = useMemo(
    () => (lineRangeSelection ? normalizeLineRangeSelection(lineRangeSelection) : null),
    [lineRangeSelection],
  );

  const selectedLineCount = normalizedLineRangeSelection
    ? normalizedLineRangeSelection.endLineIdx - normalizedLineRangeSelection.startLineIdx + 1
    : 0;

  const selectedLineRangeLabel = normalizedLineRangeSelection
    ? normalizedLineRangeSelection.startLineIdx === normalizedLineRangeSelection.endLineIdx
      ? `${normalizedLineRangeSelection.startLineIdx + 1}`
      : `${normalizedLineRangeSelection.startLineIdx + 1}${LINE_RANGE_SEPARATOR}${normalizedLineRangeSelection.endLineIdx + 1}`
    : null;

  const handleLineNumberSelection = useCallback((lineIdx: number, extend: boolean) => {
    setLineRangeSelection((current) => updateLineRangeSelection(current, lineIdx, extend));
  }, []);

  const clearLineRangeSelection = useCallback(() => {
    setLineRangeSelection(null);
  }, []);

  const handleFoldSelectedRange = useCallback(() => {
    if (!normalizedLineRangeSelection) return;
    onFoldRange(
      normalizedLineRangeSelection.startLineIdx,
      normalizedLineRangeSelection.endLineIdx,
    );
    clearLineRangeSelection();
  }, [clearLineRangeSelection, normalizedLineRangeSelection, onFoldRange]);

  const handleClearSelectedRange = useCallback(() => {
    clearLineRangeSelection();
  }, [clearLineRangeSelection]);

  const handleBlankAreaPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (!lineRangeSelection || event.button !== 0) return;
    if (event.target !== event.currentTarget) return;
    clearLineRangeSelection();
  }, [clearLineRangeSelection, lineRangeSelection]);

  return {
    lineRangeSelection,
    setLineRangeSelection,
    normalizedLineRangeSelection,
    selectedLineCount,
    selectedLineRangeLabel,
    handleLineNumberSelection,
    clearLineRangeSelection,
    handleFoldSelectedRange,
    handleClearSelectedRange,
    handleBlankAreaPointerDown,
  };
}
