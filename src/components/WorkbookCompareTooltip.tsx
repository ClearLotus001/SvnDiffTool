import { memo } from 'react';
import { FONT_CODE, FONT_SIZE, FONT_UI } from '../constants/typography';
import { useI18n } from '../context/i18n';
import { useTheme } from '../context/theme';
import type { WorkbookCellDisplay } from '../utils/workbookDisplay';

interface WorkbookCompareTooltipProps {
  baseCell: WorkbookCellDisplay;
  mineCell: WorkbookCellDisplay;
  changed: boolean;
}

function hasContent(cell: WorkbookCellDisplay) {
  return Boolean(cell.value.trim() || cell.formula.trim());
}

const EMPTY_CELL: WorkbookCellDisplay = { value: '', formula: '' };

const WorkbookCompareTooltip = memo(({
  baseCell,
  mineCell,
  changed,
}: WorkbookCompareTooltipProps) => {
  const T = useTheme();
  const { t } = useI18n();
  const showBase = hasContent(baseCell);
  const showMine = hasContent(mineCell);

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

  if (!showBase && !showMine) {
    return renderPane(t('tooltipLocalLabel'), T.acc, EMPTY_CELL, true);
  }

  if (!showBase || !showMine) {
    return renderPane(
      showBase ? t('tooltipBaseLabel') : t('tooltipLocalLabel'),
      showBase ? T.acc2 : T.acc,
      showBase ? baseCell : mineCell,
      true,
    );
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
        gap: 12,
        minWidth: 320,
        textAlign: 'left',
      }}>
      {renderPane(t('tooltipBaseLabel'), T.acc2, baseCell)}
      {renderPane(t('tooltipLocalLabel'), T.acc, mineCell)}
    </div>
  );
});

export default WorkbookCompareTooltip;
