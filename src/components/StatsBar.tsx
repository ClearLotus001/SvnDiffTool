// src/components/StatsBar.tsx
import { memo, useMemo } from 'react';
import { FONT_CODE, FONT_SIZE, FONT_UI } from '../constants/typography';
import { useI18n } from '../context/i18n';
import type { DiffLine, WorkbookArtifactDiff, WorkbookCompareMode } from '../types';
import { useTheme } from '../context/theme';
import Tooltip from './Tooltip';

interface StatsBarProps {
  diffLines: DiffLine[];
  baseName: string;
  mineName: string;
  fileName: string;
  totalLines: number;
  baseVersionLabel: string;
  mineVersionLabel: string;
  isWorkbookMode?: boolean;
  workbookCompareMode?: WorkbookCompareMode;
  workbookArtifactDiff?: WorkbookArtifactDiff | null;
}

const Dot = ({ c }: { c: string }) => (
  <span style={{ width: 7, height: 7, borderRadius: '50%', background: c, display: 'block', flexShrink: 0 }} />
);

const RoleBadge = ({ side, accent }: { side: 'base' | 'mine'; accent: string }) => {
  const glyphStyle = side === 'base'
    ? {
        width: 6,
        height: 6,
        borderRadius: 3,
        transform: 'rotate(45deg)',
      }
    : {
        width: 7,
        height: 7,
        borderRadius: '50%',
      };

  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 12,
        height: 12,
        minWidth: 12,
        borderRadius: 999,
        background: `${accent}14`,
        border: `1px solid ${accent}40`,
        boxSizing: 'border-box',
        flexShrink: 0,
      }}>
      <span
        style={{
          display: 'block',
          background: accent,
          boxShadow: `0 0 0 1px ${accent}22`,
          ...glyphStyle,
        }}
      />
    </span>
  );
};

const StatsBar = memo(({
  diffLines,
  baseName,
  mineName,
  fileName,
  totalLines,
  baseVersionLabel,
  mineVersionLabel,
  isWorkbookMode = false,
  workbookCompareMode = 'strict',
  workbookArtifactDiff = null,
}: StatsBarProps) => {
  const T = useTheme();
  const { t } = useI18n();

  const stats = useMemo(() => {
    let add = 0, del = 0;
    diffLines.forEach(l => {
      if      (l.type === 'add')    add++;
      else if (l.type === 'delete') del++;
    });
    const chg = Math.min(add, del);
    return { add: add - chg, del: del - chg, chg };
  }, [diffLines]);

  const metric = (color: string, value: string, label: string) => (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      flexShrink: 0,
      lineHeight: 1,
    }}>
      <Dot c={color} />
      <span style={{ color, fontFamily: FONT_CODE, fontSize: FONT_SIZE.sm }}>{value}</span>
      <span style={{ color: T.t2, fontFamily: FONT_UI, fontSize: FONT_SIZE.sm }}>{label}</span>
    </div>
  );

  const metaPill = (
    label: string,
    value: string,
    accent: string,
    tooltip?: string,
    side?: 'base' | 'mine',
  ) => (
    <Tooltip content={tooltip ?? value} maxWidth={360}>
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          minWidth: 0,
          padding: '2px 8px',
          borderRadius: 999,
          background: T.bg2,
          border: `1px solid ${T.border}`,
          flexShrink: 0,
        }}>
        {side && <RoleBadge side={side} accent={accent} />}
        <span style={{ fontSize: FONT_SIZE.xs, color: accent, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap', fontFamily: FONT_UI }}>
          {label}
        </span>
        <span style={{
          color: T.t0,
          fontSize: FONT_SIZE.sm,
          fontWeight: 600,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          maxWidth: 180,
          fontFamily: FONT_UI,
        }}>
          {value}
        </span>
      </div>
    </Tooltip>
  );

  return (
    <div style={{
      background: T.bg1, borderTop: `1px solid ${T.border}`,
      minHeight: 30, display: 'flex', alignItems: 'center',
      gap: 10, padding: '4px 10px', flexShrink: 0,
      width: '100%',
      minWidth: 0,
      fontSize: FONT_SIZE.sm, color: T.t2,
      overflowX: 'auto',
      fontFamily: FONT_UI,
      position: 'relative',
      zIndex: 18,
      boxShadow: `0 -1px 0 ${T.border}, 0 -10px 24px -24px ${T.border2}`,
    }}>
      {metric(T.addTx, `+${stats.add + stats.chg}`, t('statsAdded'))}
      {metric(T.delTx, `-${stats.del + stats.chg}`, t('statsRemoved'))}
      {metric(T.chgTx, `~${stats.chg}`, t('statsModified'))}

      {fileName && metaPill(t('commonTableFile'), fileName, T.acc2)}
      {isWorkbookMode && (
        <Tooltip
          content={workbookCompareMode === 'strict'
            ? t('toolbarCompareModeStatusStrictHint')
            : t('toolbarCompareModeStatusContentHint')}
          maxWidth={360}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              minWidth: 0,
              padding: '2px 8px',
              borderRadius: 999,
              background: workbookCompareMode === 'strict' ? `${T.acc2}10` : T.bg2,
              border: `1px solid ${workbookCompareMode === 'strict' ? `${T.acc2}40` : T.border}`,
              flexShrink: 0,
            }}>
            <Dot c={workbookCompareMode === 'strict' ? T.acc2 : T.t2} />
            <span
              style={{
                fontSize: FONT_SIZE.xs,
                color: workbookCompareMode === 'strict' ? T.acc2 : T.t1,
                fontWeight: 700,
                whiteSpace: 'nowrap',
                fontFamily: FONT_UI,
              }}>
              {workbookCompareMode === 'strict'
                ? t('toolbarCompareModeStatusStrict')
                : t('toolbarCompareModeStatusContent')}
            </span>
          </div>
        </Tooltip>
      )}
      {isWorkbookMode && workbookArtifactDiff?.hasArtifactOnlyDiff && (
        <Tooltip
          content={(
            <>
              <div>{t('statsArtifactOnlyDiffHintPrimary')}</div>
              <div style={{ marginTop: 6, color: T.t2 }}>
                {t('statsArtifactOnlyDiffHintSecondary')}
              </div>
            </>
          )}
          maxWidth={360}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              minWidth: 0,
              padding: '2px 8px',
              borderRadius: 999,
              background: T.bg2,
              border: `1px solid ${T.border2}`,
              flexShrink: 0,
            }}>
            <Dot c={T.t2} />
            <span
              style={{
                fontSize: FONT_SIZE.xs,
                color: T.t2,
                fontWeight: 700,
                whiteSpace: 'nowrap',
                fontFamily: FONT_UI,
              }}>
              {t('statsArtifactOnlyDiffLabel')}
            </span>
          </div>
        </Tooltip>
      )}
      {metaPill(t('statsBaseVersion'), baseVersionLabel, T.acc2, baseName, 'base')}
      {metaPill(t('statsMineVersion'), mineVersionLabel, T.acc, mineName, 'mine')}

      <div style={{ flex: 1 }} />
      <span style={{ whiteSpace: 'nowrap', fontFamily: FONT_UI, fontSize: FONT_SIZE.sm }}>{t('statsLines', { count: totalLines })}</span>
      <span style={{ color: T.border2 }}>|</span>
      <span style={{ whiteSpace: 'nowrap', fontFamily: FONT_UI, fontSize: FONT_SIZE.sm }}>{t('statsHints')}</span>
    </div>
  );
});

export default StatsBar;
