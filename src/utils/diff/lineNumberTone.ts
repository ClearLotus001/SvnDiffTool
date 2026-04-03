import type { ThemeTokens } from '@/theme/tokens';
import { cssAlpha, cssVar } from '@/theme/cssUtils';

export type LineNumberTone = 'base' | 'mine' | 'neutral';

function withHexAlpha(color: string, hexAlpha: string): string {
  return color.startsWith('#') && color.length === 7 ? `${color}${hexAlpha}` : color;
}

export function resolveLineNumberColor(
  tone: LineNumberTone,
  active = false,
): string {
  if (tone === 'base') return active ? cssVar('acc2') : cssAlpha('acc2', 'bf');
  if (tone === 'mine') return active ? cssVar('acc') : cssAlpha('acc', 'bf');
  return active ? cssVar('acc2') : cssVar('lnTx');
}

export function resolveLineNumberTokenColor(
  theme: Pick<ThemeTokens, 'acc' | 'acc2' | 'lnTx'>,
  tone: LineNumberTone,
  active = false,
): string {
  if (tone === 'base') return active ? theme.acc2 : withHexAlpha(theme.acc2, 'bf');
  if (tone === 'mine') return active ? theme.acc : withHexAlpha(theme.acc, 'bf');
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

export function resolveWorkbookStackedLineNumberTone(params: {
    side: 'base' | 'mine';
    hasCompanionBand: boolean;
    tone: 'neutral' | 'add' | 'delete';
    hasBaseRow: boolean;
    hasMineRow: boolean;
}): LineNumberTone {
    const {
        side,
        hasCompanionBand,
        tone,
        hasBaseRow,
        hasMineRow,
    } = params;

    if (hasCompanionBand) return side;
    if (tone === 'delete') return 'base';
    if (tone === 'add') return 'mine';
    return resolveSharedWorkbookLineNumberTone(hasBaseRow, hasMineRow);
}
