// src/components/Ln.tsx
import { memo } from 'react';
import { FONT_CODE, FONT_SIZE } from '@/constants/typography';
import type { Theme } from '@/types';
import { LN_W } from '@/constants/layout';
import { ROW_H } from '@/hooks/virtualization/useVirtual';
import { resolveLineNumberColor, type LineNumberTone } from '@/utils/diff/lineNumberTone';

interface LnProps {
  n?: number | null;
  T: Theme;
  active?: boolean;
  tone?: LineNumberTone;
  stickyLeft?: number | null;
}

const Ln = memo(({ n, T, active = false, tone = 'neutral', stickyLeft = null }: LnProps) => (
  <span style={{
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    width: LN_W, minWidth: LN_W,
    color: resolveLineNumberColor(T, tone, active),
    textAlign: 'right',
    paddingRight: 10,
    userSelect: 'none',
    fontSize: FONT_SIZE.sm,
    lineHeight: `${ROW_H}px`,
    flexShrink: 0,
    background: T.lnBg,
    fontFamily: FONT_CODE,
    position: stickyLeft == null ? 'relative' : 'sticky',
    left: stickyLeft == null ? undefined : stickyLeft,
    zIndex: stickyLeft == null ? 2 : 4,
    boxShadow: stickyLeft == null ? undefined : `10px 0 14px -14px ${T.border2}`,
  }}>
    {n ?? ''}
  </span>
));

export default Ln;
