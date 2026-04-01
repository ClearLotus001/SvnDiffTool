import { memo } from 'react';
import { FONT_CODE, FONT_SIZE, FONT_UI } from '@/constants/typography';
import { useI18n } from '@/context/i18n';
import { useTheme } from '@/context/theme';
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
  const T = useTheme();
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

  const renderPane = (
    label: string,
    accent: string,
    cell: WorkbookCellDisplay,
    single = false,
  ) => (
    <div
      style={{
        display: 'grid',
        gap: 8,
        minWidth: 0,
        padding: single ? 0 : '0 0 0 2px',
      }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            color: T.t0,
            fontFamily: FONT_UI,
            fontSize: FONT_SIZE.sm,
            fontWeight: 700,
            minWidth: 0,
          }}>
          <span
            aria-hidden="true"
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: accent,
              flexShrink: 0,
            }}
          />
          {label}
        </span>
        {changed && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '1px 6px',
              borderRadius: 999,
              background: accent === baseAccent ? baseChip.background : mineChip.background,
              color: accent === baseAccent ? baseChip.textColor : mineChip.textColor,
              fontSize: FONT_SIZE.xs,
              fontFamily: FONT_UI,
              fontWeight: 700,
              flexShrink: 0,
            }}>
            {t('tooltipChangedLabel')}
          </span>
        )}
      </div>

      <div style={{ display: 'grid', gap: 6, minWidth: 0 }}>
        <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
          <span style={{ color: T.t2, fontSize: FONT_SIZE.xs, fontWeight: 700, fontFamily: FONT_UI }}>
            {t('workbookCellValue')}
          </span>
          <span
            style={{
              color: T.t0,
              fontSize: FONT_SIZE.sm,
              fontFamily: FONT_UI,
              minWidth: 0,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}>
            {cell.value ? formatWorkbookTooltipValue(cell.value) : t('formulaBarEmptyValue')}
          </span>
        </div>

        <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
          <span style={{ color: T.t2, fontSize: FONT_SIZE.xs, fontWeight: 700, fontFamily: FONT_UI }}>
            {t('workbookCellFormula')}
          </span>
          <span
            style={{
              color: cell.formula ? T.t0 : T.t2,
              fontSize: FONT_SIZE.sm,
              fontFamily: FONT_CODE,
              minWidth: 0,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}>
            {cell.formula || t('formulaBarEmpty')}
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <div
      style={{
        display: 'grid',
        gap: 10,
        minWidth: 320,
        textAlign: 'left',
      }}>
      {badges.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6,
          }}>
          {badges.map((badge) => (
            <span
              key={badge.label}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '2px 8px',
                borderRadius: 999,
                background: badge.background,
                border: `1px solid ${badge.border}`,
                color: badge.textColor,
                fontSize: FONT_SIZE.xs,
                fontFamily: FONT_UI,
                fontWeight: 800,
                whiteSpace: 'nowrap',
              }}>
              {badge.label}
            </span>
          ))}
        </div>
      )}
      {showWhitespaceSensitiveHint && (
        <div
          style={{
            padding: '6px 8px',
            borderRadius: 10,
            background: whitespaceHintVisual.background,
            border: `1px solid ${whitespaceHintVisual.border}`,
            color: whitespaceHintVisual.textColor,
            fontSize: FONT_SIZE.xs,
            fontFamily: FONT_UI,
            fontWeight: 700,
          }}>
          {t('tooltipWhitespaceSensitiveHint')}
        </div>
      )}
      {showClearedHint && (
        <div
          style={{
            padding: '6px 8px',
            borderRadius: 10,
            background: clearedHintVisual.background,
            border: `1px solid ${clearedHintVisual.border}`,
            color: clearedHintVisual.textColor,
            fontSize: FONT_SIZE.xs,
            fontFamily: FONT_UI,
            fontWeight: 700,
          }}>
          {t('tooltipClearedHint', { mineLabel: resolvedMineTitle, baseLabel: resolvedBaseTitle })}
        </div>
      )}
      {showAddedHint && (
        <div
          style={{
            padding: '6px 8px',
            borderRadius: 10,
            background: addedHintVisual.background,
            border: `1px solid ${addedHintVisual.border}`,
            color: addedHintVisual.textColor,
            fontSize: FONT_SIZE.xs,
            fontFamily: FONT_UI,
            fontWeight: 700,
          }}>
          {t('tooltipAddedHint', { mineLabel: resolvedMineTitle, baseLabel: resolvedBaseTitle })}
        </div>
      )}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
          gap: 12,
          minWidth: 320,
        }}>
        {renderPane(resolvedBaseTitle, baseAccent, baseCell)}
        {renderPane(resolvedMineTitle, mineAccent, mineCell)}
      </div>
    </div>
  );
});

export default WorkbookCompareTooltip;
