// src/components/CollapseBar.tsx
import { memo } from 'react';
import { FONT_CODE, FONT_SIZE, FONT_UI } from '../constants/typography';
import { useI18n } from '../context/i18n';
import { useTheme } from '../context/theme';
import { ROW_H } from '../hooks/useVirtual';

interface CollapseBarProps {
  count: number;
  expandCount: number;
  onExpand: () => void;
  onExpandAll?: (() => void) | undefined;
}

const CollapseBar = memo(({ count, expandCount, onExpand, onExpandAll }: CollapseBarProps) => {
  const T = useTheme();
  const { t } = useI18n();
  const shouldShowPartialExpand = expandCount < count;
  const singleActionLabel = shouldShowPartialExpand ? t('collapseBarExpandCount', { count: expandCount }) : t('collapseBarExpandAll');
  const singleActionHandler = shouldShowPartialExpand ? onExpand : (onExpandAll ?? onExpand);

  return (
    <div
      style={{
        height: ROW_H,
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        padding: '0 10px',
        gap: 6,
        background: T.bg2,
        borderTop: `1px dashed ${T.border}`,
        borderBottom: `1px dashed ${T.border}`,
        color: T.t2,
        fontSize: FONT_SIZE.sm,
        fontFamily: FONT_UI,
        userSelect: 'none',
      }}>
      <span style={{ fontFamily: FONT_CODE }}>···</span>
      <span style={{ color: T.acc2, fontFamily: FONT_CODE }}>{t('collapseBarLines', { count })}</span>
      <button
        type="button"
        onClick={singleActionHandler}
        style={{
          height: 20,
          padding: '0 8px',
          borderRadius: 999,
          border: `1px solid ${T.border}`,
          background: T.bg1,
          color: T.t1,
          fontSize: 10,
          fontFamily: FONT_UI,
          fontWeight: 700,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}>
        {singleActionLabel}
      </button>
      {shouldShowPartialExpand && onExpandAll && (
        <button
          type="button"
          onClick={() => {
            onExpandAll();
          }}
          style={{
            height: 20,
            padding: '0 8px',
            borderRadius: 999,
            border: `1px solid ${T.border}`,
            background: T.bg1,
            color: T.t1,
            fontSize: 10,
            fontFamily: FONT_UI,
            fontWeight: 700,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}>
          {t('collapseBarExpandAll')}
        </button>
      )}
    </div>
  );
});

export default CollapseBar;
