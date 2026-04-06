// ─────────────────────────────────────────────────────────────────────────────
// Diff and text-processing types
// ─────────────────────────────────────────────────────────────────────────────

export type LineType = 'equal' | 'add' | 'delete';

export interface CharSpan {
  highlight: boolean;
  text: string;
}

export interface DiffLine {
  type: LineType;
  base: string | null;
  mine: string | null;
  baseLineNo: number | null;
  mineLineNo: number | null;
  baseCharSpans: CharSpan[] | null;
  mineCharSpans: CharSpan[] | null;
}

export interface TextDiffStats {
  add: number;
  del: number;
  chg: number;
}

export interface TextDiffPresentation {
  replacementPairIndex: Map<number, number>;
  stats: TextDiffStats;
}

export interface Hunk {
  startIdx: number;
  endIdx: number;
  addCount: number;
  delCount: number;
}

export type OpType = 'equal' | 'insert' | 'delete';

export interface DiffOp {
  type: OpType;
  text: string;
}

export type TokenType = 'keyword' | 'string' | 'comment' | 'number' | 'punctuation' | 'plain';

export interface Token {
  type: TokenType;
  text: string;
  color?: string | null;
  fontStyle?: number | null;
}

export type SyntaxHighlightSource = 'shiki' | 'fallback' | 'none';

export interface SyntaxPresentation {
  languageId: string | null;
  source: SyntaxHighlightSource;
  baseLineTokens: Token[][];
  mineLineTokens: Token[][];
}

export interface SearchMatch {
  lineIdx: number;
  start: number;
  end: number;
  workbookTarget: WorkbookSearchTarget | null;
}

export interface WorkbookSearchTarget {
  sheetName: string | null;
  side: 'base' | 'mine' | null;
  rowNumber: number | null;
  colIndex: number | null;
}

export interface SearchState {
  query: string;
  isRegex: boolean;
  isCaseSensitive: boolean;
  workbookScope: 'all' | 'sheet';
  matches: SearchMatch[];
  activeIdx: number;
}

export interface SearchResultItem {
  index: number;
  lineIdx: number;
  workbookTarget: WorkbookSearchTarget | null;
  scopeKey: string;
  sheetName: string | null;
  side: 'base' | 'mine' | null;
  sideLabel: string;
  rowNumber: number | null;
  colIndex: number | null;
  address: string;
  locationLabel: string;
  preview: string;
  detail: string;
}

export interface TextLineSelectionSummary {
  count: number;
  rangeLabel: string | null;
}

export interface DiffPerformanceMetrics {
  source: 'cli' | 'revision-switch' | 'local-dev';
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
  rustDiffMs?: number;
  totalAppMs?: number;
  diffLineCount?: number;
}

export interface DiffMeta {
  baseName: string;
  mineName: string;
  svnUrl: string;
  fileName: string;
}

export type DiffSourceNoticeCode = 'unversioned-working-copy';
