import { memo, useMemo } from 'react';
import { FONT_CODE, FONT_UI, getWorkbookFontScale } from '../constants/typography';
import { useI18n } from '../context/i18n';
import { useTheme } from '../context/theme';
import type { WorkbookFreezeState, WorkbookMergeRange, WorkbookSelectionState } from '../types';
import { findWorkbookMergeRange } from '../utils/workbookMergeLayout';
import { getWorkbookColumnLabel } from '../utils/workbookSections';
import { getWorkbookSelectionCount } from '../utils/workbookSelectionState';

interface WorkbookFormulaBarProps {
  selection: WorkbookSelectionState;
  fontSize: number;
  freezeState?: WorkbookFreezeState | null;
  mergeRanges?: WorkbookMergeRange[];
  onFreezeRow: () => void;
  onFreezeColumn: () => void;
  onFreezePane: () => void;
  onUnfreezeRow: () => void;
  onUnfreezeColumn: () => void;
  onResetFreeze: () => void;
}

function formatMergeRange(range: WorkbookMergeRange): string {
  const start = `${getWorkbookColumnLabel(range.startCol)}${range.startRow}`;
  const end = `${getWorkbookColumnLabel(range.endCol)}${range.endRow}`;
  return start === end ? start : `${start}:${end}`;
}

