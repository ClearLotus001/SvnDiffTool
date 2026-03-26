// ─────────────────────────────────────────────────────────────────────────────
// src/theme.ts
// ─────────────────────────────────────────────────────────────────────────────

import type { Theme, ThemeKey } from './types';

export const THEMES: Record<ThemeKey, Theme> = {
  dark: {
    bg0: '#141413', bg1: '#1c1b19', bg2: '#262421', bg3: '#302d2a', bg4: '#3d3935',
    border: '#3a3530', border2: '#514a44',
    t0: '#faf9f5', t1: '#d3d0c6', t2: '#9f9a8e',
    addBg: '#1b2318', addHl: '#2b3524', addTx: '#b7c8a1', addBrd: '#788c5d',
    delBg: '#311f1a', delHl: '#492922', delTx: '#f0b09a', delBrd: '#d97757',
    chgBg: '#3a331c', chgTx: '#f2cc6b',
    acc: '#d97757', acc2: '#6a9bcc',
    kw: '#ef9d80', str: '#bdd3ef', num: '#9ab683', cmt: '#8c877c', punc: '#d7d3ca',
    lnBg: '#171613', lnTx: '#605a52',
    scrollThumb: '#4a433d', scrollThumbHover: '#5d544d', scrollTrack: 'transparent',
    miniAdd: 'rgba(120,140,93,0.85)', miniDel: 'rgba(217,119,87,0.85)', miniVp: 'rgba(250,249,245,0.10)',
    searchHl: '#ead39b', searchActiveBg: 'rgba(217,119,87,0.22)',
  },
  light: {
    bg0: '#faf9f5', bg1: '#f2efe6', bg2: '#ebe7dc', bg3: '#e2ddd0', bg4: '#cfc8b8',
    border: '#ddd7c8', border2: '#bfb6a7',
    t0: '#141413', t1: '#5f5a52', t2: '#8a8376',
    addBg: '#edf3e7', addHl: '#d6e3c5', addTx: '#50643d', addBrd: '#788c5d',
    delBg: '#f9e6df', delHl: '#f1cec4', delTx: '#aa583b', delBrd: '#d97757',
    chgBg: '#f7efcf', chgTx: '#9b7b1e',
    acc: '#d97757', acc2: '#6a9bcc',
    kw: '#b36043', str: '#355b84', num: '#617749', cmt: '#847d71', punc: '#4a7198',
    lnBg: '#f2efe6', lnTx: '#aaa293',
    scrollThumb: '#c8bfaf', scrollThumbHover: '#b7ad9d', scrollTrack: '#f1ede3',
    miniAdd: 'rgba(120,140,93,0.75)', miniDel: 'rgba(217,119,87,0.75)', miniVp: 'rgba(20,20,19,0.10)',
    searchHl: '#efd79d', searchActiveBg: 'rgba(106,155,204,0.18)',
  },
  hc: {
    bg0: '#080808', bg1: '#111111', bg2: '#181818', bg3: '#222222', bg4: '#303030',
    border: '#424242', border2: '#5f5f5f',
    t0: '#ffffff', t1: '#dedede', t2: '#9e9e9e',
    addBg: '#11210e', addHl: '#23441d', addTx: '#c9f4a8', addBrd: '#88b45d',
    delBg: '#341915', delHl: '#5a2b23', delTx: '#ffc0a8', delBrd: '#ff936d',
    chgBg: '#40340d', chgTx: '#ffe083',
    acc: '#ff936d', acc2: '#7bb5f0',
    kw: '#ffae8d', str: '#cce2ff', num: '#c7eea7', cmt: '#9b9b9b', punc: '#d8d8d8',
    lnBg: '#080808', lnTx: '#626262',
    scrollThumb: '#5f5f5f', scrollThumbHover: '#777777', scrollTrack: '#101010',
    miniAdd: 'rgba(136,180,93,0.9)', miniDel: 'rgba(255,147,109,0.9)', miniVp: 'rgba(255,255,255,0.14)',
    searchHl: '#ffd486', searchActiveBg: 'rgba(123,181,240,0.24)',
  },
};

export function makeTokenColors(T: Theme): Record<string, string> {
  return {
    keyword: T.kw,
    string: T.str,
    number: T.num,
    comment: T.cmt,
    punctuation: T.punc,
    plain: T.t0,
  };
}
