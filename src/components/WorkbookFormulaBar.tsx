import { memo, useMemo } from 'react';
import { FONT_CODE, FONT_UI, getWorkbookFontScale } from '../constants/typography';
import { useI18n } from '../context/i18n';
import { useTheme } from '../context/theme';
import type { WorkbookFreezeState, WorkbookMergeRange, WorkbookSelectedCell } from '../types';
import { findWorkbookMergeRange } from '../utils/workbookMergeLayout';
import { getWorkbookColumnLabel } from '../utils/workbookSections';

interface WorkbookFormulaBarProps {
  selection: WorkbookSelectedCell | null;
  fontSize: number;
  freezeState?: WorkbookFreezeState | null;
  mergeRanges?: WorkbookMergeRange[];
  onFreezeRow: () => void;
  onFreezeColumn: () => void;
  onFreezePane: () => void;
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
  onResetFreeze,
}: WorkbookFormulaBarProps) => {
  const T = useTheme();
  const { t } = useI18n();
  const sizes = useMemo(() => getWorkbookFontScale(fontSize), [fontSize]);
  const sideLabel = selection?.kind === 'row'
    ? t('formulaSelectionRow')
    : selection?.kind === 'column'
    ? t('formulaSelectionColumn')
    : selection?.side === 'base'
    ? t('tooltipBaseLabel')
    : selection?.side === 'mine'
    ? t('tooltipLocalLabel')
    : t('formulaBarHint');
  const sideMeta = selection?.versionLabel
    ? `${sideLabel} · ${selection.versionLabel}`
    : sideLabel;
  const sideAccent = selection?.side === 'base' ? T.acc2 : T.acc;
  const mergeRange = selection?.kind === 'cell'
    ? findWorkbookMergeRange(mergeRanges, selection.rowNumber, selection.colIndex)
    : null;
  const mergeRangeLabel = mergeRange ? formatMergeRange(mergeRange) : '';
  const selectionAddress = selection?.kind === 'row'
    ? `R${selection.rowNumber}`
    : selection?.kind === 'column'
    ? selection.colLabel
    : (mergeRangeLabel || selection?.address || '—');
  const canFreezeRow = Boolean(selection && selection.kind !== 'column');
  const canFreezeColumn = Boolean(selection && selection.kind !== 'row');
  const canFreezePane = Boolean(selection && selection.kind === 'cell');
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
        height: 30,
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
        gap: 10,
        alignItems: 'stretch',
        padding: '10px 12px',
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
          height: 34,
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
          height: 34,
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
            borderRadius: selection?.side === 'base' ? 2 : '50%',
            transform: selection?.side === 'base' ? 'rotate(45deg)' : undefined,
            background: sideAccent,
            flexShrink: 0,
          }}
        />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sideMeta}</span>
      </div>

      {mergeRangeLabel && (
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            minWidth: 160,
            height: 34,
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
          height: 34,
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
          {selection?.value || t('formulaBarEmptyValue')}
        </span>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          minWidth: 0,
          height: 34,
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
            color: selection?.formula ? T.t0 : T.t2,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
          {selection?.formula || t('formulaBarEmpty')}
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
        <ActionButton label={t('formulaFreezeResetAction')} onClick={onResetFreeze} />
      </div>
    </div>
  );
});

export default WorkbookFormulaBar;
