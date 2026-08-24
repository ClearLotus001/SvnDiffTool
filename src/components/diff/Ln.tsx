// src/components/Ln.tsx
import { memo, useState, type MouseEventHandler } from 'react';
import { FONT_CODE_STYLE, FONT_SIZE } from '@/constants/typography';
import { LN_W } from '@/constants/layout';
import { ROW_H } from '@/hooks/virtualization/useVirtual';
import { resolveLineNumberColor, type LineNumberTone } from '@/utils/diff/lineNumberTone';
import { cssVar } from '@/theme/cssUtils';
import Tooltip from '@/components/shared/Tooltip';
import { useOptionalI18n } from '@/context/i18n';
import type { LineBlameInfo } from '@/types';
import { formatCompactLineBlameVersion } from '@/utils/diff/lineBlame';

interface LnProps {
  n?: number | null;
  active?: boolean;
  tone?: LineNumberTone;
  stickyLeft?: number | null;
  selected?: boolean;
  selectedColor?: string | undefined;
  title?: string | undefined;
  blame?: LineBlameInfo | null | undefined;
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
  blame,
  onClick,
}: LnProps) => {
  const i18n = useOptionalI18n();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const interactive = Boolean(onClick);
  const emphasize = selected || (interactive && (hovered || focused));
  const accentColor = tone === 'mine'
    ? cssVar('versionMine')
    : tone === 'base'
      ? cssVar('versionBase')
      : `color-mix(in srgb, ${cssVar('versionBase')} 58%, ${cssVar('versionMine')} 42%)`;
  const effectiveSelectedColor = selectedColor ?? accentColor;
  const compactBlameLabel = formatCompactLineBlameVersion(blame);
  const blameAccentColor = blame?.uncommitted ? 'var(--diff-modify-border)' : accentColor;
  const blameFontSize = compactBlameLabel.length > 7 || (n ?? 0) >= 1_000 ? 8 : 9;
  const lineContent = (
    <>
      {compactBlameLabel && n != null && (
        <span
          aria-hidden
          data-line-blame-badge="true"
          data-tone={tone}
          style={{
            justifySelf: 'start',
            minWidth: 0,
            height: 15,
            padding: '0 3px',
            borderRadius: 4,
            border: `1px solid color-mix(in srgb, ${blameAccentColor} 24%, transparent)`,
            background: `color-mix(in srgb, ${blameAccentColor} ${emphasize ? 13 : 7}%, transparent)`,
            whiteSpace: 'nowrap',
            color: `color-mix(in srgb, ${blameAccentColor} ${emphasize ? 82 : 68}%, var(--text-secondary))`,
            fontSize: blameFontSize,
            fontWeight: 700,
            lineHeight: '13px',
            letterSpacing: compactBlameLabel.length >= 7 ? '-0.35px' : 0,
            boxSizing: 'border-box',
            transition: 'color 160ms ease, border-color 160ms ease, background 160ms ease',
          }}>
          {compactBlameLabel}
        </span>
      )}
      <span style={{ justifySelf: 'end' }}>{n ?? ''}</span>
    </>
  );
  const blameLabel = blame?.uncommitted
    ? (i18n?.t('lineBlameUncommitted') ?? 'Uncommitted working-copy change')
    : (blame?.revision ?? '');
  const blameTooltip = blame ? (
    <div className="min-w-[170px] text-left leading-[1.45]">
      <div className="font-bold text-text-title">
        {blame.uncommitted
          ? (i18n?.t('lineBlameUncommitted') ?? 'Uncommitted working-copy change')
          : (i18n?.t('lineBlameVersion', { version: blame.revision }) ?? `Version ${blame.revision}`)}
      </div>
      {blame.author && (
        <div className="text-text-secondary">
          {i18n?.t('lineBlameAuthor', { author: blame.author }) ?? `Author: ${blame.author}`}
        </div>
      )}
      {blame.date && (
        <div className="text-text-secondary">
          {i18n?.t('lineBlameDate', { date: blame.date }) ?? `Committed: ${blame.date}`}
        </div>
      )}
      {title && (
        <div className="mt-1 border-t border-border-default pt-1 text-text-secondary">
          {title}
        </div>
      )}
    </div>
  ) : title;
  const ariaDescription = [title, blameLabel, blame?.author, blame?.date].filter(Boolean).join(' · ');
  const sharedStyle = {
    display: 'grid',
    gridTemplateColumns: compactBlameLabel && n != null ? 'minmax(0, 1fr) auto' : '1fr',
    columnGap: compactBlameLabel && n != null ? 3 : 0,
    alignItems: 'center',
    width: LN_W, minWidth: LN_W,
    height: ROW_H,
    color: selected ? effectiveSelectedColor : resolveLineNumberColor(tone, active || emphasize),
    textAlign: 'right',
    paddingLeft: compactBlameLabel && n != null ? 4 : 0,
    paddingRight: 7,
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
      aria-label={ariaDescription ? (n != null ? `${n} · ${ariaDescription}` : ariaDescription) : undefined}
      style={{
        ...sharedStyle,
        cursor: 'pointer',
        appearance: 'none',
        outline: 'none',
      }}>
      {lineContent}
    </button>
  ) : (
    <span style={sharedStyle}>
      {lineContent}
    </span>
  );

  if (!blameTooltip) return content;
  return (
    <Tooltip content={blameTooltip} placement="top" maxWidth={300}>
      {content}
    </Tooltip>
  );
});

export default Ln;
