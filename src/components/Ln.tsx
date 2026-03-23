// src/components/Ln.tsx
import { memo } from 'react';
import { FONT_CODE, FONT_SIZE } from '../constants/typography';
import type { Theme } from '../types';
import { LN_W } from '../constants/layout';
import { ROW_H } from '../hooks/useVirtual';

interface LnProps {
  n?: number | null;
  T: Theme;
  active?: boolean;
}

const Ln = memo(({ n, T, active }: LnProps) => (
  <span style={{
    width: LN_W, minWidth: LN_W,
    color: active ? T.acc2 : T.lnTx,
    textAlign: 'right',
    paddingRight: 10,
    userSelect: 'none',
    fontSize: FONT_SIZE.sm,
    lineHeight: `${ROW_H}px`,
    flexShrink: 0,
    background: T.lnBg,
    fontFamily: FONT_CODE,
  }}>
    {n ?? ''}
  </span>
));

export default Ln;
