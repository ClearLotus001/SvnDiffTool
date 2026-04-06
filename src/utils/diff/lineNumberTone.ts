import { cssAlpha, cssVar } from '@/theme/cssUtils';

export type LineNumberTone = 'base' | 'mine' | 'neutral';

export function resolveLineNumberColor(
  tone: LineNumberTone,
  active = false,
): string {
  if (tone === 'base') return active ? cssVar('acc2') : cssAlpha('acc2', 'bf');
  if (tone === 'mine') return active ? cssVar('acc') : cssAlpha('acc', 'bf');
  return active ? cssVar('acc2') : cssVar('lnTx');
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
