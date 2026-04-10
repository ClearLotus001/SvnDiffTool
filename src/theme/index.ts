// ─────────────────────────────────────────────────────────────────────────────
// src/theme/index.ts — 主题模块入口
//
// 主题契约统一为：
//   1. UI 层只传递 ThemeKey
//   2. DOM 组件使用 CSS Variables
//   3. Canvas / 纯函数场景显式读取 ThemeTokens 快照
// ─────────────────────────────────────────────────────────────────────────────

import type { TokenType } from '@/types';
import { type ThemeTokens, THEME_VAR_MAP } from '@/theme/tokens';

export type { ThemeTokens };
export { THEME_VAR_MAP };

export type Theme = ThemeTokens;
export type ThemeKey = 'dark' | 'light' | 'hc';

export const THEME_KEYS: readonly ThemeKey[] = ['light', 'dark', 'hc'] as const;

export const THEME_CLASS_MAP: Record<ThemeKey, string> = {
  dark: 'theme-dark',
  light: 'theme-light',
  hc: 'theme-hc',
};

/**
 * 纯 ThemeTokens 快照。
 *
 * 仅供 tests / SSR / Canvas / 纯函数视觉计算使用；
 * UI 层不再暴露 `THEMES` 兼容入口。
 */
const STATIC_THEME_TOKENS: Record<ThemeKey, ThemeTokens> = {
  dark: {
    bg0: '#09090b',
    bg1: '#18181b',
    bg2: '#27272a',
    bg3: '#27272a',
    bg4: '#3f3f46',
    border: '#27272a',
    border2: '#3f3f46',
    t0: '#fafafa',
    t1: '#f4f4f5',
    t2: '#a1a1aa',
    addBg: '#052e16',
    addHl: '#064e3b',
    addTx: '#34d399',
    addBrd: '#10b981',
    delBg: '#3f1018',
    delHl: '#7f1d2d',
    delTx: '#fda4af',
    delBrd: '#fb7185',
    chgBg: '#332701',
    chgHl: '#5b4700',
    chgTx: '#fde047',
    chgBrd: '#facc15',
    acc: '#fafafa',
    acc2: '#60a5fa',
    kw: '#e879f9',
    str: '#93c5fd',
    num: '#6ee7b7',
    cmt: '#71717a',
    punc: '#d4d4d8',
    lnBg: '#18181b',
    lnTx: '#71717a',
    scrollThumb: '#a1a1aa',
    scrollThumbHover: '#d4d4d8',
    scrollTrack: 'transparent',
    miniAdd: '#34d399',
    miniDel: '#fb7185',
    miniVp: '#27272a',
    searchHl: '#38bdf8',
    searchActiveBg: 'rgba(56, 189, 248, 0.30)',
    glassBlur: 'blur(12px)',
  },
  light: {
    bg0: '#f4f4f5',
    bg1: '#ffffff',
    bg2: '#f4f4f5',
    bg3: '#ffffff',
    bg4: '#e4e4e7',
    border: '#e4e4e7',
    border2: '#d4d4d8',
    t0: '#09090b',
    t1: '#09090b',
    t2: '#71717a',
    addBg: '#d1fae5',
    addHl: '#a7f3d0',
    addTx: '#065f46',
    addBrd: '#10b981',
    delBg: '#fee2e2',
    delHl: '#fecaca',
    delTx: '#991b1b',
    delBrd: '#ef4444',
    chgBg: '#fef3c7',
    chgHl: '#fde68a',
    chgTx: '#92400e',
    chgBrd: '#f59e0b',
    acc: '#09090b',
    acc2: '#3b82f6',
    kw: '#7c3aed',
    str: '#2563eb',
    num: '#059669',
    cmt: '#71717a',
    punc: '#52525b',
    lnBg: '#ffffff',
    lnTx: '#a1a1aa',
    scrollThumb: '#a1a1aa',
    scrollThumbHover: '#71717a',
    scrollTrack: 'transparent',
    miniAdd: '#10b981',
    miniDel: '#ef4444',
    miniVp: '#e4e4e7',
    searchHl: '#2563eb',
    searchActiveBg: 'rgba(37, 99, 235, 0.24)',
    glassBlur: 'blur(16px)',
  },
  hc: {
    bg0: '#000000',
    bg1: '#000000',
    bg2: '#1a1a1a',
    bg3: '#1a1a1a',
    bg4: '#ffffff',
    border: '#ffffff',
    border2: '#ffffff',
    t0: '#ffffff',
    t1: '#ffffff',
    t2: '#00ffff',
    addBg: 'transparent',
    addHl: '#003300',
    addTx: '#00ff00',
    addBrd: '#00ff00',
    delBg: 'transparent',
    delHl: '#330000',
    delTx: '#ff00ff',
    delBrd: '#ff00ff',
    chgBg: 'transparent',
    chgHl: '#333300',
    chgTx: '#ffff00',
    chgBrd: '#ffff00',
    acc: '#ffff00',
    acc2: '#00ffff',
    kw: '#ffffff',
    str: '#ffffff',
    num: '#ffffff',
    cmt: '#ffffff',
    punc: '#ffffff',
    lnBg: '#000000',
    lnTx: '#00ffff',
    scrollThumb: '#ffffff',
    scrollThumbHover: '#ffffff',
    scrollTrack: 'transparent',
    miniAdd: '#00ff00',
    miniDel: '#ff00ff',
    miniVp: '#333333',
    searchHl: '#00ffff',
    searchActiveBg: 'rgba(0, 255, 255, 0.38)',
    glassBlur: 'blur(0px)',
  },
};

