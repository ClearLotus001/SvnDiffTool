import { memo } from 'react';
import { FONT_CODE, FONT_SIZE, FONT_UI } from '../constants/typography';
import { useI18n } from '../context/i18n';
import { useTheme } from '../context/theme';
import type { WorkbookCompareCellState } from '../utils/workbookCompare';
import { getWorkbookCompareBadgeVisual } from '../utils/workbookCompareVisuals';
import type { WorkbookCellDisplay } from '../utils/workbookDisplay';

interface WorkbookCompareTooltipProps {
  compareCell: WorkbookCompareCellState;
}

function getInvisiblePreview(value: string): string | null {
  if (value === '') return '∅';
  const preview = value
    .replace(/ /g, '␠')
    .replace(/\t/g, '⇥')
    .replace(/\r\n/g, '↵')
    .replace(/\r/g, '↵')
    .replace(/\n/g, '↵');
  return preview === value ? null : preview;
}

const WorkbookCompareTooltip = memo(({
  compareCell,
}: WorkbookCompareTooltipProps) => {
  const T = useTheme();
  const { t } = useI18n();
  const { baseCell, mineCell, changed, kind, strictOnly } = compareCell;
  const showWhitespaceSensitiveHint = changed && strictOnly;
  const showClearedHint = changed && kind === 'delete';
  const showAddedHint = changed && kind === 'add';
  const showModifiedHint = changed && kind === 'modify';

  const badges = [
    showClearedHint ? { label: t('tooltipBadgeCleared'), ...getWorkbookCompareBadgeVisual(T, 'delete') } : null,
    showAddedHint ? { label: t('tooltipBadgeAdded'), ...getWorkbookCompareBadgeVisual(T, 'add') } : null,
    showModifiedHint ? { label: t('tooltipBadgeModified'), ...getWorkbookCompareBadgeVisual(T, 'modify') } : null,
    showWhitespaceSensitiveHint
      ? { label: t('tooltipBadgeWhitespaceSensitive'), textColor: T.acc2, background: `${T.acc2}14`, border: `${T.acc2}33` }
      : null,
  ].filter((badge): badge is { label: string; textColor: string; background: string; border: string } => badge != null);

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
              background: `${accent}18`,
              color: accent,
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
              wordBreak: 'break-word',
            }}>
            {cell.value || t('formulaBarEmptyValue')}
          </span>
          {getInvisiblePreview(cell.value) && (
            <span
              style={{
                color: T.t2,
                fontSize: FONT_SIZE.xs,
                fontFamily: FONT_CODE,
                minWidth: 0,
                wordBreak: 'break-word',
              }}>
              {getInvisiblePreview(cell.value)}
            </span>
          )}
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
          {getInvisiblePreview(cell.formula) && (
            <span
              style={{
                color: T.t2,
                fontSize: FONT_SIZE.xs,
                fontFamily: FONT_CODE,
                minWidth: 0,
                wordBreak: 'break-word',
              }}>
              {getInvisiblePreview(cell.formula)}
            </span>
          )}
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
            background: `${T.acc2}14`,
            border: `1px solid ${T.acc2}33`,
            color: T.acc2,
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
            background: `${T.delBrd}12`,
            border: `1px solid ${T.delBrd}33`,
            color: T.delTx,
            fontSize: FONT_SIZE.xs,
            fontFamily: FONT_UI,
            fontWeight: 700,
          }}>
          {t('tooltipClearedHint')}
        </div>
      )}
      {showAddedHint && (
        <div
          style={{
            padding: '6px 8px',
            borderRadius: 10,
            background: `${T.addBrd}12`,
            border: `1px solid ${T.addBrd}33`,
            color: T.addTx,
            fontSize: FONT_SIZE.xs,
            fontFamily: FONT_UI,
            fontWeight: 700,
          }}>
          {t('tooltipAddedHint')}
        </div>
      )}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
          gap: 12,
          minWidth: 320,
        }}>
        {renderPane(t('tooltipBaseLabel'), T.acc2, baseCell)}
        {renderPane(t('tooltipLocalLabel'), T.acc, mineCell)}
      </div>
    </div>
  );
});

export default WorkbookCompareTooltip;
