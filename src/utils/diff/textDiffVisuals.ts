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
  hasTextSelection?: boolean;
}

export interface ResolveTextSelectedRowBackgroundOptions {
  tone: TextDiffVisualTone;
  isRangeSelected: boolean;
}

export interface ResolveTextEmptySideBackgroundOptions {
  isRangeSelected: boolean;
  selectionAccent?: string | undefined;
}

export interface ResolveTextEmptySideBackgroundPositionOptions {
  visualRowIndex?: number | null | undefined;
  rowHeight: number;
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
      accent: cssVar('chgBrd'),
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
  if (
    options.hasRowSurfaceOverride
    || options.isRangeSelected
  ) {
    return undefined;
  }

  return resolveTextDiffCssPalette(options.tone).rowBackground;
}

export function composeTextRowBackground(
  ...layers: Array<string | undefined>
): string | undefined {
  const resolvedLayers = layers.filter((layer): layer is string => Boolean(layer));
  return resolvedLayers.length > 0 ? resolvedLayers.join(', ') : undefined;
}

export function resolveTextSelectedRowBackground(
  options: ResolveTextSelectedRowBackgroundOptions,
): string | undefined {
  if (!options.isRangeSelected) return undefined;

  const semanticBackground = resolveTextDiffCssPalette(options.tone).rowBackground;
  return semanticBackground === 'transparent' ? undefined : semanticBackground;
}

export function resolveTextEmptySideBackground(
  options: ResolveTextEmptySideBackgroundOptions,
): string {
  const selectionAccent = options.selectionAccent ?? cssVar('acc2');
  const selectionOverlay = options.isRangeSelected
    ? `linear-gradient(90deg,
        color-mix(in srgb, ${selectionAccent} 18%, transparent) 0%,
        color-mix(in srgb, ${selectionAccent} 9%, transparent) 40%,
      color-mix(in srgb, ${selectionAccent} 4%, transparent) 100%)`
    : undefined;
  const stripeLayer = `repeating-linear-gradient(135deg,
    color-mix(in srgb, ${cssVar('border2')} 24%, transparent) 0,
    color-mix(in srgb, ${cssVar('border2')} 24%, transparent) 1px,
    transparent 1px,
    transparent 8px)`;
  const baseLayer = `linear-gradient(90deg,
    color-mix(in srgb, ${cssVar('bg2')} 94%, transparent) 0%,
    color-mix(in srgb, ${cssVar('bg2')} 86%, transparent) 52%,
    color-mix(in srgb, ${cssVar('bg2')} 78%, transparent) 100%)`;

  return composeTextRowBackground(selectionOverlay, stripeLayer, baseLayer)!;
}

export function resolveTextEmptySideBackgroundPosition(
  options: ResolveTextEmptySideBackgroundPositionOptions,
): string | undefined {
  if (options.visualRowIndex == null) return undefined;
  return `0 ${-(options.visualRowIndex * options.rowHeight)}px`;
}
