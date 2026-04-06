import type { ComponentProps, ReactNode } from 'react';

import type { CompareMode } from '@/hooks/workbook/useWorkbookCompareDerivedState';
import type {
  WorkbookCompareColumnsBodySegment,
  WorkbookCompareStackedBodySegment,
  WorkbookCompareStackedCanvasRun,
} from '@/hooks/workbook/useWorkbookCompareBodyLayout';
import WorkbookActiveRegionOverlayLayer from '@/components/workbook/WorkbookActiveRegionOverlayLayer';
import WorkbookColumnsCanvasStrip from '@/components/workbook/WorkbookColumnsCanvasStrip';
import WorkbookHiddenRowsBar from '@/components/workbook/WorkbookHiddenRowsBar';
import WorkbookSparseGapPlaceholder from '@/components/workbook/WorkbookSparseGapPlaceholder';
import WorkbookStackedCanvasStrip from '@/components/workbook/WorkbookStackedCanvasStrip';

type WorkbookCompareStackedCanvasProps = Omit<ComponentProps<typeof WorkbookStackedCanvasStrip>, 'groups'>;
type WorkbookCompareColumnsCanvasProps = Omit<ComponentProps<typeof WorkbookColumnsCanvasStrip>, 'rows'>;
type WorkbookCompareOverlayProps = ComponentProps<typeof WorkbookActiveRegionOverlayLayer>;

interface WorkbookCompareBodyProps {
  mode: CompareMode;
  topOffset: number;
  minBodyWidth: number;
  viewportWidth: number;
  pinnedCollapseWidth: number | string;
  stackedSegments: WorkbookCompareStackedBodySegment[];
  stackedCanvasRuns: WorkbookCompareStackedCanvasRun[];
  columnsSegments: WorkbookCompareColumnsBodySegment[] | null;
  stackedCanvasProps: WorkbookCompareStackedCanvasProps;
  columnsCanvasProps: WorkbookCompareColumnsCanvasProps;
  overlayProps: WorkbookCompareOverlayProps;
  renderPinnedCollapseBar: (count: number, expandCount: number, onExpand: () => void, onExpandAll: () => void) => ReactNode;
  onExpandCollapseBlock: (
    blockId: string,
    hiddenStart: number,
    hiddenEnd: number,
    revealCount: number,
    mode?: 'partial' | 'full',
  ) => void;
  onRevealHiddenRows: (rowNumbers: number[]) => void;
}

function renderHiddenRowsBar({
  key,
  top,
  count,
  minBodyWidth,
  pinnedCollapseWidth,
  onReveal,
}: {
  key: string;
  top: number;
  count: number;
  minBodyWidth: number;
  pinnedCollapseWidth: number | string;
  onReveal: () => void;
}) {
  return (
    <div key={key} style={{ position: 'absolute', top, left: 0, minWidth: minBodyWidth }}>
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
          count={count}
          onReveal={onReveal}
        />
      </div>
    </div>
  );
}

