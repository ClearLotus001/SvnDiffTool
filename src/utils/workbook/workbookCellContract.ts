import type { WorkbookCellDisplay } from '@/utils/workbook/workbookDisplay';
import {
  resolveWorkbookCellDeltaKind,
  type SharedWorkbookCompareMode,
} from '../../../shared/workbookCellSemantics';

export {
  hasWorkbookCellContent,
  isWorkbookStrictOnlyDifference,
  serializeWorkbookCellForMode,
  workbookCellsDiffer,
} from '../../../shared/workbookCellSemantics';

export function getWorkbookCellChangeKind(
  leftCell: WorkbookCellDisplay,
  rightCell: WorkbookCellDisplay,
  compareMode: SharedWorkbookCompareMode = 'strict',
): 'equal' | 'add' | 'delete' | 'mixed' {
  const kind = resolveWorkbookCellDeltaKind(leftCell, rightCell, compareMode);
  return kind === 'modify' ? 'mixed' : kind;
}
