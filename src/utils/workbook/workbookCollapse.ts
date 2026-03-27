export function buildWorkbookCollapseBlockPrefix(
  activeSheetCacheKey: string,
): string {
  return `wb-${activeSheetCacheKey}`;
}
