// src/components/Ln.tsx
import { memo, useState, type MouseEventHandler } from 'react';
import { FONT_CODE_STYLE, FONT_SIZE } from '@/constants/typography';
import { LN_W } from '@/constants/layout';
import { ROW_H } from '@/hooks/virtualization/useVirtual';
import { resolveLineNumberColor, type LineNumberTone } from '@/utils/diff/lineNumberTone';
import Tooltip from '@/components/shared/Tooltip';

interface LnProps {
  n?: number | null;
  active?: boolean;
  tone?: LineNumberTone;
  stickyLeft?: number | null;
  selected?: boolean;
  selectedColor?: string | undefined;
  title?: string | undefined;
  onClick?: MouseEventHandler<HTMLButtonElement> | undefined;
}

const Ln = memo(({
  n,
  active = false,
  tone = 'neutral',
  stickyLeft = null,
  selected = false,
  selectedColor,
  title,
  onClick,
}: LnProps) => {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const interactive = Boolean(onClick);
  const emphasize = selected || (interactive && (hovered || focused));
  const accentColor = tone === 'mine'
    ? 'var(--acc)'
    : tone === 'base'
      ? 'var(--acc2)'
      : 'color-mix(in srgb, var(--acc2) 68%, var(--acc) 32%)';
  const effectiveSelectedColor = selectedColor ?? accentColor;
  const sharedStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    width: LN_W, minWidth: LN_W,
    height: ROW_H,
    color: selected ? effectiveSelectedColor : resolveLineNumberColor(tone, active || emphasize),
    textAlign: 'right',
    paddingRight: 10,
    userSelect: 'none',
    fontSize: FONT_SIZE.sm,
    fontWeight: selected || emphasize ? 700 : 500,
    lineHeight: `${ROW_H}px`,
    flexShrink: 0,
    background: 'transparent',
    ...FONT_CODE_STYLE,
    position: stickyLeft == null ? 'relative' : 'sticky',
    left: stickyLeft == null ? undefined : stickyLeft,
    zIndex: stickyLeft == null ? 2 : 4,
    boxSizing: 'border-box',
    border: 0,
    boxShadow: stickyLeft == null ? undefined : `10px 0 14px -14px var(--border-strong)`,
    borderRadius: 0,
    transition: 'color 160ms ease, box-shadow 160ms ease',
  } as const;

  const content = onClick ? (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      aria-label={title ? (n != null ? `${n} · ${title}` : title) : undefined}
      style={{
        ...sharedStyle,
        cursor: 'pointer',
        appearance: 'none',
        outline: 'none',
      }}>
      {n ?? ''}
    </button>
  ) : (
    <span style={sharedStyle}>
      {n ?? ''}
    </span>
  );

  if (!title) return content;
  return (
    <Tooltip content={title} placement="top">
      {content}
    </Tooltip>
  );
});

export default Ln;
