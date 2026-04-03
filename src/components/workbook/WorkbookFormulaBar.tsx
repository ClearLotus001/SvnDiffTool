import { memo, useMemo } from 'react';
import { FONT_CODE, FONT_UI, getWorkbookFontScale } from '@/constants/typography';
import { useI18n } from '@/context/i18n';
import { useThemeTokens } from '@/context/theme';
import { cssVar } from '@/theme/cssUtils';
import type { WorkbookFreezeState, WorkbookMergeRange, WorkbookSelectionState } from '@/types';
import { findWorkbookMergeRange } from '@/utils/workbook/workbookMergeLayout';
import { getWorkbookColumnLabel } from '@/utils/workbook/workbookSections';
import { getWorkbookSelectionCount } from '@/utils/workbook/workbookSelectionState';
import {
  resolveWorkbookAccentSurfaceVisual,
  resolveWorkbookAuxBarPalette,
  resolveWorkbookRowSelectionAccent,
} from '@/utils/workbook/workbookRowVisuals';

interface WorkbookFormulaBarProps {
  selection: WorkbookSelectionState;
  fontSize: number;
  baseTitle?: string | undefined;
  mineTitle?: string | undefined;
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

function buildSortedUniqueNumbers(values: number[]): number[] {
  return Array.from(new Set(values)).sort((left, right) => left - right);
}

function isContiguousSequence(values: number[]): boolean {
  if (values.length <= 1) return true;
  for (let index = 1; index < values.length; index += 1) {
    if (values[index] !== values[index - 1]! + 1) return false;
  }
  return true;
}

function formatWorkbookCellRange(
  startRow: number,
  startCol: number,
  endRow: number,
  endCol: number,
): string {
  const start = `${getWorkbookColumnLabel(startCol)}${startRow}`;
  const end = `${getWorkbookColumnLabel(endCol)}${endRow}`;
  return start === end ? start : `${start}:${end}`;
}

function resolveWorkbookSelectionAddress(
  selection: WorkbookSelectionState,
  primarySelection: WorkbookSelectionState['primary'],
  mergeRangeLabel: string,
): string {
  if (!primarySelection) return '—';

  if (primarySelection.kind === 'row') {
    const rows = buildSortedUniqueNumbers(selection.items.map(item => item.rowNumber).filter(rowNumber => rowNumber > 0));
    if (rows.length > 1 && isContiguousSequence(rows)) {
      return `R${rows[0]!}:R${rows[rows.length - 1]!}`;
    }
    return `R${primarySelection.rowNumber}`;
  }

  if (primarySelection.kind === 'column') {
    const columns = buildSortedUniqueNumbers(selection.items.map(item => item.colIndex).filter(column => column >= 0));
    if (columns.length > 1 && isContiguousSequence(columns)) {
      return `${getWorkbookColumnLabel(columns[0]!)}:${getWorkbookColumnLabel(columns[columns.length - 1]!)}`;
    }
    return primarySelection.colLabel;
  }

  const selectedCells = selection.items.filter((item) => (
    item.kind === 'cell'
    && item.sheetName === primarySelection.sheetName
    && item.side === primarySelection.side
  ));
  const rows = buildSortedUniqueNumbers(selectedCells.map(item => item.rowNumber).filter(rowNumber => rowNumber > 0));
  const columns = buildSortedUniqueNumbers(selectedCells.map(item => item.colIndex).filter(column => column >= 0));
  if (rows.length > 0 && columns.length > 0 && isContiguousSequence(rows) && isContiguousSequence(columns)) {
    const cellKeySet = new Set(selectedCells.map(item => `${item.rowNumber}:${item.colIndex}`));
    const expectedCellCount = rows.length * columns.length;
    if (
      cellKeySet.size === expectedCellCount
      && rows.every(rowNumber => columns.every(column => cellKeySet.has(`${rowNumber}:${column}`)))
    ) {
      return formatWorkbookCellRange(rows[0]!, columns[0]!, rows[rows.length - 1]!, columns[columns.length - 1]!);
    }
  }

  return mergeRangeLabel || primarySelection.address || '—';
}

const WorkbookFormulaBar = memo(({
  selection,
  fontSize,
  baseTitle,
  mineTitle,
  freezeState = null,
  mergeRanges = [],
  onFreezeRow,
  onFreezeColumn,
  onFreezePane,
  onUnfreezeRow,
  onUnfreezeColumn,
  onResetFreeze,
}: WorkbookFormulaBarProps) => {
  const T = useThemeTokens();
  const { t } = useI18n();
  const sizes = useMemo(() => getWorkbookFontScale(fontSize), [fontSize]);
  const primarySelection = selection.primary;
  const selectionCount = getWorkbookSelectionCount(selection);
  const resolvedBaseTitle = baseTitle || t('tooltipBaseLabel');
  const resolvedMineTitle = mineTitle || t('tooltipLocalLabel');
  const sideLabel = primarySelection?.kind === 'row'
    ? t('formulaSelectionRow')
    : primarySelection?.kind === 'column'
    ? t('formulaSelectionColumn')
    : primarySelection?.side === 'base'
    ? resolvedBaseTitle
    : primarySelection?.side === 'mine'
    ? resolvedMineTitle
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
  const sideAccent = resolveWorkbookRowSelectionAccent(T, primarySelection?.side === 'base' ? 'base' : 'mine');
  const sideAccentBadge = resolveWorkbookAccentSurfaceVisual(sideAccent);
  const sideAccentButton = resolveWorkbookAccentSurfaceVisual(sideAccent, 'button');
  const freezePalette = resolveWorkbookAuxBarPalette(T, 'mixed');
  const mergeRange = primarySelection?.kind === 'cell'
    ? findWorkbookMergeRange(mergeRanges, primarySelection.rowNumber, primarySelection.colIndex)
    : null;
  const mergeRangeLabel = mergeRange ? formatMergeRange(mergeRange) : '';
  const selectionAddress = resolveWorkbookSelectionAddress(selection, primarySelection, mergeRangeLabel);
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
      className="h-7 px-2.5 rounded-lg whitespace-nowrap font-bold"
      style={{
        border: `1px solid ${active ? sideAccentButton.border : cssVar('border')}`,
        background: active ? sideAccentButton.background : cssVar('bg2'),
        color: active ? sideAccentButton.textColor : cssVar('t0'),
        fontFamily: FONT_UI,
        fontSize: sizes.meta,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
      }}>
      {label}
    </button>
  );

  return (
    <div
      className="grid gap-2 items-stretch px-3 py-2 shrink-0"
      style={{
        gridTemplateColumns: 'auto auto minmax(180px, auto) minmax(0, 1fr) auto',
        borderBottom: `1px solid ${cssVar('border')}`,
        background: `linear-gradient(180deg, ${cssVar('bg1')} 0%, ${cssVar('bg0')} 100%)`,
      }}>
      {/* Address cell */}
      <div
        className="inline-flex items-center justify-center min-w-[96px] h-[30px] px-3 rounded-[10px] font-bold whitespace-nowrap"
        style={{
          border: `1px solid ${cssVar('border')}`,
          background: cssVar('bg2'),
          color: cssVar('t0'),
          fontFamily: FONT_CODE,
          fontSize: sizes.cell,
        }}>
        {selectionAddress}
      </div>

      {/* Side meta chip */}
      <div
        className="inline-flex items-center gap-2 min-w-0 h-[30px] px-3 rounded-[10px] font-semibold"
        style={{
          border: `1px solid ${cssVar('border')}`,
          background: cssVar('bg2'),
          color: cssVar('t0'),
          fontFamily: FONT_UI,
          fontSize: sizes.ui,
        }}>
        <span
          aria-hidden="true"
          className="shrink-0"
          style={{
            width: 8,
            height: 8,
            borderRadius: primarySelection?.side === 'base' ? 2 : '50%',
            transform: primarySelection?.side === 'base' ? 'rotate(45deg)' : undefined,
            background: sideAccent,
          }}
        />
        <span className="overflow-hidden text-ellipsis whitespace-nowrap">{sideMeta}</span>
        {selectionSummary && (
          <span
            className="ml-auto px-2 rounded-full whitespace-nowrap"
            style={{
              padding: '1px 8px',
              background: sideAccentBadge.background,
              color: sideAccentBadge.textColor,
              fontSize: sizes.meta,
              fontWeight: 800,
            }}>
            {selectionSummary}
          </span>
        )}
      </div>

      {/* Merge range */}
      {mergeRangeLabel && (
        <div
          className="inline-flex items-center min-w-[160px] h-[30px] px-3 rounded-[10px] gap-2"
          style={{
            border: `1px solid ${cssVar('border')}`,
            background: cssVar('bg2'),
            color: cssVar('t1'),
            fontFamily: FONT_UI,
            fontSize: sizes.ui,
          }}>
          <span style={{ color: cssVar('t2') }}>{t('formulaMergeLabel')}:</span>
          <span
            className="whitespace-nowrap font-bold"
            style={{ color: cssVar('t0'), fontFamily: FONT_CODE }}>
            {mergeRangeLabel}
          </span>
        </div>
      )}

      {/* Cell value */}
      <div
        className="inline-flex items-center min-w-[180px] h-[30px] px-3 rounded-[10px]"
        style={{
          border: `1px solid ${cssVar('border')}`,
          background: cssVar('bg2'),
          color: cssVar('t1'),
          fontFamily: FONT_UI,
          fontSize: sizes.ui,
        }}>
        <span style={{ color: cssVar('t2') }}>{t('workbookCellValue')}:</span>
        <span
          className="ml-2 overflow-hidden text-ellipsis whitespace-nowrap font-semibold"
          style={{ color: cssVar('t0') }}>
          {primarySelection?.value || t('formulaBarEmptyValue')}
        </span>
      </div>

      {/* Formula bar */}
      <div
        className="flex items-center min-w-0 h-[30px] px-3 rounded-[10px] overflow-hidden"
        style={{
          border: `1px solid ${cssVar('border')}`,
          background: cssVar('bg2'),
        }}>
        <span
          className="shrink-0 font-bold uppercase tracking-wider"
          style={{
            color: cssVar('acc2'),
            fontFamily: FONT_UI,
            fontSize: sizes.meta,
          }}>
          fx
        </span>
        <span
          className="ml-2.5 overflow-hidden text-ellipsis whitespace-nowrap"
          style={{
            fontFamily: FONT_CODE,
            fontSize: sizes.ui,
            color: primarySelection?.formula ? cssVar('t0') : cssVar('t2'),
          }}>
          {primarySelection?.formula || t('formulaBarEmpty')}
        </span>
      </div>

      {/* Freeze actions */}
      <div className="inline-flex items-center gap-2 min-w-0 flex-wrap justify-end">
        <span
          className="whitespace-nowrap"
          style={{
            color: freezePalette.subduedText,
            fontFamily: FONT_UI,
            fontSize: sizes.meta,
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
