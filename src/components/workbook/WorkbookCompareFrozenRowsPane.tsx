import type { RefObject } from 'react';

import { FONT_UI } from '@/constants/typography';
import { useI18n } from '@/context/i18n';
import { cssVar } from '@/theme/cssUtils';
import type { HorizontalVirtualColumnEntry } from '@/hooks/virtualization/useHorizontalVirtualColumns';
import type { FrozenStackedCanvasRun } from '@/hooks/workbook/useWorkbookFrozenPaneState';
import type { CompareMode } from '@/hooks/workbook/useWorkbookCompareDerivedState';
import type {
  WorkbookCompareCellsMaps,
  WorkbookRowEntryMaps,
} from '@/utils/workbook/workbookPanelHelpers';
import type {
  WorkbookCompareMode,
  WorkbookMergeRange,
  WorkbookSelectionRequest,
  WorkbookSelectionState,
} from '@/types';
import type { WorkbookColumnsCanvasRow } from '@/components/workbook/WorkbookColumnsCanvasStrip';
import type { WorkbookCanvasHoverCell } from '@/components/workbook/WorkbookCanvasHoverTooltip';
import WorkbookColumnsCanvasStrip from '@/components/workbook/WorkbookColumnsCanvasStrip';
import WorkbookStackedCanvasStrip from '@/components/workbook/WorkbookStackedCanvasStrip';

interface WorkbookCompareFrozenRowsPaneProps {
  frozenRowsScrollRef: RefObject<HTMLDivElement | null>;
  isHovered: boolean;
  onHoverEnter: () => void;
  onHoverLeave: () => void;
  frozenRowsViewportHeight: number;
  frozenRowsViewportIsOverflowing: boolean;
  frozenRowsRangeLabel: string;
  frozenRowsHeight: number;
  minBodyWidth: number;
  mode: CompareMode;
  frozenRowsWindowOffsetTop: number;
  visibleFrozenStackedCanvasRuns: FrozenStackedCanvasRun[];
  visibleFrozenColumnsCanvasRows: WorkbookColumnsCanvasRow[];
  visibleFrozenColumnsCanvasHeight: number;
  viewportWidth: number;
  scrollRef: RefObject<HTMLDivElement | null>;
  freezeColumnCount: number;
  contentWidth: number;
  sheetName: string;
  baseVersion: string;
  mineVersion: string;
  headerRowNumber: number;
  selection: WorkbookSelectionState;
  onSelectionRequest: (request: WorkbookSelectionRequest) => void;
  onHoverChange: (hover: WorkbookCanvasHoverCell | null) => void;
  fontSize: number;
  visibleColumns: number[];
  renderColumns: HorizontalVirtualColumnEntry[];
  columnLayoutByColumn: Map<number, HorizontalVirtualColumnEntry>;
  baseMergedRanges: ReadonlyArray<WorkbookMergeRange>;
  mineMergedRanges: ReadonlyArray<WorkbookMergeRange>;
  rowEntryByRowNumber: WorkbookRowEntryMaps;
  compareCellsByRowNumber: WorkbookCompareCellsMaps;
  compareMode: WorkbookCompareMode;
}