export function getThemeTokensSnapshot(themeKey: ThemeKey): ThemeTokens {
  return STATIC_THEME_TOKENS[themeKey];
}

// ─── 运行时色值读取（Canvas 渲染层专用） ─────────────────────────────────

let cachedKey: ThemeKey | null = null;
let cachedTokens: ThemeTokens | null = null;

function parseHexRGB(hex: string): [number, number, number] | null {
  const raw = hex.slice(1);
  if (raw.length === 3) {
    const r = raw.charAt(0);
    const g = raw.charAt(1);
    const b = raw.charAt(2);
    return [
      parseInt(r + r, 16),
      parseInt(g + g, 16),
      parseInt(b + b, 16),
    ];
  }
  if (raw.length >= 6) {
    return [
      parseInt(raw.slice(0, 2), 16),
      parseInt(raw.slice(2, 4), 16),
      parseInt(raw.slice(4, 6), 16),
    ];
  }
  return null;
}

function blendOnBackground(
  r: number,
  g: number,
  b: number,
  a: number,
  bgRGB: [number, number, number],
): string {
  const toHex = (n: number) => Math.round(n).toString(16).padStart(2, '0');
  const rr = r * a + bgRGB[0] * (1 - a);
  const gg = g * a + bgRGB[1] * (1 - a);
  const bb = b * a + bgRGB[2] * (1 - a);
  return `#${toHex(rr)}${toHex(gg)}${toHex(bb)}`;
}

function normalizeColorToHex(value: string, bgRGB: [number, number, number]): string {
  const v = value.trim();

  if (v.startsWith('#')) {
    const raw = v.slice(1);
    if (raw.length === 4) {
      const rc = raw.charAt(0);
      const gc = raw.charAt(1);
      const bc = raw.charAt(2);
      const ac = raw.charAt(3);
      const r = parseInt(rc + rc, 16);
      const g = parseInt(gc + gc, 16);
      const b = parseInt(bc + bc, 16);
      const a = parseInt(ac + ac, 16) / 255;
      if (a < 1) return blendOnBackground(r, g, b, a, bgRGB);
      const toHex = (n: number) => n.toString(16).padStart(2, '0');
      return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    }
    if (raw.length === 3) {
      const expanded = raw.split('').map((ch) => `${ch}${ch}`).join('');
      return `#${expanded}`;
    }
    if (raw.length === 8) {
      const r = parseInt(raw.slice(0, 2), 16);
      const g = parseInt(raw.slice(2, 4), 16);
      const b = parseInt(raw.slice(4, 6), 16);
      const a = parseInt(raw.slice(6, 8), 16) / 255;
      if (a < 1) return blendOnBackground(r, g, b, a, bgRGB);
    }
    if (raw.length >= 6) return `#${raw.slice(0, 6)}`;
    return v;
  }

  const rgbMatch = v.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/i,
  );
  if (rgbMatch) {
    const r = Number(rgbMatch[1]);
    const g = Number(rgbMatch[2]);
    const b = Number(rgbMatch[3]);
    const a = rgbMatch[4] !== undefined ? Number(rgbMatch[4]) : 1;
    if (a < 1) return blendOnBackground(r, g, b, a, bgRGB);
    const toHex = (n: number) => Math.round(n).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  return v;
}

/**
 * 从 DOM 的 `getComputedStyle` 读取当前主题的 CSS Variables。
 *
 * 当当前环境没有 DOM，或 DOM 尚未切换到目标主题类时，
 * 回退到显式 ThemeTokens 快照。
 */
export function getComputedThemeTokens(themeKey: ThemeKey): ThemeTokens {
  if (cachedKey === themeKey && cachedTokens) {
    return cachedTokens;
  }

  if (typeof document === 'undefined' || typeof getComputedStyle !== 'function') {
    cachedKey = themeKey;
    cachedTokens = getThemeTokensSnapshot(themeKey);
    return cachedTokens;
  }

  const root = document.documentElement;
  const expectedClass = THEME_CLASS_MAP[themeKey];
  const hasExpectedClass = root.classList.contains(expectedClass) || root.className === expectedClass;
  if (!hasExpectedClass) {
    cachedKey = themeKey;
    cachedTokens = getThemeTokensSnapshot(themeKey);
    return cachedTokens;
  }

  const style = getComputedStyle(root);
  const bgBaseRaw = style.getPropertyValue('--bg-base').trim();
  const bgRGB: [number, number, number] = parseHexRGB(bgBaseRaw) ?? [0, 0, 0];
  const tokens = {} as ThemeTokens;

  for (const [field, varName] of Object.entries(THEME_VAR_MAP) as [keyof ThemeTokens, string][]) {
    tokens[field] = normalizeColorToHex(style.getPropertyValue(varName), bgRGB);
  }

  cachedKey = themeKey;
  cachedTokens = tokens;
  return cachedTokens;
}

export function invalidateThemeTokensCache(): void {
  cachedKey = null;
  cachedTokens = null;
}

export function makeTokenColors(themeKey: ThemeKey): Record<TokenType, string> {
  const T = getComputedThemeTokens(themeKey);
  return {
    keyword: T.kw,
    string: T.str,
    number: T.num,
    comment: T.cmt,
    punctuation: T.punc,
    plain: T.t0,
  };
}
