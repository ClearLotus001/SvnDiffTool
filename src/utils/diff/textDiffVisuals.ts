import { cssAlpha, cssVar } from '@/theme/cssUtils';
import type { DiffLine, SplitRow } from '@/types';

export type TextDiffVisualTone = 'equal' | 'add' | 'delete' | 'modify';

export interface TextDiffCssPalette {
  rowBackground: string;
  accent: string;
  prefix: string;
  inlineHighlight: string;
}

export interface ResolveTextInlineBackgroundOptions {
  tone: TextDiffVisualTone;
  hasSearchRanges: boolean;
  isRangeSelected: boolean;
  hasRowSurfaceOverride?: boolean;
}

export function resolveTextDiffVisualTone(
  line: Pick<DiffLine, 'type'>,
  isReplacementPair = false,
): TextDiffVisualTone {
  if (line.type === 'equal') return 'equal';
  return isReplacementPair ? 'modify' : line.type;
}

export function resolveTextSplitRowVisualTone(
  row: Pick<SplitRow, 'left' | 'right' | 'isReplacementPair'>,
): TextDiffVisualTone {
  if (row.isReplacementPair) return 'modify';

  const leftType = row.left?.type ?? null;
  const rightType = row.right?.type ?? null;

  if (leftType === 'equal' || rightType === 'equal') return 'equal';
  if (leftType != null && rightType != null) return 'modify';
  if (rightType === 'add') return 'add';
  if (leftType === 'delete') return 'delete';
  return 'equal';
}

export function resolveTextDiffCssPalette(
  tone: TextDiffVisualTone,
): TextDiffCssPalette {
  if (tone === 'add') {
    return {
      rowBackground: cssVar('addBg'),
      accent: cssVar('addBrd'),
      prefix: cssVar('addTx'),
      inlineHighlight: cssVar('addHl'),
    };
  }

  if (tone === 'delete') {
    return {
      rowBackground: cssVar('delBg'),
      accent: cssVar('delBrd'),
      prefix: cssVar('delTx'),
      inlineHighlight: cssVar('delHl'),
    };
  }

  if (tone === 'modify') {
    return {
      rowBackground: cssVar('chgBg'),
      accent: cssVar('chgTx'),
      prefix: cssVar('chgTx'),
      inlineHighlight: cssAlpha('chgTx', '40'),
    };
  }

  return {
    rowBackground: 'transparent',
    accent: 'transparent',
    prefix: cssVar('t2'),
    inlineHighlight: cssVar('bg3'),
  };
}

export function resolveTextInlineBackground(
  options: ResolveTextInlineBackgroundOptions,
): string | undefined {
  if (options.hasRowSurfaceOverride || options.hasSearchRanges || options.isRangeSelected) {
    return undefined;
  }

  return resolveTextDiffCssPalette(options.tone).rowBackground;
}
