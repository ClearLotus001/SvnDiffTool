import { memo } from 'react';
import { useI18n } from '@/context/i18n';
import { useThemeTokens } from '@/context/theme';
import { ROW_H } from '@/hooks/virtualization/useVirtual';
import { resolveWorkbookAuxBarPalette } from '@/utils/workbook/workbookRowVisuals';

interface WorkbookHiddenRowsBarProps {
  count: number;
  onReveal: () => void;
}

const WorkbookHiddenRowsBar = memo(({ count, onReveal }: WorkbookHiddenRowsBarProps) => {
  const T = useThemeTokens();
  const { t } = useI18n();
  const palette = resolveWorkbookAuxBarPalette(T, 'mixed');

  return (
    <div
      className="flex items-center flex-wrap justify-start select-none gap-3 px-2.5"
      style={{
        height: ROW_H,
        background: palette.background,
        borderTop: `1px dashed ${palette.border}`,
        borderBottom: `1px dashed ${palette.border}`,
      }}>
      <span aria-hidden="true" className="font-code text-text-secondary">...</span>
      <span className="text-text-secondary font-ui text-[13px] font-semibold">
        {t('workbookHiddenRowsLabel', { count })}
      </span>
      <button
        type="button"
        onClick={onReveal}
        className="h-5 px-2 rounded-full bg-bg-surface-solid font-ui text-[10px] font-bold cursor-pointer whitespace-nowrap hover:border-accent hover:text-accent active:scale-95 transition-all duration-150"
        style={{
          border: `1px solid ${palette.buttonBorder}`,
          color: palette.buttonText,
        }}>
        {t('workbookHiddenRowsRevealAction')}
      </button>
    </div>
  );
});

export default WorkbookHiddenRowsBar;
