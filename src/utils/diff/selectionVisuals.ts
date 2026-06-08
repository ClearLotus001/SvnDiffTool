import { cssAlpha, cssVar } from '@/theme/cssUtils';

export interface DiffSelectionSurfaceOptions {
  selectionAccentColor?: string | undefined;
  isBaseLineSelected: boolean;
  isMineLineSelected: boolean;
  isRangeSelected: boolean;
  isActiveSearch: boolean;
}

export interface DiffSelectionSurfaces {
  selectionAccent: string;
  hasSelectedGutter: boolean;
  rangeSelectionSurface: string | undefined;
  activeCapsuleSurface: string | undefined;
  gutterBackground: string;
  gutterShadow: string;
  diffHighlightBackground: string | undefined;
}

export interface CollapseSelectionPalette {
  background: string;
  border: string;
  accent: string;
  buttonBorder: string;
  buttonText: string;
  labelText: string;
  subduedText: string;
}

export interface CollapseSelectionSurfaces {
  palette: CollapseSelectionPalette;
  gutterBackground: string;
  gutterShadow: string;
}

export function getManualLineSelectionAccent(): string {
  return cssVar('acc2');
}

function resolveSelectionAccentColor(options: {
  selectionAccentColor?: string | undefined;
  isBaseLineSelected: boolean;
  isMineLineSelected: boolean;
}): string {
  if (options.selectionAccentColor) return options.selectionAccentColor;
  return getManualLineSelectionAccent();
}

export function buildDiffSelectionSurfaces(
  options: DiffSelectionSurfaceOptions,
): DiffSelectionSurfaces {
  const selectionAccent = resolveSelectionAccentColor(options);
  const hasSelectedGutter = options.isBaseLineSelected || options.isMineLineSelected;
  const rangeSelectionSurface = options.isRangeSelected
    ? `linear-gradient(90deg,
        color-mix(in srgb, ${selectionAccent} 20%, transparent) 0%,
        color-mix(in srgb, ${selectionAccent} 14%, transparent) 18%,
        color-mix(in srgb, ${selectionAccent} 7%, transparent) 100%)`
    : undefined;
  const activeCapsuleSurface = options.isActiveSearch
    ? `linear-gradient(90deg,
        color-mix(in srgb, ${cssVar('bg1')} 88%, ${cssVar('searchHl')} 12%) 0%,
        color-mix(in srgb, ${cssVar('bg1')} 90%, ${cssVar('searchHl')} 10%) 24%,
        color-mix(in srgb, ${cssVar('bg0')} 94%, ${cssVar('searchHl')} 6%) 100%)`
    : rangeSelectionSurface;
  const gutterBackground = options.isActiveSearch
    ? 'transparent'
    : hasSelectedGutter
      ? `linear-gradient(180deg,
          color-mix(in srgb, ${selectionAccent} 26%, ${cssVar('lnBg')} 74%) 0%,
          color-mix(in srgb, ${selectionAccent} 16%, ${cssVar('bg0')} 84%) 100%)`
      : cssVar('lnBg');
  const gutterShadow = options.isActiveSearch
    ? 'none'
    : hasSelectedGutter
      ? `inset -1px 0 0 color-mix(in srgb, ${selectionAccent} 18%, transparent),
         8px 0 18px -14px color-mix(in srgb, ${selectionAccent} 30%, transparent)`
      : `8px 0 12px -12px ${cssAlpha('border2', '52')}`;
  const diffHighlightBackground = undefined;

  return {
    selectionAccent,
    hasSelectedGutter,
    rangeSelectionSurface,
    activeCapsuleSurface,
    gutterBackground,
    gutterShadow,
    diffHighlightBackground,
  };
}

export function buildCollapseSelectionSurfaces(accentColor: string): CollapseSelectionSurfaces {
  return {
    palette: {
      background: `linear-gradient(90deg,
        color-mix(in srgb, ${cssVar('bg1')} 76%, ${accentColor} 24%) 0%,
        color-mix(in srgb, ${cssVar('bg1')} 88%, ${accentColor} 12%) 18%,
        color-mix(in srgb, ${accentColor} 6%, transparent) 100%)`,
      border: `color-mix(in srgb, ${accentColor} 22%, transparent)`,
      accent: accentColor,
      buttonBorder: `color-mix(in srgb, ${accentColor} 28%, transparent)`,
      buttonText: accentColor,
      labelText: accentColor,
      subduedText: `color-mix(in srgb, ${accentColor} 58%, ${cssVar('t2')} 42%)`,
    },
    gutterBackground: `linear-gradient(180deg,
      color-mix(in srgb, ${accentColor} 18%, ${cssVar('lnBg')} 82%) 0%,
      color-mix(in srgb, ${accentColor} 12%, ${cssVar('bg0')} 88%) 100%)`,
    gutterShadow: `inset -1px 0 0 color-mix(in srgb, ${accentColor} 18%, transparent),
     8px 0 18px -14px color-mix(in srgb, ${accentColor} 30%, transparent)`,
  };
}
