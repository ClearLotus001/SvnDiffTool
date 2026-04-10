import type { ThemeKey } from '@/theme';

interface BuildWorkbookRenderIdentityParams {
  sheetName: string | null | undefined;
  themeKey: ThemeKey;
  mode?: string | null | undefined;
}

/**
 * Build a stable render identity for workbook canvas trees.
 *
 * Why `themeKey` must be included:
 * - Workbook views are composed from multiple imperative canvas strips.
 * - A theme switch changes the visual output even when sheet data is unchanged.
 * - If the root render identity ignores theme, React may preserve an existing
 *   workbook subtree while those canvas surfaces still hold pixels painted by
 *   the previous theme, causing mixed light/dark regions after a theme switch.
 *
 * By including `themeKey` in the root identity we remount the workbook render
 * boundary whenever appearance changes, ensuring all canvas strips are rebuilt
 * from the current theme instead of reusing stale bitmap output.
 */
export function buildWorkbookRenderIdentity({
  sheetName,
  themeKey,
  mode,
}: BuildWorkbookRenderIdentityParams): string {
  const normalizedSheetName = sheetName ?? 'none';
  return mode
    ? `${mode}:${normalizedSheetName}:${themeKey}`
    : `${normalizedSheetName}:${themeKey}`;
}
