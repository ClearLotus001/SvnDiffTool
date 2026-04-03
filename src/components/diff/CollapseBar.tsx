// src/components/CollapseBar.tsx
import { memo } from 'react';
import { useI18n } from '@/context/i18n';
import { ROW_H } from '@/hooks/virtualization/useVirtual';

interface CollapseBarProps {
  count: number;
  expandCount: number;
  onExpand: () => void;
  onExpandAll?: (() => void) | undefined;
  palette?: {
    background: string;
    border: string;
    accent: string;
    buttonBorder: string;
    buttonText: string;
    labelText?: string;
    subduedText?: string;
  } | undefined;
}

const CollapseBar = memo(({ count, expandCount, onExpand, onExpandAll, palette }: CollapseBarProps) => {
  const { t } = useI18n();
  const shouldShowPartialExpand = expandCount < count;
  const singleActionLabel = shouldShowPartialExpand
    ? t('collapseBarExpandCount', { count: expandCount })
    : t('collapseBarExpandAll');
  const singleActionHandler = shouldShowPartialExpand ? onExpand : (onExpandAll ?? onExpand);

  return (
    <div
      style={{ height: ROW_H }}
      className="
        relative z-[3] pointer-events-auto flex items-center flex-wrap px-2.5 gap-1.5
        bg-bg-surface-hover border-y border-dashed border-border-default
        text-text-secondary text-[13px] font-ui select-none
      ">
      <span className="font-code">···</span>
      <span
        className="font-code"
        style={{ color: palette?.accent ?? 'var(--acc2)' }}>
        {t('collapseBarLines', { count })}
      </span>
      <button
        type="button"
        onClick={singleActionHandler}
        className="
          relative z-[4] pointer-events-auto h-5 px-2 rounded-full
          border border-border-default bg-bg-surface-solid
          text-text-primary text-[10px] font-ui font-bold
          cursor-pointer whitespace-nowrap
          hover:border-accent hover:text-accent
          active:scale-95 transition-all duration-150
        "
        style={{
          borderColor: palette?.buttonBorder,
          color: palette?.buttonText,
        }}>
        {singleActionLabel}
      </button>
      {shouldShowPartialExpand && onExpandAll && (
        <button
          type="button"
          onClick={() => { onExpandAll(); }}
          className="
            relative z-[4] pointer-events-auto h-5 px-2 rounded-full
            border border-border-default bg-bg-surface-solid
            text-text-primary text-[10px] font-ui font-bold
            cursor-pointer whitespace-nowrap
            hover:border-accent hover:text-accent
            active:scale-95 transition-all duration-150
          "
          style={{
            borderColor: palette?.buttonBorder,
            color: palette?.buttonText,
          }}>
          {t('collapseBarExpandAll')}
        </button>
      )}
    </div>
  );
});

export default CollapseBar;
