import { memo } from 'react';
import { FONT_CODE, FONT_SIZE, FONT_UI } from '../constants/typography';
import { useI18n } from '../context/i18n';
import { useTheme } from '../context/theme';
import type { DiffPerformanceMetrics } from '../types';

interface PerfBarProps {
  metrics: DiffPerformanceMetrics | null;
}

const PerfBar = memo(({ metrics }: PerfBarProps) => {
  const T = useTheme();
  const { t } = useI18n();

  if (!metrics) return null;

  const chip = (label: string, value: string, accent = T.acc2) => (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 8px',
        borderRadius: 999,
        background: T.bg2,
        border: `1px solid ${T.border}`,
        color: T.t1,
        minWidth: 0,
      }}>
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          background: accent,
          flexShrink: 0,
        }}
      />
      <span style={{ fontFamily: FONT_UI, fontSize: FONT_SIZE.xs, color: T.t2, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </span>
      <span style={{ fontFamily: FONT_CODE, fontSize: FONT_SIZE.sm, color: T.t0, fontWeight: 700 }}>
        {value}
      </span>
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
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        width: '100%',
        minWidth: 0,
        background: `linear-gradient(180deg, ${T.bg1} 0%, ${T.bg0} 100%)`,
        borderBottom: `1px solid ${T.border}`,
        flexShrink: 0,
        overflowX: 'auto',
      }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 120 }}>
        <span style={{ fontFamily: FONT_UI, fontSize: FONT_SIZE.sm, color: T.t0, fontWeight: 700 }}>
          {t('perfTitle')}
        </span>
        <span style={{ fontFamily: FONT_UI, fontSize: FONT_SIZE.xs, color: T.t2 }}>
          {sourceLabel}
        </span>
      </div>

      {chip(t('perfMainLoad'), formatMs(metrics.mainLoadMs), T.acc)}
      {chip(t('perfBaseRead'), formatMs(metrics.baseReadMs), T.acc2)}
      {chip(t('perfMineRead'), formatMs(metrics.mineReadMs), T.acc)}
      {chip(t('perfBaseParse'), formatMs(metrics.baseParserMs), T.acc2)}
      {chip(t('perfMineParse'), formatMs(metrics.mineParserMs), T.acc)}
      {chip(t('perfTextResolve'), formatMs(metrics.textResolveMs), T.acc2)}
      {chip(t('perfMetadata'), formatMs(metrics.metadataMs), T.acc)}
      {chip(t('perfDiff'), formatMs(metrics.diffMs), T.acc2)}
      {chip(t('perfTotal'), formatMs(metrics.totalAppMs), T.acc)}
      {chip(t('perfBaseBytes'), formatBytes(metrics.baseBytes), T.acc2)}
      {chip(t('perfMineBytes'), formatBytes(metrics.mineBytes), T.acc)}
      {chip(t('perfDiffLines'), typeof metrics.diffLineCount === 'number' ? String(metrics.diffLineCount) : '—', T.acc2)}
    </div>
  );
});

export default PerfBar;
