export const FONT_UI = "'Inter', 'Microsoft YaHei UI', 'Segoe UI', 'PingFang SC', system-ui, sans-serif";
export const FONT_CODE = "'Consolas', 'Cascadia Mono', 'Courier New', monospace";
export const FONT_CODE_STYLE = {
  fontFamily: FONT_CODE,
  fontVariantLigatures: 'none',
  fontFeatureSettings: "'liga' 0, 'calt' 0",
  textRendering: 'optimizeLegibility',
} as const;

export const FONT_SIZE = {
  xs: 11,
  sm: 12,
  md: 14,
  lg: 15,
  xl: 18,
} as const;

export function getWorkbookFontScale(fontSize: number) {
  const cell = Math.max(10, Math.min(20, fontSize));
  return {
    cell,
    ui: Math.max(10, cell - 1),
    meta: Math.max(9, cell - 2),
    line: Math.max(10, cell - 1),
    header: Math.max(9, cell - 2),
  };
}
