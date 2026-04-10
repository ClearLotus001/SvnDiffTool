import { memo, useMemo, useRef } from 'react';
import { useI18n } from '@/context/i18n';
import useElementWidth from '@/hooks/ui/useElementWidth';
import { cssVar } from '@/theme/cssUtils';
import { copyText } from '@/utils/app/clipboard';
import { clearWorkbookDebugLogs, getWorkbookDebugLogSnapshot } from '@/utils/workbook/workbookDebug';

export interface WorkbookPerfDebugStats {
  panel: 'stacked' | 'columns' | 'horizontal';
  sheetName: string;
  totalRows: number;
  renderedRows: number;
  collapseBlocks: number;
  totalColumns: number;
  renderedColumns: number;
  frozenRows: number;
  frozenColumns: number;
  buildItemsMs: number;
  collapseBuildMs: number;
  hiddenOverlayMs: number;
  hiddenRows: number;
  miniMapMs: number;
  rowWindowMs: number;
  rowWindowUpdates: number;
  rowOverscan: number;
  rowViewport: number;
  columnWindowMs: number;
  columnWindowUpdates: number;
  columnOverscan: number;
  columnViewport: number;
  miniMapClickMs: number;
  miniMapClickCount: number;
  scrollSyncCount: number;
  frozenRowsViewport: number;
  frozenRowsTotalSize: number;
  frozenRowsOverflow: boolean;
  frozenColumnsViewport: number;
  frozenColumnsTotalSize: number;
  frozenColumnsOverflow: boolean;
  frozenColumnsScrollLeft: number;
}

interface WorkbookPerfDebugPanelProps {
  stats: WorkbookPerfDebugStats;
}

const SCROLL_RAIL_CLASS = 'overflow-x-auto overflow-y-hidden [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden';
const PERF_PANEL_LABEL_KEYS = {
  stacked: 'perfUiPanelStacked',
  columns: 'perfUiPanelColumns',
  horizontal: 'perfUiPanelHorizontal',
} as const;

