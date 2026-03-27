import { memo } from 'react';
import { FONT_CODE, FONT_SIZE, FONT_UI } from '@/constants/typography';
import { useI18n } from '@/context/i18n';
import { useTheme } from '@/context/theme';

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
}

interface WorkbookPerfDebugPanelProps {
  stats: WorkbookPerfDebugStats;
}

const WorkbookPerfDebugPanel = memo(({ stats }: WorkbookPerfDebugPanelProps) => {
  const T = useTheme();
  const { t } = useI18n();

  const chip = (label: string, value: string, accent = T.acc2) => (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 8px',
        borderRadius: 999,
        border: `1px solid ${T.border}`,
        background: T.bg2,
        minWidth: 0,
      }}>
      <span
        aria-hidden="true"
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          background: accent,
          flexShrink: 0,
        }}
      />
      <span style={{ fontFamily: FONT_UI, fontSize: FONT_SIZE.xs, color: T.t2, fontWeight: 700 }}>
        {label}
      </span>
      <span style={{ fontFamily: FONT_CODE, fontSize: FONT_SIZE.xs, color: T.t0, fontWeight: 700 }}>
        {value}
      </span>
    </div>
  );

  const formatMs = (value: number) => `${value.toFixed(value >= 100 ? 0 : 1)}ms`;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 12px',
        background: `linear-gradient(180deg, ${T.bg1} 0%, ${T.bg0} 100%)`,
        borderBottom: `1px solid ${T.border}`,
        overflowX: 'auto',
        flexShrink: 0,
      }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 140 }}>
        <span style={{ fontFamily: FONT_UI, fontSize: FONT_SIZE.sm, color: T.t0, fontWeight: 700 }}>
          {t('perfUiTitle')}
        </span>
        <span style={{ fontFamily: FONT_CODE, fontSize: FONT_SIZE.xs, color: T.t2 }}>
          {stats.panel} · {stats.sheetName || '—'}
        </span>
      </div>

      {chip(t('perfUiRows'), `${stats.renderedRows}/${stats.totalRows}`, T.acc)}
      {chip(t('perfUiCols'), `${stats.renderedColumns}/${stats.totalColumns}`, T.acc2)}
      {chip(t('perfUiFreeze'), `${stats.frozenRows}R · ${stats.frozenColumns}C`, T.acc)}
      {chip(t('perfUiCollapse'), String(stats.collapseBlocks), T.acc2)}
      {chip(t('perfUiBuildItems'), formatMs(stats.buildItemsMs), T.acc)}
      {chip(t('perfUiCollapseBuild'), formatMs(stats.collapseBuildMs), T.acc2)}
      {chip(t('perfUiHiddenOverlay'), `${formatMs(stats.hiddenOverlayMs)} · ${stats.hiddenRows}`, T.acc)}
      {chip(t('perfUiMiniMap'), formatMs(stats.miniMapMs), T.acc2)}
      {chip(t('perfUiMiniMapClick'), `${formatMs(stats.miniMapClickMs)} · ${stats.miniMapClickCount}`, T.acc)}
      {chip(t('perfUiRowWindow'), `${formatMs(stats.rowWindowMs)} · ${stats.rowWindowUpdates}`, T.acc)}
      {chip(t('perfUiRowViewport'), `${stats.rowViewport}px · ${stats.rowOverscan}`, T.acc2)}
      {chip(t('perfUiColWindow'), `${formatMs(stats.columnWindowMs)} · ${stats.columnWindowUpdates}`, T.acc)}
      {chip(t('perfUiColViewport'), `${stats.columnViewport}px · ${stats.columnOverscan}`, T.acc2)}
      {chip(t('perfUiScrollSync'), String(stats.scrollSyncCount), T.acc)}
    </div>
  );
});

export default WorkbookPerfDebugPanel;
