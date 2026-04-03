import { memo } from 'react';
import { useI18n } from '@/context/i18n';
import { cssAlpha, cssVar } from '@/theme/cssUtils';
import type { DiffPerformanceMetrics } from '@/types';
import { copyText } from '@/utils/app/clipboard';
import {
  clearWorkbookDebugLogs,
  getWorkbookDebugLogSnapshot,
} from '@/utils/workbook/workbookDebug';

interface PerfBarProps {
  metrics: DiffPerformanceMetrics | null;
}

const PerfBar = memo(({ metrics }: PerfBarProps) => {
  const { t } = useI18n();

  if (!metrics) return null;

  const chip = (label: string, value: string, accent = cssVar('acc2')) => (
    <div className="inline-flex items-center gap-1.5 py-1 px-2 rounded-full bg-bg-surface-hover border border-border-default text-text-primary min-w-0">
      <span className="size-1.5 rounded-full shrink-0" style={{ background: accent }} />
      <span className="font-ui text-[11px] text-text-secondary font-bold uppercase tracking-wider">{label}</span>
      <span className="font-code text-[13px] text-text-title font-bold">{value}</span>
    </div>
  );

  const formatMs = (value?: number) => (typeof value === 'number' ? `${value.toFixed(value >= 100 ? 0 : 1)}ms` : '—');
  const formatBytes = (value?: number) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return '—';
    if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)}MB`;
    if (value >= 1024) return `${(value / 1024).toFixed(1)}KB`;
    return `${value}B`;
  };
  const sourceLabel = {
    cli: t('perfSource_cli'),
    'revision-switch': t('perfSource_revision-switch'),
    'local-dev': t('perfSource_local-dev'),
  }[metrics.source];

  return (
    <div className="flex items-center gap-2 py-2 px-3 w-full min-w-0 border-b border-border-default shrink-0 overflow-x-auto bg-bg-surface-solid">
      <div className="flex flex-col gap-0.5 min-w-[120px]">
        <span className="font-ui text-[13px] text-text-title font-bold">{t('perfTitle')}</span>
        <span className="font-ui text-[11px] text-text-secondary">{sourceLabel}</span>
      </div>

      {chip(t('perfMainLoad'), formatMs(metrics.mainLoadMs), cssVar('acc'))}
      {chip(t('perfBaseRead'), formatMs(metrics.baseReadMs), cssVar('acc2'))}
      {chip(t('perfMineRead'), formatMs(metrics.mineReadMs), cssVar('acc'))}
      {chip(t('perfBaseParse'), formatMs(metrics.baseParserMs), cssVar('acc2'))}
      {chip(t('perfMineParse'), formatMs(metrics.mineParserMs), cssVar('acc'))}
      {chip(t('perfTextResolve'), formatMs(metrics.textResolveMs), cssVar('acc2'))}
      {chip(t('perfMetadata'), formatMs(metrics.metadataMs), cssVar('acc'))}
      {chip(t('perfDiff'), formatMs(metrics.diffMs), cssVar('acc2'))}
      {chip(t('perfTotal'), formatMs(metrics.totalAppMs), cssVar('acc'))}
      {chip(t('perfBaseBytes'), formatBytes(metrics.baseBytes), cssVar('acc2'))}
      {chip(t('perfMineBytes'), formatBytes(metrics.mineBytes), cssVar('acc'))}
      {chip(t('perfDiffLines'), typeof metrics.diffLineCount === 'number' ? String(metrics.diffLineCount) : '—', cssVar('acc2'))}
      <button
        type="button"
        onClick={() => { void copyText(getWorkbookDebugLogSnapshot()); }}
        className="rounded-full py-1 px-2.5 font-ui text-[11px] font-bold cursor-pointer shrink-0 transition-all duration-150 hover:-translate-y-px"
        style={{
          border: `1px solid ${cssAlpha('acc2', '66')}`,
          background: cssAlpha('acc2', '10'),
          color: cssVar('acc2'),
        }}>
        复制Workbook日志
      </button>
      <button
        type="button"
        onClick={() => clearWorkbookDebugLogs()}
        className="rounded-full py-1 px-2.5 bg-bg-surface-hover border border-border-default text-text-primary font-ui text-[11px] font-bold cursor-pointer shrink-0 transition-all duration-150 hover:-translate-y-px">
        清空Workbook日志
      </button>
    </div>
  );
});

export default PerfBar;
