import { memo, useState, type RefObject } from 'react';
import { useThemeTokens } from '@/context/theme';
import { cssVar } from '@/theme/cssUtils';

interface WorkbookFrozenPaneOverflowBarProps {
  scrollerRef: RefObject<HTMLDivElement | null>;
  label: string;
  itemCount: number;
  totalSize: number;
  viewportSize: number;
  itemLabel?: string;
  rangeLabel?: string | null;
  hint?: string | null;
}

const WorkbookFrozenPaneOverflowBar = memo(({
  scrollerRef,
  label,
  itemCount,
  totalSize,
  viewportSize,
  itemLabel = '列',
  rangeLabel = null,
  hint = '拖动滚动条浏览冻结区域',
}: WorkbookFrozenPaneOverflowBarProps) => {
  const T = useThemeTokens();
  const [hovered, setHovered] = useState(false);

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
            style={{ background: hovered ? T.acc2 : T.acc }}
          />
          <span className="font-ui text-[11px] font-bold text-text-title truncate">{label}</span>
          <span className="font-code text-[11px] text-text-secondary shrink-0">{itemCount} {itemLabel}</span>
          {rangeLabel && (
            <span
              className="font-code text-[11px] font-bold shrink-0"
              style={{ color: hovered ? T.acc2 : T.acc }}>
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
          scrollbarColor: `${hovered ? T.acc2 : T.acc} ${T.bg0}`,
          boxShadow: hovered ? `0 0 0 1px ${T.acc}22` : undefined,
        }}>
        <div
          style={{
            width: totalSize,
            minWidth: totalSize,
            height: hovered ? 12 : 10,
            borderRadius: 999,
            background: hovered
              ? `linear-gradient(90deg, ${T.acc} 0%, ${T.acc2} 100%)`
              : `linear-gradient(90deg, ${T.acc2} 0%, ${T.acc} 100%)`,
            boxShadow: `inset 0 0 0 1px ${T.border}`,
            transition: 'height 150ms ease, background 150ms ease',
          }}
        />
      </div>
      {hint && (
        <div
          className="px-2 pt-1 font-ui text-[10px] transition-colors duration-150"
          style={{ color: hovered ? T.acc2 : T.t2 }}>
          {hint}
        </div>
      )}
    </div>
  );
});

export default WorkbookFrozenPaneOverflowBar;
