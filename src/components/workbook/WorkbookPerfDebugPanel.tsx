import { memo } from 'react';
import { useI18n } from '@/context/i18n';
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

const WorkbookPerfDebugPanel = memo(({ stats }: WorkbookPerfDebugPanelProps) => {
  const { t } = useI18n();

  const chip = (label: string, value: string, accent = cssVar('acc2')) => (
    <div className="inline-flex items-center gap-1.5 py-0.5 px-2 rounded-full border border-border-default bg-bg-surface-hover min-w-0">
      <span className="size-1.5 rounded-full shrink-0" aria-hidden="true" style={{ background: accent }} />
      <span className="font-ui text-[11px] text-text-secondary font-bold">{label}</span>
      <span className="font-code text-[11px] text-text-title font-bold">{value}</span>
    </div>
  );

  const formatMs = (value: number) => `${value.toFixed(value >= 100 ? 0 : 1)}ms`;

  return (
    <div className="flex items-center gap-2 py-1.5 px-3 border-b border-border-default shrink-0 overflow-x-auto bg-bg-surface-solid">
      <div className="flex flex-col gap-0.5 min-w-[140px]">
        <span className="font-ui text-[13px] text-text-title font-bold">{t('perfUiTitle')}</span>
        <span className="font-code text-[11px] text-text-secondary">{stats.panel} · {stats.sheetName || '—'}</span>
      </div>

      {chip(t('perfUiRows'), `${stats.renderedRows}/${stats.totalRows}`, cssVar('acc'))}
      {chip(t('perfUiCols'), `${stats.renderedColumns}/${stats.totalColumns}`, cssVar('acc2'))}
      {chip(t('perfUiFreeze'), `${stats.frozenRows}R · ${stats.frozenColumns}C`, cssVar('acc'))}
      {chip(t('perfUiCollapse'), String(stats.collapseBlocks), cssVar('acc2'))}
      {chip(t('perfUiBuildItems'), formatMs(stats.buildItemsMs), cssVar('acc'))}
      {chip(t('perfUiCollapseBuild'), formatMs(stats.collapseBuildMs), cssVar('acc2'))}
      {chip(t('perfUiHiddenOverlay'), `${formatMs(stats.hiddenOverlayMs)} · ${stats.hiddenRows}`, cssVar('acc'))}
      {chip(t('perfUiMiniMap'), formatMs(stats.miniMapMs), cssVar('acc2'))}
      {chip(t('perfUiMiniMapClick'), `${formatMs(stats.miniMapClickMs)} · ${stats.miniMapClickCount}`, cssVar('acc'))}
      {chip(t('perfUiRowWindow'), `${formatMs(stats.rowWindowMs)} · ${stats.rowWindowUpdates}`, cssVar('acc'))}
      {chip(t('perfUiRowViewport'), `${stats.rowViewport}px · ${stats.rowOverscan}`, cssVar('acc2'))}
      {chip('FrozenRows', `${stats.frozenRowsOverflow ? 'overflow' : 'fit'} · ${stats.frozenRowsViewport}px/${stats.frozenRowsTotalSize}px`, cssVar('acc'))}
      {chip(t('perfUiColWindow'), `${formatMs(stats.columnWindowMs)} · ${stats.columnWindowUpdates}`, cssVar('acc'))}
      {chip(t('perfUiColViewport'), `${stats.columnViewport}px · ${stats.columnOverscan}`, cssVar('acc2'))}
      {chip('FrozenCols', `${stats.frozenColumnsOverflow ? 'overflow' : 'fit'} · ${stats.frozenColumnsViewport}px/${stats.frozenColumnsTotalSize}px`, cssVar('acc2'))}
      {chip('FrozenColScroll', `${stats.frozenColumnsScrollLeft}px`, cssVar('acc'))}
      {chip(t('perfUiScrollSync'), String(stats.scrollSyncCount), cssVar('acc'))}
      <button
        type="button"
        onClick={() => { void copyText(getWorkbookDebugLogSnapshot()); }}
        className="rounded-full py-1 px-2.5 font-ui text-[11px] font-bold cursor-pointer shrink-0 transition-all duration-150 hover:-translate-y-px"
        style={{
          border: `1px solid ${cssVar('border')}`,
          background: cssVar('bg2'),
          color: cssVar('t0'),
        }}>
        复制Workbook日志
      </button>
      <button
        type="button"
        onClick={() => clearWorkbookDebugLogs()}
        className="rounded-full py-1 px-2.5 font-ui text-[11px] font-bold cursor-pointer shrink-0 transition-all duration-150 hover:-translate-y-px"
        style={{
          border: `1px solid ${cssVar('border')}`,
          background: cssVar('bg2'),
          color: cssVar('t0'),
        }}>
        清空Workbook日志
      </button>
    </div>
  );
});

export default WorkbookPerfDebugPanel;
