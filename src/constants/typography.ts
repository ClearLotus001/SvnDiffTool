export const FONT_UI = "'Microsoft YaHei UI', 'Segoe UI', 'PingFang SC', sans-serif";
export const FONT_CODE = "'Cascadia Mono', 'JetBrains Mono', 'Consolas', monospace";

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
