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

export function resolveDiffMiniMapHighlightColor(
  theme: ThemeTokens,
  tone: DiffMiniMapHighlightTone,
): string {
  if (tone === 'add') {
    return isTransparentColor(theme.addBg) ? theme.addBrd : theme.addBg;
  }
  if (tone === 'delete') {
    return isTransparentColor(theme.delBg) ? theme.delBrd : theme.delBg;
  }
  return isTransparentColor(theme.chgBg) ? theme.chgTx : theme.chgBg;
}

export function resolveDiffMiniMapPaint(
  theme: ThemeTokens,
  tone: DiffMiniMapHighlightTone,
): DiffMiniMapPaint {
  if (tone === 'mixed') {
    return {
      kind: 'gradient',
      stops: [
        { offset: 0, color: theme.delBg },
        { offset: 0.5, color: theme.chgBg },
        { offset: 1, color: theme.addBg },
      ],
    };
  }

  return {
    kind: 'solid',
    color: resolveDiffMiniMapHighlightColor(theme, tone),
  };
}
