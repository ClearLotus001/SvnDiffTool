import type { ReactNode, RefObject } from 'react';

import { FONT_UI } from '@/constants/typography';
import { useI18n } from '@/context/i18n';
import { cssVar } from '@/theme/cssUtils';
import type { WorkbookHorizontalBodySegment } from '@/hooks/workbook/useWorkbookHorizontalBodyLayout';
import type {
  WorkbookHorizontalPaneRenderSideProps,
} from '@/hooks/workbook/useWorkbookHorizontalPaneRenderProps';
import type {
  WorkbookHorizontalPaneSide,
  WorkbookHorizontalStickyRenderSideProps,
} from '@/hooks/workbook/useWorkbookHorizontalStickyRenderProps';
import type { WorkbookPaneCanvasRow } from '@/components/workbook/WorkbookPaneCanvasStrip';
import WorkbookCanvasHeaderStrip from '@/components/workbook/WorkbookCanvasHeaderStrip';
import WorkbookActiveRegionOverlayLayer from '@/components/workbook/WorkbookActiveRegionOverlayLayer';
import WorkbookPaneCanvasStrip from '@/components/workbook/WorkbookPaneCanvasStrip';
import WorkbookHiddenRowsBar from '@/components/workbook/WorkbookHiddenRowsBar';
import WorkbookHorizontalPane from '@/components/workbook/WorkbookHorizontalPane';
import WorkbookSparseGapPlaceholder from '@/components/workbook/WorkbookSparseGapPlaceholder';

interface WorkbookHorizontalRenderPaneProps {
  paneRef: RefObject<HTMLDivElement | null>;
  onScroll: () => void;
  sheetRenderKey: string;
  contentWidth: number;
  contentHeight: number;
  stickyHeaderHeight: number;
  side: WorkbookHorizontalPaneSide;
  stickyRenderProps: WorkbookHorizontalStickyRenderSideProps;
  paneRenderProps: WorkbookHorizontalPaneRenderSideProps;
  hasFrozenRows: boolean;
  frozenRowsViewportHeight: number;
  frozenRowsViewportIsOverflowing: boolean;
  frozenRowsHeight: number;
  visibleFrozenCanvasOffsetTop: number;
  visibleFrozenCanvasHeight: number;
  visibleFrozenCanvasRows: WorkbookPaneCanvasRow[];
  onFrozenRowsScroll: () => void;
  onFrozenRowsMouseEnter: () => void;
  onFrozenRowsMouseLeave: () => void;
  bodySegments: WorkbookHorizontalBodySegment[];
  renderPinnedCollapseBar: (width: number | string, count: number, expandCount: number, onExpand: () => void, onExpandAll: () => void, sourceItemIndex: number) => ReactNode;
  onExpandCollapseBlock: (
    blockId: string,
    hiddenStart: number,
    hiddenEnd: number,
    revealCount: number,
    mode?: 'partial' | 'full',
  ) => void;
  onRevealHiddenRows: (rowNumbers: number[]) => void;
}

