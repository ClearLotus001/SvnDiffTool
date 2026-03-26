import type { Theme } from '../types';

export type LineNumberTone = 'base' | 'mine' | 'neutral';

export function resolveLineNumberColor(
  theme: Theme,
  tone: LineNumberTone,
  active = false,
): string {
  if (tone === 'base') return active ? theme.acc2 : `${theme.acc2}bf`;
  if (tone === 'mine') return active ? theme.acc : `${theme.acc}bf`;
  return active ? theme.acc2 : theme.lnTx;
}

export function resolveSharedWorkbookLineNumberTone(
  hasBaseRow: boolean,
  hasMineRow: boolean,
): LineNumberTone {
  if (hasBaseRow && !hasMineRow) return 'base';
  if (hasMineRow && !hasBaseRow) return 'mine';
  return 'neutral';
}
