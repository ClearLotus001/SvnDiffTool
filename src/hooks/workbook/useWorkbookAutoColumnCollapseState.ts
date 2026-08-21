import { useCallback, useEffect, useMemo, useState } from 'react';

export function useWorkbookAutoColumnCollapseState(
  collapseEnabled: boolean,
  activeSheetName: string | null,
) {
  const [revealedColumnsBySheet, setRevealedColumnsBySheet] = useState<Record<string, number[]>>({});

  useEffect(() => {
    if (collapseEnabled) return;
    setRevealedColumnsBySheet({});
  }, [collapseEnabled]);

  const revealedColumns = useMemo(
    () => activeSheetName ? (revealedColumnsBySheet[activeSheetName] ?? []) : [],
    [activeSheetName, revealedColumnsBySheet],
  );

  const revealColumns = useCallback((sheetName: string, columns: number[]) => {
    if (columns.length === 0) return;
    setRevealedColumnsBySheet((previous) => {
      const current = previous[sheetName] ?? [];
      const next = [...new Set([...current, ...columns])].sort((left, right) => left - right);
      if (next.length === current.length && next.every((column, index) => column === current[index])) {
        return previous;
      }
      return {
        ...previous,
        [sheetName]: next,
      };
    });
  }, []);

  return {
    revealedColumns,
    revealColumns,
  };
}