export default function WorkbookCompareFrozenRowsPane({
  frozenRowsScrollRef,
  isHovered,
  onHoverEnter,
  onHoverLeave,
  frozenRowsViewportHeight,
  frozenRowsViewportIsOverflowing,
  frozenRowsRangeLabel,
  frozenRowsHeight,
  minBodyWidth,
  mode,
  frozenRowsWindowOffsetTop,
  visibleFrozenStackedCanvasRuns,
  visibleFrozenColumnsCanvasRows,
  visibleFrozenColumnsCanvasHeight,
  viewportWidth,
  scrollRef,
  freezeColumnCount,
  contentWidth,
  sheetName,
  baseVersion,
  mineVersion,
  headerRowNumber,
  selection,
  onSelectionRequest,
  onHoverChange,
  fontSize,
  visibleColumns,
  renderColumns,
  columnLayoutByColumn,
  baseMergedRanges,
  mineMergedRanges,
  rowEntryByRowNumber,
  compareCellsByRowNumber,
  compareMode,
}: WorkbookCompareFrozenRowsPaneProps) {
  const { t } = useI18n();
  if (frozenRowsViewportHeight <= 0) return null;
  const showStatusBadge = frozenRowsViewportIsOverflowing;

  return (
    <div
      ref={frozenRowsScrollRef}
      onMouseEnter={onHoverEnter}
      onMouseLeave={onHoverLeave}
      style={{
        position: 'relative',
        height: frozenRowsViewportHeight,
        overflowY: frozenRowsViewportIsOverflowing ? 'auto' : 'hidden',
        overflowX: 'hidden',
        overflowAnchor: 'none',
        background: cssVar('bg1'),
        borderRadius: 12,
        boxShadow: isHovered
          ? `inset 0 0 0 1px ${cssVar('acc')}, 0 0 0 1px color-mix(in srgb, ${cssVar('acc')} 13%, transparent)`
          : `inset 0 0 0 1px ${cssVar('border')}`,
      }}>
      {showStatusBadge && (
        <div
          style={{
            position: 'sticky',
            top: 6,
            zIndex: 5,
            display: 'flex',
            justifyContent: 'flex-end',
            paddingRight: 8,
            pointerEvents: 'none',
          }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '4px 8px',
              borderRadius: 999,
              border: `1px solid ${isHovered ? cssVar('acc') : cssVar('border')}`,
              background: isHovered ? cssVar('bg0') : cssVar('bg2'),
              color: isHovered ? cssVar('acc2') : cssVar('t1'),
              boxShadow: isHovered ? `0 6px 18px -16px ${cssVar('acc')}` : undefined,
              fontFamily: FONT_UI,
              fontSize: 11,
              lineHeight: 1.2,
              fontWeight: 700,
            }}>
            <span>{t('workbookFrozenRowsWindowLabel')}</span>
            <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace' }}>{frozenRowsRangeLabel}</span>
            <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace', opacity: 0.82 }}>
              {t(frozenRowsViewportIsOverflowing ? 'commonOverflow' : 'commonFit')} · {frozenRowsViewportHeight}px/{frozenRowsHeight}px
            </span>
          </div>
        </div>
      )}
      <div style={{ position: 'relative', minWidth: contentWidth, height: frozenRowsHeight }}>
        {mode === 'stacked' ? (
          <div style={{ position: 'absolute', top: frozenRowsWindowOffsetTop, left: 0, minWidth: minBodyWidth }}>
            {visibleFrozenStackedCanvasRuns.map((run) => (
              <div
                key={`frozen-${run.key}`}
                style={{
                  position: 'absolute',
                  top: run.top,
                  left: 0,
                  right: 0,
                  minWidth: minBodyWidth,
                  height: run.height,
                }}>
                <div style={{ width: viewportWidth, overflow: 'hidden' }}>
                  <WorkbookStackedCanvasStrip
                    groups={run.groups}
                    viewportWidth={viewportWidth}
                    scrollRef={scrollRef}
                    freezeColumnCount={freezeColumnCount}
                    contentWidth={contentWidth}
                    sheetName={sheetName}
                    baseVersion={baseVersion}
                    mineVersion={mineVersion}
                    headerRowNumber={headerRowNumber}
                    selection={selection}
                    onSelectionRequest={onSelectionRequest}
                    onHoverChange={onHoverChange}
                    fontSize={fontSize}
                    visibleColumns={visibleColumns}
                    renderColumns={renderColumns}
                    columnLayoutByColumn={columnLayoutByColumn}
                    baseMergedRanges={baseMergedRanges}
                    mineMergedRanges={mineMergedRanges}
                    compareMode={compareMode}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          visibleFrozenColumnsCanvasRows.length > 0 && (
            <div
              style={{
                position: 'absolute',
                top: frozenRowsWindowOffsetTop,
                left: 0,
                right: 0,
                minWidth: minBodyWidth,
                height: visibleFrozenColumnsCanvasHeight,
              }}>
              <div style={{ width: viewportWidth, overflow: 'hidden' }}>
                <WorkbookColumnsCanvasStrip
                  rows={visibleFrozenColumnsCanvasRows}
                  viewportWidth={viewportWidth}
                  scrollRef={scrollRef}
                  freezeColumnCount={freezeColumnCount}
                  contentWidth={contentWidth}
                  sheetName={sheetName}
                  baseVersion={baseVersion}
                  mineVersion={mineVersion}
                  headerRowNumber={headerRowNumber}
                  selection={selection}
                  onSelectionRequest={onSelectionRequest}
                  onHoverChange={onHoverChange}
                  fontSize={fontSize}
                  visibleColumns={visibleColumns}
                  renderColumns={renderColumns}
                  columnLayoutByColumn={columnLayoutByColumn}
                  baseMergedRanges={baseMergedRanges}
                  mineMergedRanges={mineMergedRanges}
                  baseRowEntryByRowNumber={rowEntryByRowNumber.base}
                  mineRowEntryByRowNumber={rowEntryByRowNumber.mine}
                  baseCompareCellsByRowNumber={compareCellsByRowNumber.base}
                  mineCompareCellsByRowNumber={compareCellsByRowNumber.mine}
                  compareMode={compareMode}
                />
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}
