import type { WorkbookSection } from '@/types';

const WORKBOOK_COLUMN_CONTEXT = 1;
const WORKBOOK_SHEET_CONTEXT = 1;

export interface WorkbookCollapsedSheetTabItem {
  kind: 'collapse';
  key: string;
  startIndex: number;
  endIndex: number;
  count: number;
}

export interface WorkbookVisibleSheetTabItem {
  kind: 'sheet';
  index: number;
  section: WorkbookSection;
}

export type WorkbookSheetTabItem = WorkbookCollapsedSheetTabItem | WorkbookVisibleSheetTabItem;

function appendCollapsedColumnRun(
  run: number[],
  collapsed: number[],
  contextColumns: number,
) {
  if (run.length <= contextColumns * 2) return;
  collapsed.push(...run.slice(contextColumns, run.length - contextColumns));
}

export function buildWorkbookAutoCollapsedColumns(
  columns: readonly number[],
  protectedColumns: ReadonlySet<number>,
  contextColumns = WORKBOOK_COLUMN_CONTEXT,
): number[] {
  const collapsed: number[] = [];
  let run: number[] = [];

  const flush = () => {
    appendCollapsedColumnRun(run, collapsed, Math.max(0, contextColumns));
    run = [];
  };

  columns.forEach((column) => {
    if (protectedColumns.has(column)) {
      flush();
      return;
    }
    run.push(column);
  });
  flush();
  return collapsed;
}

function buildCollapsedSheetKey(
  sections: readonly WorkbookSection[],
  startIndex: number,
  endIndex: number,
): string {
  const first = sections[startIndex];
  const last = sections[endIndex];
  return [
    'sheet-collapse',
    startIndex,
    first?.name ?? '',
    first?.startLineIdx ?? '',
    endIndex,
    last?.name ?? '',
    last?.endLineIdx ?? '',
  ].join(':');
}

export function buildWorkbookSheetTabItems(
  sections: readonly WorkbookSection[],
  options: {
    collapseUnchanged: boolean;
    activeIndex: number;
    modifiedSheetNames: ReadonlySet<string>;
    expandedCollapseKeys?: ReadonlySet<string>;
    contextSheets?: number;
  },
): WorkbookSheetTabItem[] {
  const asVisibleItem = (section: WorkbookSection, index: number): WorkbookVisibleSheetTabItem => ({
    kind: 'sheet',
    index,
    section,
  });
  if (!options.collapseUnchanged) return sections.map(asVisibleItem);

  const contextSheets = Math.max(0, options.contextSheets ?? WORKBOOK_SHEET_CONTEXT);
  const expandedKeys = options.expandedCollapseKeys ?? new Set<string>();
  const isUnchanged = (section: WorkbookSection) => (
    section.changeType === 'equal' && !options.modifiedSheetNames.has(section.name)
  );
  const items: WorkbookSheetTabItem[] = [];
  let index = 0;

  while (index < sections.length) {
    const section = sections[index]!;
    if (!isUnchanged(section)) {
      items.push(asVisibleItem(section, index));
      index += 1;
      continue;
    }

    const runStart = index;
    while (index < sections.length && isUnchanged(sections[index]!)) index += 1;
    const runEnd = index - 1;
    const visibleIndexes = new Set<number>();
    for (let offset = 0; offset < contextSheets; offset += 1) {
      if (runStart + offset <= runEnd) visibleIndexes.add(runStart + offset);
      if (runEnd - offset >= runStart) visibleIndexes.add(runEnd - offset);
    }
    if (options.activeIndex >= runStart && options.activeIndex <= runEnd) {
      visibleIndexes.add(options.activeIndex);
    }

    let cursor = runStart;
    while (cursor <= runEnd) {
      if (visibleIndexes.has(cursor)) {
        items.push(asVisibleItem(sections[cursor]!, cursor));
        cursor += 1;
        continue;
      }

      const hiddenStart = cursor;
      while (cursor <= runEnd && !visibleIndexes.has(cursor)) cursor += 1;
      const hiddenEnd = cursor - 1;
      const key = buildCollapsedSheetKey(sections, hiddenStart, hiddenEnd);
      if (expandedKeys.has(key)) {
        for (let sheetIndex = hiddenStart; sheetIndex <= hiddenEnd; sheetIndex += 1) {
          items.push(asVisibleItem(sections[sheetIndex]!, sheetIndex));
        }
      } else {
        items.push({
          kind: 'collapse',
          key,
          startIndex: hiddenStart,
          endIndex: hiddenEnd,
          count: hiddenEnd - hiddenStart + 1,
        });
      }
    }
  }

  return items;
}
