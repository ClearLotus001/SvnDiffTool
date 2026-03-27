import { memo } from 'react';
import { FONT_CODE, FONT_SIZE, FONT_UI } from '@/constants/typography';
import { useI18n } from '@/context/i18n';
import { useTheme } from '@/context/theme';
import { ROW_H } from '@/hooks/virtualization/useVirtual';

interface WorkbookHiddenRowsBarProps {
  count: number;
  onReveal: () => void;
}

const WorkbookHiddenRowsBar = memo(({
  count,
  onReveal,
}: WorkbookHiddenRowsBarProps) => {
  const T = useTheme();
  const { t } = useI18n();

  return (
    <div
      style={{
        height: ROW_H,
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        justifyContent: 'flex-start',
        userSelect: 'none',
        gap: 12,
        padding: '0 10px',
        background: T.bg2,
        borderTop: `1px dashed ${T.border}`,
        borderBottom: `1px dashed ${T.border}`,
      }}>
      <span style={{ fontFamily: FONT_CODE, color: T.t2 }}>···</span>
      <span
        style={{
          color: T.t2,
          fontFamily: FONT_UI,
          fontSize: FONT_SIZE.sm,
          fontWeight: 600,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
        }}>
        <span style={{ color: T.acc2, fontFamily: FONT_CODE }}>ROWS</span>
        <span>{t('workbookHiddenRowsLabel', { count })}</span>
      </span>
      <button
        type="button"
        onClick={onReveal}
        style={{
          height: 20,
          padding: '0 8px',
          borderRadius: 999,
          border: `1px solid ${T.border}`,
          background: T.bg1,
          color: T.t1,
          fontFamily: FONT_UI,
          fontSize: 10,
          fontWeight: 700,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}>
        {t('workbookHiddenRowsRevealAction')}
      </button>
    </div>
  );
});

export default WorkbookHiddenRowsBar;