const WorkbookPerfDebugPanel = memo(({ stats }: WorkbookPerfDebugPanelProps) => {
  const { t } = useI18n();
  const rootRef = useRef<HTMLDivElement>(null);
  const containerWidth = useElementWidth(rootRef, 1440);
  const layoutMode = useMemo(() => (containerWidth < 1180 ? 'stacked' : 'inline'), [containerWidth]);
  const pinActionsRight = layoutMode === 'inline' && containerWidth >= 1560;
  const copyLabel = t('perfCopyLog');
  const clearLabel = t('perfClearLog');
  const viewportStatusLabel = t(stats.frozenRowsOverflow ? 'commonOverflow' : 'commonFit');
  const frozenColumnsStatusLabel = t(stats.frozenColumnsOverflow ? 'commonOverflow' : 'commonFit');
  const panelSummary = `${t(PERF_PANEL_LABEL_KEYS[stats.panel])} · ${stats.sheetName || '—'}`;

  const chip = (label: string, value: string, accent = cssVar('acc2')) => (
    <div className="inline-flex items-center gap-1.5 py-0.5 px-2 rounded-full border border-border-default bg-bg-surface-hover min-w-0 shrink-0 whitespace-nowrap">
      <span className="size-1.5 rounded-full shrink-0" aria-hidden="true" style={{ background: accent }} />
      <span className="font-ui text-[11px] text-text-secondary font-bold">{label}</span>
      <span className="font-code text-[11px] text-text-title font-bold">{value}</span>
    </div>
  );

  const formatMs = (value: number) => `${value.toFixed(value >= 100 ? 0 : 1)}ms`;

  const actionButtons = (
    <>
      <button
        type="button"
        onClick={() => { void copyText(getWorkbookDebugLogSnapshot()); }}
        className="rounded-full py-1 px-2.5 font-ui text-[11px] font-bold cursor-pointer shrink-0 whitespace-nowrap transition-all duration-150 hover:-translate-y-px"
        style={{
          border: `1px solid ${cssVar('border')}`,
          background: cssVar('bg2'),
          color: cssVar('t0'),
        }}>
        {copyLabel}
      </button>
      <button
        type="button"
        onClick={() => clearWorkbookDebugLogs()}
        className="rounded-full py-1 px-2.5 font-ui text-[11px] font-bold cursor-pointer shrink-0 whitespace-nowrap transition-all duration-150 hover:-translate-y-px"
        style={{
          border: `1px solid ${cssVar('border')}`,
          background: cssVar('bg2'),
          color: cssVar('t0'),
        }}>
        {clearLabel}
      </button>
    </>
  );

  const rail = (
    <div className={`flex-1 min-w-0 ${SCROLL_RAIL_CLASS}`}>
      <div className="inline-flex items-center gap-2 min-w-max pr-1">
        {chip(t('perfUiRows'), `${stats.renderedRows}/${stats.totalRows}`, cssVar('acc'))}
        {chip(t('perfUiCols'), `${stats.renderedColumns}/${stats.totalColumns}`, cssVar('acc2'))}
        {chip(t('perfUiFreeze'), t('perfUiFreezeValue', { rows: stats.frozenRows, cols: stats.frozenColumns }), cssVar('acc'))}
        {chip(t('perfUiCollapse'), String(stats.collapseBlocks), cssVar('acc2'))}
        {chip(t('perfUiBuildItems'), formatMs(stats.buildItemsMs), cssVar('acc'))}
        {chip(t('perfUiCollapseBuild'), formatMs(stats.collapseBuildMs), cssVar('acc2'))}
        {chip(t('perfUiHiddenOverlay'), `${formatMs(stats.hiddenOverlayMs)} · ${stats.hiddenRows}`, cssVar('acc'))}
        {chip(t('perfUiMiniMap'), formatMs(stats.miniMapMs), cssVar('acc2'))}
        {chip(t('perfUiMiniMapClick'), `${formatMs(stats.miniMapClickMs)} · ${stats.miniMapClickCount}`, cssVar('acc'))}
        {chip(t('perfUiRowWindow'), `${formatMs(stats.rowWindowMs)} · ${stats.rowWindowUpdates}`, cssVar('acc'))}
        {chip(t('perfUiRowViewport'), `${stats.rowViewport}px · ${stats.rowOverscan}`, cssVar('acc2'))}
        {chip(t('perfUiFrozenRows'), `${viewportStatusLabel} · ${stats.frozenRowsViewport}px/${stats.frozenRowsTotalSize}px`, cssVar('acc'))}
        {chip(t('perfUiColWindow'), `${formatMs(stats.columnWindowMs)} · ${stats.columnWindowUpdates}`, cssVar('acc'))}
        {chip(t('perfUiColViewport'), `${stats.columnViewport}px · ${stats.columnOverscan}`, cssVar('acc2'))}
        {chip(t('perfUiFrozenCols'), `${frozenColumnsStatusLabel} · ${stats.frozenColumnsViewport}px/${stats.frozenColumnsTotalSize}px`, cssVar('acc2'))}
        {chip(t('perfUiFrozenColScroll'), `${stats.frozenColumnsScrollLeft}px`, cssVar('acc'))}
        {chip(t('perfUiScrollSync'), String(stats.scrollSyncCount), cssVar('acc'))}
        {!pinActionsRight && actionButtons}
      </div>
    </div>
  );

  return (
    <div
      ref={rootRef}
      className="border-b border-border-default shrink-0 bg-bg-surface-solid overflow-hidden">
      {layoutMode === 'stacked' ? (
        <div className="grid gap-2 py-1.5 px-3">
          <div className="flex items-start justify-between gap-3 min-w-0">
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="font-ui text-[13px] text-text-title font-bold">{t('perfUiTitle')}</span>
              <span className="font-code text-[11px] text-text-secondary whitespace-nowrap overflow-hidden text-ellipsis">
                {panelSummary}
              </span>
            </div>
            <div className="inline-flex items-center gap-2 shrink-0">
              {actionButtons}
            </div>
          </div>
          {rail}
        </div>
      ) : (
        <div className="flex items-center gap-3 py-1.5 px-3 min-w-0">
          <div className="flex flex-col gap-0.5 shrink-0 min-w-[140px]">
            <span className="font-ui text-[13px] text-text-title font-bold">{t('perfUiTitle')}</span>
            <span className="font-code text-[11px] text-text-secondary whitespace-nowrap overflow-hidden text-ellipsis max-w-[180px]">
              {panelSummary}
            </span>
          </div>
          {rail}
          {pinActionsRight && (
            <div className="inline-flex items-center gap-2 shrink-0">
              {actionButtons}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

export default WorkbookPerfDebugPanel;
