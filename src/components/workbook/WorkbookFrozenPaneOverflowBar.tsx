import { memo, useState, type RefObject } from 'react';
import { useI18n } from '@/context/i18n';
import { useThemeTokens } from '@/context/theme';
import { cssVar } from '@/theme/cssUtils';

interface WorkbookFrozenPaneOverflowBarProps {
  scrollerRef: RefObject<HTMLDivElement | null>;
  label: string;
  itemCount: number;
  totalSize: number;
  viewportSize: number;
  itemLabel?: string | null;
  rangeLabel?: string | null;
  hint?: string | null;
}

const WorkbookFrozenPaneOverflowBar = memo(({
  scrollerRef,
  label,
  itemCount,
  totalSize,
  viewportSize,
  itemLabel = null,
  rangeLabel = null,
  hint = null,
}: WorkbookFrozenPaneOverflowBarProps) => {
  const { t } = useI18n();
  const T = useThemeTokens();
  const [hovered, setHovered] = useState(false);
  const resolvedItemLabel = itemLabel ?? t('workbookFrozenPaneItemColumns');
  const resolvedHint = hint ?? t('workbookFrozenPaneHint');

  return (
    <div
      className="shrink-0 px-2 pb-1"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: cssVar('bg1'),
      }}>
      <div
        className="flex items-center justify-between gap-3 px-2 py-1.5 rounded-t-xl border border-b-0 transition-colors duration-150"
        style={{
          borderColor: hovered ? T.acc : T.border,
          background: hovered ? T.bg1 : T.bg0,
          boxShadow: hovered ? `0 0 0 1px ${T.acc}22` : undefined,
        }}>
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="size-2 rounded-full shrink-0"
            aria-hidden="true"
            style={{ background: hovered ? T.versionBase : T.versionMine }}
          />
          <span className="font-ui text-[11px] font-bold text-text-title truncate">{label}</span>
          <span className="font-code text-[11px] text-text-secondary shrink-0">{itemCount} {resolvedItemLabel}</span>
          {rangeLabel && (
            <span
              className="font-code text-[11px] font-bold shrink-0"
              style={{ color: hovered ? T.versionBase : T.versionMine }}>
              {rangeLabel}
            </span>
          )}
        </div>
        <div className="font-code text-[11px] text-text-secondary shrink-0">
          {viewportSize}px / {totalSize}px
        </div>
      </div>
      <div
        ref={scrollerRef}
        className="overflow-x-auto overflow-y-hidden rounded-b-xl border px-1.5 py-1 transition-colors duration-150"
        style={{
          borderColor: hovered ? T.acc : T.border,
          background: hovered ? T.bg1 : T.bg2,
          overflowAnchor: 'none',
          scrollbarColor: `${hovered ? T.versionBase : T.versionMine} ${T.bg0}`,
          boxShadow: hovered ? `0 0 0 1px ${T.acc}22` : undefined,
        }}>
        <div
          style={{
            width: totalSize,
            minWidth: totalSize,
            height: hovered ? 12 : 10,
            borderRadius: 999,
            background: hovered
              ? `linear-gradient(90deg, ${T.versionMine} 0%, ${T.versionBase} 100%)`
              : `linear-gradient(90deg, ${T.versionBase} 0%, ${T.versionMine} 100%)`,
            boxShadow: `inset 0 0 0 1px ${T.border}`,
            transition: 'height 150ms ease, background 150ms ease',
          }}
        />
      </div>
      {resolvedHint && (
        <div
          className="px-2 pt-1 font-ui text-[10px] transition-colors duration-150"
          style={{ color: hovered ? T.versionBase : T.t2 }}>
          {resolvedHint}
        </div>
      )}
    </div>
  );
});

export default WorkbookFrozenPaneOverflowBar;