const WorkbookFormulaBar = memo(({
  selection,
  fontSize,
  freezeState = null,
  mergeRanges = [],
  onFreezeRow,
  onFreezeColumn,
  onFreezePane,
  onUnfreezeRow,
  onUnfreezeColumn,
  onResetFreeze,
}: WorkbookFormulaBarProps) => {
  const T = useTheme();
  const { t } = useI18n();
  const sizes = useMemo(() => getWorkbookFontScale(fontSize), [fontSize]);
  const primarySelection = selection.primary;
  const selectionCount = getWorkbookSelectionCount(selection);
  const sideLabel = primarySelection?.kind === 'row'
    ? t('formulaSelectionRow')
    : primarySelection?.kind === 'column'
    ? t('formulaSelectionColumn')
    : primarySelection?.side === 'base'
    ? t('tooltipBaseLabel')
    : primarySelection?.side === 'mine'
    ? t('tooltipLocalLabel')
    : t('formulaBarHint');
  const sideMeta = primarySelection?.versionLabel
    ? `${sideLabel} · ${primarySelection.versionLabel}`
    : sideLabel;
  const selectionSummary = selectionCount > 1
    ? primarySelection?.kind === 'row'
      ? t('formulaSelectionRowsCount', { count: selectionCount })
      : primarySelection?.kind === 'column'
      ? t('formulaSelectionColumnsCount', { count: selectionCount })
      : t('formulaSelectionCellsCount', { count: selectionCount })
    : '';
  const sideAccent = primarySelection?.side === 'base' ? T.acc2 : T.acc;
  const mergeRange = primarySelection?.kind === 'cell'
    ? findWorkbookMergeRange(mergeRanges, primarySelection.rowNumber, primarySelection.colIndex)
    : null;
  const mergeRangeLabel = mergeRange ? formatMergeRange(mergeRange) : '';
  const selectionAddress = primarySelection?.kind === 'row'
    ? `R${primarySelection.rowNumber}`
    : primarySelection?.kind === 'column'
    ? primarySelection.colLabel
    : (mergeRangeLabel || primarySelection?.address || '—');
  const canFreezeRow = Boolean(primarySelection && primarySelection.kind !== 'column');
  const canFreezeColumn = Boolean(primarySelection && primarySelection.kind !== 'row');
  const canFreezePane = Boolean(primarySelection && primarySelection.kind === 'cell');
  const canUnfreezeRow = Boolean(freezeState?.rowNumber);
  const canUnfreezeColumn = Boolean(freezeState?.colCount);
  const canResetFreeze = canUnfreezeRow || canUnfreezeColumn;
  const freezeSummary = [
    freezeState?.rowNumber ? t('formulaFreezeRows', { count: freezeState.rowNumber }) : '',
    freezeState?.colCount ? t('formulaFreezeCols', { count: freezeState.colCount }) : '',
  ].filter(Boolean).join(' · ') || t('formulaFreezeDefault');

  const ActionButton = ({
    label,
    onClick,
    active = false,
    disabled = false,
  }: {
    label: string;
    onClick: () => void;
    active?: boolean;
    disabled?: boolean;
  }) => (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        height: 28,
        padding: '0 10px',
        borderRadius: 8,
        border: `1px solid ${active ? `${sideAccent}55` : T.border}`,
        background: active ? `${sideAccent}16` : T.bg2,
        color: active ? sideAccent : T.t0,
        fontFamily: FONT_UI,
        fontSize: sizes.meta,
        fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        whiteSpace: 'nowrap',
      }}>
      {label}
    </button>
  );

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'auto auto minmax(180px, auto) minmax(0, 1fr) auto',
        gap: 8,
        alignItems: 'stretch',
        padding: '8px 12px',
        borderBottom: `1px solid ${T.border}`,
        background: `linear-gradient(180deg, ${T.bg1} 0%, ${T.bg0} 100%)`,
        flexShrink: 0,
      }}>
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: 86,
          height: 30,
          padding: '0 12px',
          borderRadius: 10,
          border: `1px solid ${T.border}`,
          background: T.bg2,
          color: T.t0,
          fontFamily: FONT_CODE,
          fontSize: sizes.cell,
          fontWeight: 700,
        }}>
        {selectionAddress}
      </div>

      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          minWidth: 0,
          height: 30,
          padding: '0 12px',
          borderRadius: 10,
          border: `1px solid ${T.border}`,
          background: T.bg2,
          color: T.t0,
          fontFamily: FONT_UI,
          fontSize: sizes.ui,
          fontWeight: 600,
        }}>
        <span
          aria-hidden="true"
          style={{
            width: 8,
            height: 8,
            borderRadius: primarySelection?.side === 'base' ? 2 : '50%',
            transform: primarySelection?.side === 'base' ? 'rotate(45deg)' : undefined,
            background: sideAccent,
            flexShrink: 0,
          }}
        />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sideMeta}</span>
        {selectionSummary && (
          <span
            style={{
              marginLeft: 'auto',
              padding: '1px 8px',
              borderRadius: 999,
              background: `${sideAccent}14`,
              color: sideAccent,
              fontSize: sizes.meta,
              fontWeight: 800,
              whiteSpace: 'nowrap',
            }}>
            {selectionSummary}
          </span>
        )}
      </div>

      {mergeRangeLabel && (
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            minWidth: 160,
            height: 30,
            padding: '0 12px',
            borderRadius: 10,
            border: `1px solid ${T.border}`,
            background: T.bg2,
            color: T.t1,
            fontFamily: FONT_UI,
            fontSize: sizes.ui,
            gap: 8,
          }}>
          <span style={{ color: T.t2 }}>{t('formulaMergeLabel')}:</span>
          <span
            style={{
              color: T.t0,
              fontFamily: FONT_CODE,
              fontWeight: 700,
              whiteSpace: 'nowrap',
            }}>
            {mergeRangeLabel}
          </span>
        </div>
      )}

      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          minWidth: 180,
          height: 30,
          padding: '0 12px',
          borderRadius: 10,
          border: `1px solid ${T.border}`,
          background: T.bg2,
          color: T.t1,
          fontFamily: FONT_UI,
          fontSize: sizes.ui,
        }}>
        <span style={{ color: T.t2 }}>{t('workbookCellValue')}:</span>
        <span
          style={{
            marginLeft: 8,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: T.t0,
            fontWeight: 600,
          }}>
          {primarySelection?.value || t('formulaBarEmptyValue')}
        </span>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          minWidth: 0,
          height: 30,
          padding: '0 12px',
          borderRadius: 10,
          border: `1px solid ${T.border}`,
          background: T.bg2,
          overflow: 'hidden',
        }}>
        <span
          style={{
            color: T.acc2,
            fontFamily: FONT_UI,
            fontSize: sizes.meta,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            flexShrink: 0,
          }}>
          fx
        </span>
        <span
          style={{
            marginLeft: 10,
            fontFamily: FONT_CODE,
            fontSize: sizes.ui,
            color: primarySelection?.formula ? T.t0 : T.t2,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
          {primarySelection?.formula || t('formulaBarEmpty')}
        </span>
      </div>

      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          minWidth: 0,
          flexWrap: 'wrap',
          justifyContent: 'flex-end',
        }}>
        <span
          style={{
            color: T.t2,
            fontFamily: FONT_UI,
            fontSize: sizes.meta,
            whiteSpace: 'nowrap',
          }}>
          {t('formulaFreezeLabel')}: {freezeSummary}
        </span>
        <ActionButton label={t('formulaFreezeRowAction')} onClick={onFreezeRow} disabled={!canFreezeRow} />
        <ActionButton label={t('formulaFreezeColumnAction')} onClick={onFreezeColumn} disabled={!canFreezeColumn} />
        <ActionButton
          label={t('formulaFreezePaneAction')}
          onClick={onFreezePane}
          active={Boolean(freezeState?.rowNumber || freezeState?.colCount)}
          disabled={!canFreezePane}
        />
        <ActionButton
          label={t('formulaFreezeUnfreezeRowAction')}
          onClick={onUnfreezeRow}
          active={canUnfreezeRow}
          disabled={!canUnfreezeRow}
        />
        <ActionButton
          label={t('formulaFreezeUnfreezeColumnAction')}
          onClick={onUnfreezeColumn}
          active={canUnfreezeColumn}
          disabled={!canUnfreezeColumn}
        />
        <ActionButton label={t('formulaFreezeResetAction')} onClick={onResetFreeze} disabled={!canResetFreeze} />
      </div>
    </div>
  );
});

export default WorkbookFormulaBar;
