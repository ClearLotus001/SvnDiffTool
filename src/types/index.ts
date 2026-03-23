// ─────────────────────────────────────────────────────────────────────────────
// src/types/index.ts
// All shared TypeScript interfaces and types for SvnExcelDiffTool
// ─────────────────────────────────────────────────────────────────────────────

// ── Diff engine ──────────────────────────────────────────────────────────────

export type LineType = 'equal' | 'add' | 'delete';

/** A single character-level diff span */
export interface CharSpan {
  /** Whether this span is highlighted (changed) */
  highlight: boolean;
  /** The text content */
  text: string;
}

/** A single line in the computed diff result */
export interface DiffLine {
  type: LineType;
  /** Content from base file (null for pure-add lines) */
  base: string | null;
  /** Content from mine file (null for pure-delete lines) */
  mine: string | null;
  /** 1-based line number in base file */
  baseLineNo: number | null;
  /** 1-based line number in mine file */
  mineLineNo: number | null;
  /** Character-level diff spans for base side (only on paired delete lines) */
  baseCharSpans: CharSpan[] | null;
  /** Character-level diff spans for mine side (only on paired add lines) */
  mineCharSpans: CharSpan[] | null;
}

/** A contiguous block of changes */
export interface Hunk {
  /** Index of first DiffLine in this hunk */
  startIdx: number;
  /** Index of last DiffLine in this hunk (inclusive) */
  endIdx: number;
  addCount: number;
  delCount: number;
}

// ── Myers diff internal types ─────────────────────────────────────────────────

export type OpType = 'equal' | 'insert' | 'delete';
export interface DiffOp {
  type: OpType;
  text: string;
}

// ── Syntax tokenizer ─────────────────────────────────────────────────────────

export type TokenType = 'keyword' | 'string' | 'comment' | 'number' | 'punctuation' | 'plain';

export interface Token {
  type: TokenType;
  text: string;
}

// ── Virtual scroll ────────────────────────────────────────────────────────────

export interface VirtualState {
  totalH: number;
  startIdx: number;
  endIdx: number;
}

// ── Render items (what the virtual list renders) ─────────────────────────────

export interface LineItem {
  kind: 'line';
  line: DiffLine;
  /** index into diffLines array */
  lineIdx: number;
}

export interface CollapseItem {
  kind: 'collapse';
  /** number of hidden lines */
  count: number;
  blockId: string;
  /** first hidden DiffLine index */
  fromIdx: number;
  /** last hidden DiffLine index + 1 */
  toIdx: number;
}

export type RenderItem = LineItem | CollapseItem;

/** A split-view row pairs left and right lines */
export interface SplitRow {
  left: DiffLine | null;
  right: DiffLine | null;
  /** representative lineIdx for search/hunk logic */
  lineIdx: number;
  /** all underlying diff line indexes represented by this row */
  lineIdxs: number[];
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
  fromIdx: number;
  toIdx: number;
}

export type SplitRenderItem = SplitLineItem | SplitCollapseItem;

// ── Search ────────────────────────────────────────────────────────────────────

export interface SearchMatch {
  /** Index into diffLines */
  lineIdx: number;
  /** Character start offset in content */
  start: number;
  /** Character end offset in content */
  end: number;
}

export interface SearchState {
  query: string;
  isRegex: boolean;
  isCaseSensitive: boolean;
  matches: SearchMatch[];
  activeIdx: number;
}

// ── Layout ────────────────────────────────────────────────────────────────────

export type LayoutMode = 'unified' | 'split-h' | 'split-v';
export type WorkbookMoveDirection = 'up' | 'down' | 'left' | 'right';
export type WorkbookSelectionKind = 'cell' | 'row' | 'column';

export interface WorkbookSelectedCell {
  kind: WorkbookSelectionKind;
  sheetName: string;
  side: 'base' | 'mine';
  versionLabel: string;
  rowNumber: number;
  colIndex: number;
  colLabel: string;
  address: string;
  value: string;
  formula: string;
}

export interface WorkbookFreezeState {
  rowNumber?: number;
  colCount?: number;
}

// ── Theme ─────────────────────────────────────────────────────────────────────

export type ThemeKey = 'dark' | 'light' | 'hc';

export interface Theme {
  // backgrounds
  bg0: string; bg1: string; bg2: string; bg3: string; bg4: string;
  // borders
  border: string; border2: string;
  // text
  t0: string; t1: string; t2: string;
  // add
  addBg: string; addHl: string; addTx: string; addBrd: string;
  // delete
  delBg: string; delHl: string; delTx: string; delBrd: string;
  // change
  chgBg: string; chgTx: string;
  // accent
  acc: string; acc2: string;
  // syntax
  kw: string; str: string; num: string; cmt: string; punc: string;
  // line number gutter
  lnBg: string; lnTx: string;
  // minimap
  miniAdd: string; miniDel: string; miniVp: string;
  // search
  searchHl: string; searchActiveBg: string;
}

// ── File/diff metadata ────────────────────────────────────────────────────────

export interface DiffMeta {
  baseName: string;
  mineName: string;
  svnUrl: string;
  fileName: string;
}

export type SvnRevisionSourceKind = 'revision' | 'working-copy' | 'input-file';

export interface SvnRevisionInfo {
  id: string;
  revision: string;
  title: string;
  author: string;
  date: string;
  message: string;
  kind: SvnRevisionSourceKind;
 }

export interface DiffData extends DiffMeta {
  baseContent: string | null;
  mineContent: string | null;
  baseBytes: Uint8Array | null;
  mineBytes: Uint8Array | null;
  revisionOptions?: SvnRevisionInfo[] | null;
  baseRevisionInfo?: SvnRevisionInfo | null;
  mineRevisionInfo?: SvnRevisionInfo | null;
  canSwitchRevisions?: boolean;
  perf?: DiffPerformanceMetrics | null;
}

export interface WorkbookMetadataSource {
  baseName: string;
  mineName: string;
  fileName: string;
  baseBytes: Uint8Array | null;
  mineBytes: Uint8Array | null;
}

export interface DiffPerformanceMetrics {
  source: 'cli' | 'revision-switch' | 'local-dev' | 'demo';
  mainLoadMs?: number;
  baseReadMs?: number;
  mineReadMs?: number;
  baseParserMs?: number;
  mineParserMs?: number;
  baseBytes?: number;
  mineBytes?: number;
  textResolveMs?: number;
  metadataMs?: number;
  diffMs?: number;
  totalAppMs?: number;
  diffLineCount?: number;
}

export interface LocalDiffFilePickResult {
  path: string;
  name: string;
}

// ── Electron IPC bridge (window.svnDiff) ─────────────────────────────────────

export interface SvnDiffBridge {
  getDiffData(): Promise<DiffData>;
  loadRevisionDiff(baseRevisionId: string, mineRevisionId: string): Promise<DiffData>;
  isDevMode(): Promise<boolean>;
  pickDiffFile(): Promise<LocalDiffFilePickResult | null>;
  loadDevWorkingCopyDiff(filePath: string): Promise<DiffData>;
  loadLocalDiff(basePath: string, minePath: string): Promise<DiffData>;
  getTheme(): Promise<'dark' | 'light'>;
  writeClipboardText(text: string): void;
  windowMinimize(): void;
  windowMaximize(): void;
  windowClose(): void;
  openExternal(url: string): void;
}

declare global {
  interface Window {
    svnDiff?: SvnDiffBridge;
  }
}
