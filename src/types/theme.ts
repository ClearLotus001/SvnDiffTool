// ─────────────────────────────────────────────────────────────────────────────
// Theme types
// ─────────────────────────────────────────────────────────────────────────────

export type ThemeKey = 'dark' | 'light' | 'hc';

export interface Theme {
  bg0: string;
  bg1: string;
  bg2: string;
  bg3: string;
  bg4: string;
  border: string;
  border2: string;
  t0: string;
  t1: string;
  t2: string;
  addBg: string;
  addHl: string;
  addTx: string;
  addBrd: string;
  delBg: string;
  delHl: string;
  delTx: string;
  delBrd: string;
  chgBg: string;
  chgTx: string;
  acc: string;
  acc2: string;
  kw: string;
  str: string;
  num: string;
  cmt: string;
  punc: string;
  lnBg: string;
  lnTx: string;
  scrollThumb: string;
  scrollThumbHover: string;
  scrollTrack: string;
  miniAdd: string;
  miniDel: string;
  miniVp: string;
  searchHl: string;
  searchActiveBg: string;
}
