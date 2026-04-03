import { memo } from 'react';
import { useI18n } from '@/context/i18n';
import { useThemeTokens } from '@/context/theme';
import { cssVar } from '@/theme/cssUtils';
import type { WorkbookCompareCellState } from '@/utils/workbook/workbookCompare';
import { splitWorkbookCanvasTextLines } from '@/utils/workbook/workbookCanvasText';
import {
  getWorkbookCompareBadgeVisual,
  getWorkbookCompareHintVisual,
  resolveWorkbookCompareCellKind,
} from '@/utils/workbook/workbookCompareVisuals';
import type { WorkbookCellDisplay } from '@/utils/workbook/workbookDisplay';
import {
  resolveWorkbookAccentSurfaceVisual,
  resolveWorkbookRowSelectionAccent,
} from '@/utils/workbook/workbookRowVisuals';

interface WorkbookCompareTooltipProps {
  compareCell: WorkbookCompareCellState;
  baseTitle?: string | undefined;
  mineTitle?: string | undefined;
}

function formatWorkbookTooltipValue(value: string): string {
  if (value === '') return value;
  const logicalLines = splitWorkbookCanvasTextLines(value);
  return logicalLines.length > 0 ? logicalLines.join('\n') : value;
}

const WorkbookCompareTooltip = memo(({
  compareCell,
  baseTitle,
  mineTitle,
}: WorkbookCompareTooltipProps) => {
  const T = useThemeTokens();
  const { t } = useI18n();
  const { baseCell, mineCell, changed, strictOnly } = compareCell;
  const resolvedBaseTitle = baseTitle || t('tooltipBaseLabel');
  const resolvedMineTitle = mineTitle || t('tooltipLocalLabel');
  const semanticKind = resolveWorkbookCompareCellKind(compareCell);
  const baseAccent = resolveWorkbookRowSelectionAccent(T, 'base');
  const mineAccent = resolveWorkbookRowSelectionAccent(T, 'mine');
  const showWhitespaceSensitiveHint = changed && strictOnly;
  const showClearedHint = semanticKind === 'delete';
  const showAddedHint = semanticKind === 'add';
  const showModifiedHint = semanticKind === 'modify';

  const badges = [
    showClearedHint ? { label: t('tooltipBadgeCleared'), ...getWorkbookCompareBadgeVisual(T, 'delete') } : null,
    showAddedHint ? { label: t('tooltipBadgeAdded'), ...getWorkbookCompareBadgeVisual(T, 'add') } : null,
    showModifiedHint ? { label: t('tooltipBadgeModified'), ...getWorkbookCompareBadgeVisual(T, 'modify') } : null,
    showWhitespaceSensitiveHint
      ? { label: t('tooltipBadgeWhitespaceSensitive'), ...getWorkbookCompareHintVisual(T, 'strict-only') }
      : null,
  ].filter((badge): badge is { label: string; textColor: string; background: string; border: string } => badge != null);
  const clearedHintVisual = getWorkbookCompareHintVisual(T, 'delete');
  const addedHintVisual = getWorkbookCompareHintVisual(T, 'add');
  const whitespaceHintVisual = getWorkbookCompareHintVisual(T, 'strict-only');
  const baseChip = resolveWorkbookAccentSurfaceVisual(baseAccent);
  const mineChip = resolveWorkbookAccentSurfaceVisual(mineAccent);

  const renderHintBox = (
    visual: { background: string; border: string; textColor: string },
    text: string,
    key: string,
  ) => (
    <div
      key={key}
      className="px-2 py-1.5 rounded-[10px] font-bold font-ui text-app-2xs"
      style={{
        background: visual.background,
        border: `1px solid ${visual.border}`,
        color: visual.textColor,
      }}>
      {text}
    </div>
  );

  const renderPane = (
    label: string,
    accent: string,
    cell: WorkbookCellDisplay,
    single = false,
  ) => (
    <div className={`grid gap-2 min-w-0 ${single ? '' : 'pl-0.5'}`}>
      <div className="flex items-center gap-2 min-w-0">
        <span
          className="inline-flex items-center gap-1.5 min-w-0 font-bold font-ui text-app-xs"
          style={{ color: cssVar('t0') }}>
          <span
            aria-hidden="true"
            className="size-2 rounded-full shrink-0"
            style={{ background: accent }}
          />
          {label}
        </span>
        {changed && (
          <span
            className="inline-flex items-center px-1.5 rounded-full shrink-0 font-bold font-ui text-app-2xs"
            style={{
              padding: '1px 6px',
              background: accent === baseAccent ? baseChip.background : mineChip.background,
              color: accent === baseAccent ? baseChip.textColor : mineChip.textColor,
            }}>
            {t('tooltipChangedLabel')}
          </span>
        )}
      </div>

      <div className="grid gap-1.5 min-w-0">
        <div className="grid gap-0.5 min-w-0">
          <span className="font-bold font-ui text-app-2xs" style={{ color: cssVar('t2') }}>
            {t('workbookCellValue')}
          </span>
          <span
            className="min-w-0 whitespace-pre-wrap break-words font-ui text-app-xs"
            style={{ color: cssVar('t0') }}>
            {cell.value ? formatWorkbookTooltipValue(cell.value) : t('formulaBarEmptyValue')}
          </span>
        </div>

        <div className="grid gap-0.5 min-w-0">
          <span className="font-bold font-ui text-app-2xs" style={{ color: cssVar('t2') }}>
            {t('workbookCellFormula')}
          </span>
          <span
            className="min-w-0 whitespace-pre-wrap break-words font-code text-app-xs"
            style={{ color: cell.formula ? cssVar('t0') : cssVar('t2') }}>
            {cell.formula || t('formulaBarEmpty')}
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="grid gap-2.5 min-w-[320px] text-left">
      {badges.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {badges.map((badge) => (
            <span
              key={badge.label}
              className="inline-flex items-center px-2 rounded-full whitespace-nowrap font-ui text-app-2xs font-extrabold"
              style={{
                padding: '2px 8px',
                background: badge.background,
                border: `1px solid ${badge.border}`,
                color: badge.textColor,
              }}>
              {badge.label}
            </span>
          ))}
        </div>
      )}
      {showWhitespaceSensitiveHint && renderHintBox(
        whitespaceHintVisual,
        t('tooltipWhitespaceSensitiveHint'),
        'ws-hint',
      )}
      {showClearedHint && renderHintBox(
        clearedHintVisual,
        t('tooltipClearedHint', { mineLabel: resolvedMineTitle, baseLabel: resolvedBaseTitle }),
        'cleared-hint',
      )}
      {showAddedHint && renderHintBox(
        addedHintVisual,
        t('tooltipAddedHint', { mineLabel: resolvedMineTitle, baseLabel: resolvedBaseTitle }),
        'added-hint',
      )}
      <div className="grid grid-cols-2 gap-3 min-w-[320px]">
        {renderPane(resolvedBaseTitle, baseAccent, baseCell)}
        {renderPane(resolvedMineTitle, mineAccent, mineCell)}
      </div>
    </div>
  );
});

export default WorkbookCompareTooltip;
