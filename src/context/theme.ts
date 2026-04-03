// ─────────────────────────────────────────────────────────────────────────────
// src/context/theme.ts — Theme Context (Tailwind CSS 架构)
//
// useTheme()       → ThemeKey（组件通过 Tailwind 类名 / CSS Variables 消费样式）
// useThemeTokens() → ThemeTokens（仅供 Canvas 渲染层程序化读取色值）
// ─────────────────────────────────────────────────────────────────────────────

import { createContext, useContext, useMemo } from 'react';
import {
  type ThemeKey,
  type ThemeTokens,
  getComputedThemeTokens,
} from '@/theme';

export const ThemeContext = createContext<ThemeKey>('dark');

/**
 * 返回当前的 ThemeKey（'dark' | 'light' | 'hc'）。
 *
 * 普通 DOM 组件应直接使用 Tailwind 工具类或 CSS Variables 消费样式，
 * 不需要此 hook 的返回值来设置 style 属性。
 */
export function useTheme(): ThemeKey {
  return useContext(ThemeContext);
}

/**
 * 返回当前主题的运行时色值对象（从 CSS Variables 读取）。
 *
 * **仅供 Canvas 渲染层**（如 `ctx.fillStyle = T.bg0`）和需要
 * 程序化访问色值的特殊场景使用。
 *
 * 普通 DOM 组件请使用 Tailwind 类名（如 `bg-bg-base text-text-primary`）
 * 或 CSS Variables（如 `style={{ color: 'var(--text-title)' }}`）。
 */
export function useThemeTokens(): ThemeTokens {
  const themeKey = useTheme();
  return useMemo(() => getComputedThemeTokens(themeKey), [themeKey]);
}
