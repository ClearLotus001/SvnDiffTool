// ─────────────────────────────────────────────────────────────────────────────
// Theme types
// ─────────────────────────────────────────────────────────────────────────────

import type { ThemeTokens } from '@/theme/tokens';

export type ThemeKey = 'dark' | 'light' | 'hc';

/**
 * @deprecated 旧 JS 内联主题对象接口，已被 CSS Variables + Tailwind CSS 替代。
 *
 * Canvas 渲染层请使用 `ThemeTokens`（from `@/theme/tokens`）配合
 * `getComputedThemeTokens()` 读取运行时色值。
 *
 * 普通组件请直接使用 Tailwind 工具类（如 `bg-bg-base text-text-primary`）。
 */
export type Theme = ThemeTokens;
