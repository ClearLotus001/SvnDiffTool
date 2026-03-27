import type { WorkbookSelectionKind } from '@/types';

interface ResolveWorkbookCanvasSelectionKindParams {
  hitX: number;
  contentLeft: number;
  rowNumber: number;
  headerRowNumber: number;
}

export function resolveWorkbookCanvasSelectionKind({
  hitX,
  contentLeft,
  rowNumber,
  headerRowNumber,
}: ResolveWorkbookCanvasSelectionKindParams): WorkbookSelectionKind {
  if (hitX < contentLeft) return 'row';
  if (headerRowNumber > 0 && rowNumber === headerRowNumber) return 'column';
  return 'cell';
}
