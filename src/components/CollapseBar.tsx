// src/components/CollapseBar.tsx
import { memo } from 'react';
import { FONT_CODE, FONT_SIZE, FONT_UI } from '../constants/typography';
import { useI18n } from '../context/i18n';
import { useTheme } from '../context/theme';
import { ROW_H } from '../hooks/useVirtual';

interface CollapseBarProps {
  count: number;
  onExpand: () => void;
}

const CollapseBar = memo(({ count, onExpand }: CollapseBarProps) => {
  const T = useTheme();
  const { t } = useI18n();
  return (
    <div
      onClick={onExpand}
      onMouseEnter={e => (e.currentTarget.style.color = T.t1)}
      onMouseLeave={e => (e.currentTarget.style.color = T.t2)}
      style={{
        height: ROW_H,
        display: 'flex',
        alignItems: 'center',
        padding: '0 12px',
        gap: 8,
        background: T.bg2,
        borderTop: `1px dashed ${T.border}`,
        borderBottom: `1px dashed ${T.border}`,
        cursor: 'pointer',
        color: T.t2,
        fontSize: FONT_SIZE.sm,
        fontFamily: FONT_UI,
        userSelect: 'none',
      }}>
      <span style={{ fontFamily: FONT_CODE }}>···</span>
      <span style={{ color: T.acc2, fontFamily: FONT_CODE }}>{t('collapseBarLines', { count })}</span>
      <span>- {t('collapseBarExpand')}</span>
    </div>
  );
});

export default CollapseBar;
