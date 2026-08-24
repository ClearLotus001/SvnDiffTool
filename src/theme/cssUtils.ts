// ─────────────────────────────────────────────────────────────────────────────
// src/theme/cssUtils.ts — DOM 组件专用的 CSS Variables 辅助工具
//
// 普通 DOM 组件应使用这些函数来构建内联 style 中的颜色值，
// 而非 useThemeTokens()（后者仅供 Canvas 渲染层使用）。
//
// 使用 CSS Variables + color-mix() 的好处：
//   1. 颜色自动跟随主题切换（无需 JS 重新计算）
//   2. 消除对 getComputedStyle 的时序依赖
//   3. 保持 CSS Variables 为唯一色值真相源的架构约定
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 将 ThemeTokens 的短名映射到 CSS 变量名。
 *
 * DOM 组件使用此映射从 ThemeTokens 的 `T.xxx` 迁移到 `var(--xxx)`。
 * 键名与 `ThemeTokens` 接口的字段名一一对应。
 */
const TOKEN_CSS_MAP = {
    bg0: '--bg-base',
    bg1: '--bg-surface-solid',
    bg2: '--bg-surface-hover',
    bg3: '--bg-elevated',
    bg4: '--border-color',
    border: '--border-color',
    border2: '--border-strong',
    t0: '--text-title',
    t1: '--text-primary',
    t2: '--text-secondary',
    addBg: '--diff-add-bg',
    addHl: '--diff-add-hl',
    addTx: '--diff-add-text',
    addBrd: '--diff-add-border',
    delBg: '--diff-remove-bg',
    delHl: '--diff-remove-hl',
    delTx: '--diff-remove-text',
    delBrd: '--diff-remove-border',
    chgBg: '--diff-modify-bg',
    chgHl: '--diff-modify-hl',
    chgTx: '--diff-modify-text',
    chgBrd: '--diff-modify-border',
    acc: '--accent',
    acc2: '--acc2',
    versionBase: '--version-base',
    versionMine: '--version-mine',
    kw: '--syntax-keyword',
    str: '--syntax-string',
    num: '--syntax-number',
    cmt: '--syntax-comment',
    punc: '--syntax-punctuation',
    lnBg: '--ln-bg',
    lnTx: '--ln-text',
    scrollThumb: '--scroll-thumb',
    scrollThumbHover: '--scroll-thumb-hover',
    scrollTrack: '--scroll-track',
    miniAdd: '--mini-add',
    miniDel: '--mini-del',
    miniVp: '--mini-vp',
    searchHl: '--search-hl',
    searchActiveBg: '--search-active-bg',
    glassBlur: '--glass-blur',
} as const;

/** TOKEN_CSS_MAP 的键类型 */
export type TokenName = keyof typeof TOKEN_CSS_MAP;

/**
 * 返回 `var(--xxx)` 形式的 CSS 变量引用。
 *
 * 提供类型安全的短名到 CSS 变量名的转换，
 * 代替 `useThemeTokens()` 在 DOM 组件中的直接值引用。
 *
 * :param token: ThemeTokens 的短名（如 `'bg0'`, `'acc2'`, `'t0'`）
 * :returns: CSS `var()` 表达式
 *
 * 示例：
 * ```tsx
 * // 旧写法（使用 ThemeTokens）
 * style={{ background: T.bg1 }}
 *
 * // 新写法（使用 cssVar）
 * style={{ background: cssVar('bg1') }}
 * ```
 */
export function cssVar(token: TokenName): string {
    return `var(${TOKEN_CSS_MAP[token]})`;
}

/**
 * 返回基于 CSS 变量的半透明颜色，使用 `color-mix()` 函数。
 *
 * 替代 DOM 组件中 `${T.xxx}XX` hex alpha 后缀拼接模式。
 * `color-mix()` 是 CSS 原生函数，在所有 Chromium 111+ 浏览器中支持
 * （Electron 使用的 Chromium 版本远高于此）。
 *
 * :param token: ThemeTokens 的短名（如 `'acc2'`, `'chgTx'`）
 * :param hexAlpha: 两位 hex 格式的 alpha 值（如 `'16'`, `'66'`, `'cc'`）
 * :returns: CSS `color-mix()` 表达式
 *
 * 示例：
 * ```tsx
 * // 旧写法（hex alpha 拼接）
 * style={{ background: `${T.acc2}16` }}
 *
 * // 新写法（color-mix）
 * style={{ background: cssAlpha('acc2', '16') }}
 * ```
 */
export function cssAlpha(token: TokenName, hexAlpha: string): string {
    const opacity = parseInt(hexAlpha, 16) / 255;
    const percent = Math.round(opacity * 100);
    return `color-mix(in srgb, var(${TOKEN_CSS_MAP[token]}) ${percent}%, transparent)`;
}

/**
 * 返回基于原始 CSS 变量名的半透明颜色。
 *
 * 当颜色值来自函数参数（而非固定 token 名）时使用此版本。
 *
 * :param cssVarName: CSS 变量名（如 `'--accent'`, `'--acc2'`）
 * :param hexAlpha: 两位 hex 格式的 alpha 值
 * :returns: CSS `color-mix()` 表达式
 *
 * 示例：
 * ```tsx
 * // 在接收 accent CSS 变量名的通用组件中
 * style={{ background: cssAlphaRaw('--accent', '16') }}
 * ```
 */
export function cssAlphaRaw(cssVarName: string, hexAlpha: string): string {
    const opacity = parseInt(hexAlpha, 16) / 255;
    const percent = Math.round(opacity * 100);
    return `color-mix(in srgb, var(${cssVarName}) ${percent}%, transparent)`;
}
