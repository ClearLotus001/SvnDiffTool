export interface WorkbookCanvasRunGroup {
  key: string;
  height: number;
  top?: number;
}

export interface WorkbookCanvasRun<TGroup extends WorkbookCanvasRunGroup> {
  key: string;
  groups: TGroup[];
  top: number;
  height: number;
}

export function buildWorkbookCanvasRuns<TGroup extends WorkbookCanvasRunGroup>(
  groups: readonly TGroup[],
  options: {
    maxRunHeight: number;
    keyPrefix: string;
  },
): WorkbookCanvasRun<TGroup>[] {
  const maxRunHeight = Math.max(1, options.maxRunHeight);
  const runs: WorkbookCanvasRun<TGroup>[] = [];
  let currentGroups: TGroup[] = [];
  let currentTop = 0;
  let currentHeight = 0;
  let nextTop = 0;

  const flush = () => {
    if (currentGroups.length === 0) return;
    const firstKey = currentGroups[0]?.key ?? 'start';
    const lastKey = currentGroups[currentGroups.length - 1]?.key ?? firstKey;
    runs.push({
      key: `${options.keyPrefix}:${firstKey}:${lastKey}:${currentTop}:${currentHeight}`,
      groups: currentGroups,
      top: currentTop,
      height: currentHeight,
    });
    currentGroups = [];
    currentHeight = 0;
  };

  groups.forEach((group) => {
    const groupHeight = Math.max(0, group.height);
    const groupTop = group.top ?? nextTop;
    const isContiguous = currentGroups.length === 0
      || groupTop === currentTop + currentHeight;
    const shouldStartNextRun = currentGroups.length > 0
      && (!isContiguous || currentHeight + groupHeight > maxRunHeight);
    if (shouldStartNextRun) flush();
    if (currentGroups.length === 0) currentTop = groupTop;
    currentGroups.push(group);
    currentHeight += groupHeight;
    nextTop = groupTop + groupHeight;
  });

  flush();
  return runs;
}