export default function WorkbookCompareBody({
  mode,
  topOffset,
  minBodyWidth,
  viewportWidth,
  pinnedCollapseWidth,
  stackedSegments,
  stackedCanvasRuns,
  columnsSegments,
  stackedCanvasProps,
  columnsCanvasProps,
  overlayProps,
  renderPinnedCollapseBar,
  onExpandCollapseBlock,
  onRevealHiddenRows,
}: WorkbookCompareBodyProps) {
  return (
    <>
      <div style={{ position: 'absolute', top: topOffset, left: 0, minWidth: minBodyWidth }}>
        {mode === 'stacked' ? (
          <>
            {stackedSegments.map((segment) => {
              if (segment.kind === 'collapse') {
                return (
                  <div key={`collapse-${segment.item.blockId}-${segment.item.hiddenStart}-${segment.item.hiddenEnd}`} style={{ position: 'absolute', top: segment.top, left: 0, minWidth: minBodyWidth }}>
                    {renderPinnedCollapseBar(
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
                    )}
                  </div>
                );
              }

              if (segment.kind === 'hidden-rows') {
                return renderHiddenRowsBar({
                  key: `hidden-rows-${segment.item.rowNumbers.join('-') || segment.top}`,
                  top: segment.top,
                  count: segment.item.count,
                  minBodyWidth,
                  pinnedCollapseWidth,
                  onReveal: () => onRevealHiddenRows(segment.item.rowNumbers),
                });
              }

              if (segment.kind === 'sparse-gap') {
                return (
                  <div
                    key={`sparse-gap-${segment.item.rowNumberStart}-${segment.item.rowNumberEnd}`}
                    style={{
                      position: 'absolute',
                      top: segment.top,
                      left: 0,
                      right: 0,
                      minWidth: minBodyWidth,
                      height: segment.height,
                    }}>
                    <div style={{ position: 'sticky', left: 0, width: viewportWidth, overflow: 'hidden', height: '100%' }}>
                      <WorkbookSparseGapPlaceholder
                        count={segment.item.count}
                        rowNumberStart={segment.item.rowNumberStart}
                        rowNumberEnd={segment.item.rowNumberEnd}
                      />
                    </div>
                  </div>
                );
              }

              return null;
            })}
            {stackedCanvasRuns.map((run) => (
              <div
                key={run.key}
                style={{
                  position: 'absolute',
                  top: run.top,
                  left: 0,
                  right: 0,
                  minWidth: minBodyWidth,
                  height: run.height,
                }}>
                <div style={{ position: 'sticky', left: 0, width: viewportWidth, overflow: 'hidden' }}>
                  <WorkbookStackedCanvasStrip
                    {...stackedCanvasProps}
                    groups={run.groups}
                  />
                </div>
              </div>
            ))}
          </>
        ) : (
          (columnsSegments ?? []).map((segment) => {
            if (segment.kind === 'collapse') {
              return (
                <div key={`collapse-${segment.item.blockId}-${segment.item.hiddenStart}-${segment.item.hiddenEnd}`} style={{ position: 'absolute', top: segment.top, left: 0, minWidth: minBodyWidth }}>
                  {renderPinnedCollapseBar(
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
                  )}
                </div>
              );
            }

            if (segment.kind === 'hidden-rows') {
              return renderHiddenRowsBar({
                key: `hidden-rows-${segment.item.rowNumbers.join('-') || segment.top}`,
                top: segment.top,
                count: segment.item.count,
                minBodyWidth,
                pinnedCollapseWidth,
                onReveal: () => onRevealHiddenRows(segment.item.rowNumbers),
              });
            }

            if (segment.kind === 'sparse-gap') {
              return (
                <div
                  key={`sparse-gap-${segment.item.rowNumberStart}-${segment.item.rowNumberEnd}`}
                  style={{
                    position: 'absolute',
                    top: segment.top,
                    left: 0,
                    right: 0,
                    minWidth: minBodyWidth,
                    height: segment.height,
                  }}>
                  <div style={{ position: 'sticky', left: 0, width: viewportWidth, overflow: 'hidden', height: '100%' }}>
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
                key={`columns-canvas-${segment.rows[0]?.row.lineIdx ?? segment.top}-${segment.rows[segment.rows.length - 1]?.row.lineIdx ?? segment.height}`}
                style={{
                  position: 'absolute',
                  top: segment.top,
                  left: 0,
                  right: 0,
                  minWidth: minBodyWidth,
                  height: segment.height,
                }}>
                <div style={{ position: 'sticky', left: 0, width: viewportWidth, overflow: 'hidden' }}>
                  <WorkbookColumnsCanvasStrip
                    {...columnsCanvasProps}
                    rows={segment.rows}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
      <WorkbookActiveRegionOverlayLayer {...overlayProps} />
    </>
  );
}
