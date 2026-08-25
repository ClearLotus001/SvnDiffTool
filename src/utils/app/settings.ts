import type { LayoutMode, ThemeKey, WorkbookCompareMode } from '@/types';

export interface AppSettings {
  themeKey: ThemeKey;
  layout: LayoutMode;
  collapseCtx: boolean;
  showOnlyDifferences: boolean;
  showWhitespace: boolean;
  showHiddenColumns: boolean;
  botEnabled: boolean;
  workbookCompareMode: WorkbookCompareMode;
  fontSize: number;
}

const SETTINGS_STORAGE_KEY = 'versora.settings';
const SETTINGS_SCHEMA_VERSION = 3;

const DEFAULT_SETTINGS: AppSettings = {
  themeKey: 'dark',
  layout: 'split-h',
  collapseCtx: true,
  showOnlyDifferences: true,
  showWhitespace: false,
  showHiddenColumns: false,
  botEnabled: true,
  workbookCompareMode: 'strict',
  fontSize: 12,
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

    const parsed = JSON.parse(raw) as Partial<AppSettings> & { settingsSchemaVersion?: unknown };
    const schemaVersion = typeof parsed.settingsSchemaVersion === 'number'
      ? parsed.settingsSchemaVersion
      : 0;
    return {
      themeKey: isThemeKey(parsed.themeKey) ? parsed.themeKey : DEFAULT_SETTINGS.themeKey,
      layout: isLayoutMode(parsed.layout) ? parsed.layout : DEFAULT_SETTINGS.layout,
      collapseCtx: typeof parsed.collapseCtx === 'boolean' ? parsed.collapseCtx : DEFAULT_SETTINGS.collapseCtx,
      showOnlyDifferences: schemaVersion >= 2 && typeof parsed.showOnlyDifferences === 'boolean'
        ? parsed.showOnlyDifferences
        : DEFAULT_SETTINGS.showOnlyDifferences,
      showWhitespace: typeof parsed.showWhitespace === 'boolean' ? parsed.showWhitespace : DEFAULT_SETTINGS.showWhitespace,
      showHiddenColumns: typeof parsed.showHiddenColumns === 'boolean' ? parsed.showHiddenColumns : DEFAULT_SETTINGS.showHiddenColumns,
      botEnabled: schemaVersion >= 3 && typeof parsed.botEnabled === 'boolean'
        ? parsed.botEnabled
        : DEFAULT_SETTINGS.botEnabled,
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
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({
      ...settings,
      settingsSchemaVersion: SETTINGS_SCHEMA_VERSION,
    }));
  } catch {
    // Ignore storage failures so the app remains usable.
  }
}