export default function WorkbookHorizontalRenderPane({
  paneRef,
  onScroll,
  sheetRenderKey,
  contentWidth,
  contentHeight,
  stickyHeaderHeight,
  side,
  stickyRenderProps,
  paneRenderProps,
  hasFrozenRows,
  frozenRowsViewportHeight,
  frozenRowsViewportIsOverflowing,
  frozenRowsHeight,
  visibleFrozenCanvasOffsetTop,
  visibleFrozenCanvasHeight,
  visibleFrozenCanvasRows,
  onFrozenRowsScroll,
  onFrozenRowsMouseEnter,
  onFrozenRowsMouseLeave,
  bodySegments,
  renderPinnedCollapseBar,
  onExpandCollapseBlock,
  onRevealHiddenRows,
}: WorkbookHorizontalRenderPaneProps) {
  const { t } = useI18n();
  const {
    paneViewportWidth,
    pinnedCollapseWidth,
    frozenRowsScrollerRef,
    isFrozenRowsPaneHovered,
    frozenRowsRangeLabel,
    stickyHeaderRowsHeight,
    headerCanvasRows,
    headerProps,
    frozenCanvasProps,
  } = stickyRenderProps;
  const showFrozenRowsStatusBadge = frozenRowsViewportIsOverflowing;

  return (
    <WorkbookHorizontalPane
      paneRef={paneRef}
      onScroll={onScroll}
      sheetRenderKey={sheetRenderKey}
      contentWidth={contentWidth}
      contentHeight={contentHeight}
      stickyHeaderHeight={stickyHeaderHeight}
      stickyRegion={(
        <>
        <div style={{ position: 'sticky', left: 0, width: paneViewportWidth, overflow: 'hidden' }}>
          <WorkbookCanvasHeaderStrip {...headerProps} />
        </div>
          {stickyHeaderRowsHeight > 0 && (
            <div style={{ position: 'sticky', left: 0, width: paneViewportWidth, overflow: 'hidden', height: stickyHeaderRowsHeight }}>
              <WorkbookPaneCanvasStrip
                {...frozenCanvasProps}
                rows={headerCanvasRows}
              />
            </div>
          )}
          {hasFrozenRows && (
            <div
              style={{
                position: 'sticky',
                left: 0,
                width: paneViewportWidth,
                overflow: 'hidden',
              }}>
              <div
                ref={frozenRowsScrollerRef}
                onScroll={onFrozenRowsScroll}
                onMouseEnter={onFrozenRowsMouseEnter}
                onMouseLeave={onFrozenRowsMouseLeave}
                style={{
                  position: 'relative',
                  height: frozenRowsViewportHeight,
                  overflowY: frozenRowsViewportIsOverflowing ? 'auto' : 'hidden',
                  overflowX: 'hidden',
                  overflowAnchor: 'none',
                background: cssVar('bg1'),
                  borderRadius: 12,
                  boxShadow: isFrozenRowsPaneHovered
                    ? `inset 0 0 0 1px ${cssVar('acc')}, 0 0 0 1px ${cssVar('acc')}22`
                    : `inset 0 0 0 1px ${cssVar('border')}`,
                }}>
                {showFrozenRowsStatusBadge && (
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
                        border: `1px solid ${isFrozenRowsPaneHovered ? cssVar('acc') : cssVar('border')}`,
                        background: isFrozenRowsPaneHovered ? cssVar('bg0') : cssVar('bg2'),
                        color: isFrozenRowsPaneHovered ? cssVar('acc2') : cssVar('t1'),
                        boxShadow: isFrozenRowsPaneHovered ? `0 6px 18px -16px ${cssVar('acc')}` : undefined,
                        fontFamily: FONT_UI,
                        fontSize: 11,
                        lineHeight: 1.2,
                        fontWeight: 700,
                      }}>
                      <span>{side === 'left' ? t('workbookFrozenRowsWindowLabelLeft') : t('workbookFrozenRowsWindowLabelRight')}</span>
                      <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace' }}>{frozenRowsRangeLabel}</span>
                      <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace', opacity: 0.82 }}>
                        {t(frozenRowsViewportIsOverflowing ? 'commonOverflow' : 'commonFit')} · {frozenRowsViewportHeight}px/{frozenRowsHeight}px
                      </span>
                    </div>
                  </div>
                )}
                <div style={{ position: 'relative', minWidth: contentWidth, height: frozenRowsHeight }}>
                  <div
                    style={{
                      position: 'absolute',
                      top: visibleFrozenCanvasOffsetTop,
                      left: 0,
                      right: 0,
                      minWidth: '100%',
                      height: visibleFrozenCanvasHeight,
                    }}>
                    <div style={{ width: paneViewportWidth, overflow: 'hidden' }}>
                      <WorkbookPaneCanvasStrip
                        {...frozenCanvasProps}
                        rows={visibleFrozenCanvasRows}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
      bodyContent={(
        <>
          {bodySegments.map((segment) => {
            if (segment.kind === 'collapse') {
              const sourceItemIndex = 'sourceItemIndex' in segment && typeof segment.sourceItemIndex === 'number'
                ? segment.sourceItemIndex
                : -1;

              return (
                <div key={`${side}-collapse-${segment.item.blockId}-${segment.item.hiddenStart}-${segment.item.hiddenEnd}`} style={{ position: 'absolute', top: segment.top, left: 0, minWidth: '100%' }}>
                  {renderPinnedCollapseBar(
                    pinnedCollapseWidth,
                    segment.item.count,
                    Math.min(segment.item.count, segment.item.expandStep),
                    () => onExpandCollapseBlock(
                      segment.item.blockId,
                      segment.item.hiddenStart,
                      segment.item.hiddenEnd,
                      Math.min(segment.item.count, segment.item.expandStep),
                    ),
                    () => onExpandCollapseBlock(
                      segment.item.blockId,
                      segment.item.hiddenStart,
                      segment.item.hiddenEnd,
                      segment.item.count,
                      'full',
                    ),
                    sourceItemIndex,
                  )}
                </div>
              );
            }

            if (segment.kind === 'hidden-rows') {
              return (
                <div key={`${side}-hidden-${segment.item.rowNumbers.join('-') || segment.top}`} style={{ position: 'absolute', top: segment.top, left: 0, minWidth: '100%' }}>
                  <div
                    style={{
                      position: 'sticky',
                      left: 0,
                      width: pinnedCollapseWidth,
                      minWidth: pinnedCollapseWidth,
                      overflow: 'hidden',
                      zIndex: 5,
                    }}>
                    <WorkbookHiddenRowsBar
                      count={segment.item.count}
                      onReveal={() => onRevealHiddenRows(segment.item.rowNumbers)}
                    />
                  </div>
                </div>
              );
            }

            if (segment.kind === 'sparse-gap') {
              return (
                <div
                  key={`${side}-sparse-gap-${segment.item.rowNumberStart}-${segment.item.rowNumberEnd}`}
                  style={{
                    position: 'absolute',
                    top: segment.top,
                    left: 0,
                    right: 0,
                    minWidth: '100%',
                    height: segment.height,
                  }}>
                  <div style={{ position: 'sticky', left: 0, width: paneViewportWidth, overflow: 'hidden', height: '100%' }}>
                    <WorkbookSparseGapPlaceholder
                      count={segment.item.count}
                      rowNumberStart={segment.item.rowNumberStart}
                      rowNumberEnd={segment.item.rowNumberEnd}
                    />
                  </div>
                </div>
              );
            }

            return (
              <div
                key={`${side}-canvas-${segment.rows[0]?.row.lineIdx ?? segment.top}-${segment.rows[segment.rows.length - 1]?.row.lineIdx ?? segment.height}`}
                style={{
                  position: 'absolute',
                  top: segment.top,
                  left: 0,
                  right: 0,
                  minWidth: '100%',
                  height: segment.height,
                }}>
                <div style={{ position: 'sticky', left: 0, width: paneViewportWidth, overflow: 'hidden' }}>
                  <WorkbookPaneCanvasStrip
                    {...paneRenderProps.bodyCanvasProps}
                    rows={segment.rows}
                  />
                </div>
              </div>
            );
          })}
        </>
      )}
      overlayContent={(
        <WorkbookActiveRegionOverlayLayer {...paneRenderProps.overlayProps} />
      )}
    />
  );
}
