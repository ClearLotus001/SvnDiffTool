import type { LayoutMode, ThemeKey, WorkbookCompareMode } from '../types';

export interface AppSettings {
  themeKey: ThemeKey;
  layout: LayoutMode;
  collapseCtx: boolean;
  showWhitespace: boolean;
  showHiddenColumns: boolean;
  workbookCompareMode: WorkbookCompareMode;
  fontSize: number;
}

const SETTINGS_STORAGE_KEY = 'svn-excel-diff-tool.settings';

const DEFAULT_SETTINGS: AppSettings = {
  themeKey: 'light',
  layout: 'split-h',
  collapseCtx: true,
  showWhitespace: false,
  showHiddenColumns: false,
  workbookCompareMode: 'strict',
  fontSize: 14,
};

function isThemeKey(value: unknown): value is ThemeKey {
  return value === 'dark' || value === 'light' || value === 'hc';
}

function isLayoutMode(value: unknown): value is LayoutMode {
  return value === 'unified' || value === 'split-h' || value === 'split-v';
}

function isWorkbookCompareMode(value: unknown): value is WorkbookCompareMode {
  return value === 'strict' || value === 'content';
}

function clampFontSize(value: unknown): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return DEFAULT_SETTINGS.fontSize;
  return Math.max(10, Math.min(20, Math.round(num)));
}

export function getStoredAppSettings(): AppSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;

  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;

    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      themeKey: isThemeKey(parsed.themeKey) ? parsed.themeKey : DEFAULT_SETTINGS.themeKey,
      layout: isLayoutMode(parsed.layout) ? parsed.layout : DEFAULT_SETTINGS.layout,
      collapseCtx: typeof parsed.collapseCtx === 'boolean' ? parsed.collapseCtx : DEFAULT_SETTINGS.collapseCtx,
      showWhitespace: typeof parsed.showWhitespace === 'boolean' ? parsed.showWhitespace : DEFAULT_SETTINGS.showWhitespace,
      showHiddenColumns: typeof parsed.showHiddenColumns === 'boolean' ? parsed.showHiddenColumns : DEFAULT_SETTINGS.showHiddenColumns,
      workbookCompareMode: isWorkbookCompareMode(parsed.workbookCompareMode)
        ? parsed.workbookCompareMode
        : DEFAULT_SETTINGS.workbookCompareMode,
      fontSize: clampFontSize(parsed.fontSize),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveStoredAppSettings(settings: AppSettings) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage failures so the app remains usable.
  }
}
