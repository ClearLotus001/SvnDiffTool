// ─────────────────────────────────────────────────────────────────────────────
// Render and viewport types
// ─────────────────────────────────────────────────────────────────────────────

import type { DiffLine } from '@/types/diff';
import type { WorkbookRowDelta } from '@/types/workbook';

export interface VirtualState {
  totalH: number;
  startIdx: number;
  endIdx: number;
}

export interface LineItem {
  kind: 'line';
  line: DiffLine;
  lineIdx: number;
}

export interface CollapseItem {
  kind: 'collapse';
  count: number;
  blockId: string;
  hiddenStart: number;
  hiddenEnd: number;
  expandStep: number;
  fromIdx: number;
  toIdx: number;
}

export type RenderItem = LineItem | CollapseItem;

export interface SplitRow {
  left: DiffLine | null;
  right: DiffLine | null;
  isReplacementPair?: boolean;
  lineIdx: number;
  lineIdxs: number[];
  workbookRowDelta?: WorkbookRowDelta;
}

export interface SplitLineItem {
  kind: 'split-line';
  row: SplitRow;
  lineIdx: number;
}

export interface SplitCollapseItem {
  kind: 'split-collapse';
  count: number;
  blockId: string;
  hiddenStart: number;
  hiddenEnd: number;
  expandStep: number;
  fromIdx: number;
  toIdx: number;
}

export type SplitRenderItem = SplitLineItem | SplitCollapseItem;

export type LayoutMode = 'unified' | 'split-h' | 'split-v';
