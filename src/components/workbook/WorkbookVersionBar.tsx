import { memo } from 'react';
import { FONT_CODE, FONT_SIZE, FONT_UI } from '@/constants/typography';
import { useI18n } from '@/context/i18n';
import { useTheme } from '@/context/theme';

interface WorkbookVersionBarProps {
  baseVersion: string;
  mineVersion: string;
  baseTitle?: string;
  mineTitle?: string;
}

const WorkbookVersionBar = memo(({
  baseVersion,
  mineVersion,
  baseTitle,
  mineTitle,
}: WorkbookVersionBarProps) => {
  const T = useTheme();
  const { t } = useI18n();

  const renderPill = (
    side: 'base' | 'mine',
    label: string,
    version: string,
  ) => {
    const accent = side === 'base' ? T.acc2 : T.acc;
    const glyphStyle = side === 'base'
      ? {
          width: 7,
          height: 7,
          borderRadius: 2,
          transform: 'rotate(45deg)',
        }
      : {
          width: 8,
          height: 8,
          borderRadius: '50%',
        };

    return (
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          minWidth: 0,
          padding: '6px 10px',
          borderRadius: 10,
          border: `1px solid ${T.border}`,
          background: T.bg2,
          boxShadow: `0 10px 24px -24px ${accent}88`,
        }}>
        <span
          aria-hidden="true"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 14,
            height: 14,
            minWidth: 14,
            borderRadius: 999,
            background: `${accent}16`,
            border: `1px solid ${accent}45`,
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
        <span
          style={{
            color: accent,
            fontFamily: FONT_UI,
            fontSize: FONT_SIZE.xs,
            fontWeight: 700,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}>
          {label}
        </span>
        <span
          style={{
            minWidth: 0,
            color: T.t0,
            fontFamily: FONT_CODE,
            fontSize: FONT_SIZE.sm,
            fontWeight: 700,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
          {version}
        </span>
      </div>
    );
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        borderBottom: `1px solid ${T.border}`,
        background: `linear-gradient(180deg, ${T.bg1} 0%, ${T.bg0} 100%)`,
        flexWrap: 'wrap',
        flexShrink: 0,
      }}>
      {renderPill('base', baseTitle || t('statsLeftVersion'), baseVersion)}
      {renderPill('mine', mineTitle || t('statsRightVersion'), mineVersion)}
    </div>
  );
});

export default WorkbookVersionBar;
