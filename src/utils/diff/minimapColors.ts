import type { ThemeTokens } from '@/theme/tokens';

export type DiffMiniMapHighlightTone = 'add' | 'delete' | 'modify' | 'mixed';
export interface DiffMiniMapPaint {
  kind: 'solid' | 'gradient';
  color?: string;
  stops?: Array<{ offset: number; color: string }>;
}

function isTransparentColor(color: string): boolean {
  const normalized = color.trim().toLowerCase();
  return normalized === 'transparent'
    || normalized === '#0000'
    || normalized === '#00000000'
    || normalized === 'rgba(0, 0, 0, 0)'
    || normalized === 'rgba(0,0,0,0)';
}

function resolveMiniMapSemanticColor(
  theme: ThemeTokens,
  tone: Exclude<DiffMiniMapHighlightTone, 'mixed'>,
): string {
  if (tone === 'add') {
    return !isTransparentColor(theme.addBrd)
      ? theme.addBrd
      : (isTransparentColor(theme.miniAdd) ? theme.addTx : theme.miniAdd);
  }

  if (tone === 'delete') {
    return !isTransparentColor(theme.delBrd)
      ? theme.delBrd
      : (isTransparentColor(theme.miniDel) ? theme.delTx : theme.miniDel);
  }

  return !isTransparentColor(theme.chgBrd)
    ? theme.chgBrd
    : (isTransparentColor(theme.chgBg) ? theme.chgTx : theme.chgBg);
}

export function resolveDiffMiniMapHighlightColor(
  theme: ThemeTokens,
  tone: DiffMiniMapHighlightTone,
): string {
  if (tone === 'mixed') return resolveMiniMapSemanticColor(theme, 'modify');
  return resolveMiniMapSemanticColor(theme, tone);
}

export function resolveDiffMiniMapPaint(
  theme: ThemeTokens,
  tone: DiffMiniMapHighlightTone,
): DiffMiniMapPaint {
  if (tone === 'mixed') {
    return {
      kind: 'gradient',
      stops: [
        { offset: 0, color: resolveMiniMapSemanticColor(theme, 'delete') },
        { offset: 0.5, color: resolveMiniMapSemanticColor(theme, 'modify') },
        { offset: 1, color: resolveMiniMapSemanticColor(theme, 'add') },
      ],
    };
  }

  return {
    kind: 'solid',
    color: resolveDiffMiniMapHighlightColor(theme, tone),
  };
}
