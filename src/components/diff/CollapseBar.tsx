// src/components/CollapseBar.tsx
import { memo } from 'react';
import { useI18n } from '@/context/i18n';
import { ROW_H } from '@/hooks/virtualization/useVirtual';

interface CollapseBarProps {
  count: number;
  expandCount: number;
  active?: boolean;
  onExpand: () => void;
  onExpandAll?: (() => void) | undefined;
  leadingInset?: number | undefined;
  leadingSurface?: string | undefined;
  leadingShadow?: string | undefined;
  label?: string | undefined;
  actionLabel?: string | undefined;
  expandAllLabel?: string | undefined;
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

const CollapseBar = memo(({
  count,
  expandCount,
  active = false,
  onExpand,
  onExpandAll,
  leadingInset = 0,
  leadingSurface,
  leadingShadow,
  label,
  actionLabel,
  expandAllLabel,
  palette,
}: CollapseBarProps) => {
  const { t } = useI18n();
  const shouldShowPartialExpand = expandCount < count;
  const singleActionLabel = actionLabel ?? (
    shouldShowPartialExpand
      ? t('collapseBarExpandCount', { count: expandCount })
      : t('collapseBarExpandAll')
  );
  const singleActionHandler = shouldShowPartialExpand ? onExpand : (onExpandAll ?? onExpand);
  const resolvedLabel = label ?? t('collapseBarLines', { count });
  const resolvedExpandAllLabel = expandAllLabel ?? t('collapseBarExpandAll');
  const activeAccent = palette?.accent ?? 'var(--acc2)';

  return (
    <div
      style={{
        height: ROW_H,
        background: active
          ? (palette?.background
            ?? `linear-gradient(90deg,
              color-mix(in srgb, ${activeAccent} 16%, var(--bg1) 84%) 0%,
              color-mix(in srgb, ${activeAccent} 8%, transparent) 100%)`)
          : palette?.background,
        borderTopColor: active
          ? (palette?.border ?? `color-mix(in srgb, ${activeAccent} 28%, transparent)`)
          : palette?.border,
        borderBottomColor: active
          ? (palette?.border ?? `color-mix(in srgb, ${activeAccent} 28%, transparent)`)
          : palette?.border,
        color: palette?.subduedText,
        boxShadow: active
          ? `inset 0 0 0 1px color-mix(in srgb, ${activeAccent} 18%, transparent),
             0 8px 18px -18px color-mix(in srgb, ${activeAccent} 50%, transparent)`
          : undefined,
      }}
      className="
        collapse-bar relative z-[3] pointer-events-auto flex items-stretch
        bg-bg-surface-hover border-y border-dashed border-border-default
        text-text-secondary text-[13px] font-ui select-none
        transition-[filter,box-shadow,background-color,border-color] duration-200
      "
      data-active={active ? 'true' : 'false'}
    >
      {leadingInset > 0 && (
        <div
          aria-hidden
          style={{
            width: leadingInset,
            minWidth: leadingInset,
            flexShrink: 0,
            background: leadingSurface ?? 'var(--lnBg)',
            boxShadow: leadingShadow,
          }}
        />
      )}
      <div className="flex min-w-0 flex-1 items-center flex-wrap px-2.5 gap-1.5">
        <span className="font-code" style={{ color: palette?.subduedText }}>
          ···
        </span>
        <span
          className="font-code"
          style={{
            color: palette?.labelText ?? palette?.accent ?? 'var(--acc2)',
            fontWeight: active ? 800 : 700,
          }}>
          {resolvedLabel}
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
            borderColor: active
              ? (palette?.buttonBorder ?? `color-mix(in srgb, ${activeAccent} 32%, transparent)`)
              : palette?.buttonBorder,
            color: active
              ? (palette?.buttonText ?? activeAccent)
              : palette?.buttonText,
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
              borderColor: active
                ? (palette?.buttonBorder ?? `color-mix(in srgb, ${activeAccent} 32%, transparent)`)
                : palette?.buttonBorder,
              color: active
                ? (palette?.buttonText ?? activeAccent)
                : palette?.buttonText,
            }}>
            {resolvedExpandAllLabel}
          </button>
        )}
      </div>
    </div>
  );
});

export default CollapseBar;
