import enUS from '@/locales/en-US.json';
import zhCN from '@/locales/zh-CN.json';
import type { ThemeKey } from '@/types';

export type Locale = 'zh-CN' | 'en-US';

type Messages = Record<string, string>;
export type TranslationKey = string;
export type TranslationParams = Record<string, number | string>;
export type TranslationFn = (key: TranslationKey, params?: TranslationParams) => string;

export const LOCALE_STORAGE_KEY = 'svn-excel-diff-tool.locale';

function coerceMessages(value: unknown): Messages {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid locale messages payload.');
  }
  return value as Messages;
}

const zhCNMessages = coerceMessages(zhCN as unknown);
const enUSMessages = coerceMessages(enUS as unknown);

const MESSAGES_BY_LOCALE: Record<Locale, Messages> = {
  'zh-CN': zhCNMessages,
  'en-US': enUSMessages,
};

const SHORTCUT_DEFS: { key: string; labelKey: TranslationKey }[] = [
  { key: 'F7', labelKey: 'shortcutNextHunk' },
  { key: 'Shift+F7', labelKey: 'shortcutPrevHunk' },
  { key: 'Ctrl+F', labelKey: 'shortcutToggleSearch' },
  { key: 'Enter / F3', labelKey: 'shortcutNextSearchMatch' },
  { key: 'Shift+Enter', labelKey: 'shortcutPrevSearchMatch' },
  { key: 'Escape', labelKey: 'shortcutCloseDialog' },
  { key: 'Ctrl+G', labelKey: 'shortcutGoto' },
  { key: 'Ctrl+]', labelKey: 'shortcutIncreaseFont' },
  { key: 'Ctrl+[', labelKey: 'shortcutDecreaseFont' },
  { key: 'Alt+[', labelKey: 'shortcutPrevCollapse' },
  { key: 'Alt+]', labelKey: 'shortcutNextCollapse' },
  { key: 'Ctrl+\\', labelKey: 'shortcutToggleWhitespace' },
  { key: 'F1', labelKey: 'shortcutTogglePanel' },
];

const THEME_LABEL_KEYS: Record<ThemeKey, TranslationKey> = {
  dark: 'themeDark',
  light: 'themeLight',
  hc: 'themeHighContrast',
};

const LOCALE_LABEL_KEYS: Record<Locale, TranslationKey> = {
  'zh-CN': 'toolbarLanguageZh',
  'en-US': 'toolbarLanguageEn',
};

const NEXT_LOCALE_BY_LOCALE: Record<Locale, Locale> = {
  'zh-CN': 'en-US',
  'en-US': 'zh-CN',
};

export function isLocale(value: unknown): value is Locale {
  return value === 'zh-CN' || value === 'en-US';
}

export function formatMessage(template: string, params: TranslationParams = {}): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(params[key] ?? `{${key}}`));
}

export function translate(locale: Locale, key: TranslationKey, params?: TranslationParams): string {
  const messages = MESSAGES_BY_LOCALE[locale];
  return formatMessage(messages[key] ?? key, params);
}

export function getThemeLabel(themeKey: ThemeKey, locale: Locale): string {
  return translate(locale, THEME_LABEL_KEYS[themeKey]);
}

export function getLocaleLabel(locale: Locale, displayLocale: Locale): string {
  return translate(displayLocale, LOCALE_LABEL_KEYS[locale]);
}

export function getNextLocale(locale: Locale): Locale {
  return NEXT_LOCALE_BY_LOCALE[locale];
}

export function getShortcuts(locale: Locale): [string, string][] {
  return SHORTCUT_DEFS.map((item) => [item.key, translate(locale, item.labelKey)] as [string, string]);
}

export function detectNavigatorLocale(): Locale {
  if (typeof navigator === 'undefined') return 'zh-CN';

  const candidates = Array.isArray(navigator.languages) && navigator.languages.length > 0
    ? navigator.languages
    : [navigator.language];

  for (const candidate of candidates) {
    const normalized = String(candidate ?? '').toLowerCase();
    if (normalized.startsWith('zh')) return 'zh-CN';
    if (normalized.startsWith('en')) return 'en-US';
  }

  return 'zh-CN';
}

function readStoredLocale(): Locale | null {
  try {
    const saved = globalThis.localStorage?.getItem(LOCALE_STORAGE_KEY);
    return isLocale(saved) ? saved : null;
  } catch {
    return null;
  }
}

export function getInitialLocale(): Locale {
  return readStoredLocale() ?? detectNavigatorLocale();
}

export function getRuntimeLocale(): Locale {
  return getInitialLocale();
}
