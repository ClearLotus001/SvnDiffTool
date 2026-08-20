import enUS from '@/locales/en-US.json';
import zhCN from '@/locales/zh-CN.json';
import { RENDERER_TRANSLATION_PARAM_KEYS } from '@/i18n/paramKeys';
import type { ThemeKey } from '@/types';
import {
  coerceMessages,
  translateMessage,
  type LocaleKeyParity,
  type RuntimeTranslationParams,
  type TranslationArgsForKeyMap,
  type TranslationParamsForKeyMap,
} from '../../shared/i18n/common';

export type Locale = 'zh-CN' | 'en-US';

type RendererLocaleMessagesZh = typeof zhCN;
type RendererLocaleMessagesEn = typeof enUS;
type RendererLocaleKeyParity = LocaleKeyParity<RendererLocaleMessagesZh, RendererLocaleMessagesEn>;
const rendererLocaleKeyParity: RendererLocaleKeyParity = true;
void rendererLocaleKeyParity;

type Messages = RendererLocaleMessagesZh;
export type TranslationKey = keyof Messages;
type TranslationParamKeyMap = typeof RENDERER_TRANSLATION_PARAM_KEYS;
type TranslationArgs<K extends TranslationKey> = TranslationArgsForKeyMap<TranslationParamKeyMap, K>;

export type TranslationParams<K extends TranslationKey = TranslationKey> = TranslationParamsForKeyMap<TranslationParamKeyMap, K>;
export type TranslationFn = <K extends TranslationKey>(key: K, ...args: TranslationArgs<K>) => string;

export const LOCALE_STORAGE_KEY = 'versora.locale';
const LEGACY_LOCALE_STORAGE_KEY = 'svn-excel-diff-tool.locale';

const zhCNMessages = coerceMessages(zhCN, 'Invalid locale messages payload.');
const enUSMessages = coerceMessages(enUS, 'Invalid locale messages payload.');

const MESSAGES_BY_LOCALE: Record<Locale, Messages> = {
  'zh-CN': zhCNMessages,
  'en-US': enUSMessages,
};

const SHORTCUT_DEFS = [
  { key: 'F7', labelKey: 'shortcutNextHunk' },
  { key: 'Shift+F7', labelKey: 'shortcutPrevHunk' },
  { key: 'Ctrl+F', labelKey: 'shortcutToggleSearch' },
  { key: '↓ / F3', labelKey: 'shortcutNextSearchMatch' },
  { key: '↑ / Shift+F3', labelKey: 'shortcutPrevSearchMatch' },
  { key: 'Escape', labelKey: 'shortcutCloseDialog' },
  { key: 'Ctrl+G', labelKey: 'shortcutGoto' },
  { key: 'Ctrl+]', labelKey: 'shortcutIncreaseFont' },
  { key: 'Ctrl+[', labelKey: 'shortcutDecreaseFont' },
  { key: 'Alt+[', labelKey: 'shortcutPrevCollapse' },
  { key: 'Alt+]', labelKey: 'shortcutNextCollapse' },
  { key: 'Ctrl+\\', labelKey: 'shortcutToggleWhitespace' },
  { key: 'F1', labelKey: 'shortcutTogglePanel' },
 ] satisfies ReadonlyArray<{ key: string; labelKey: TranslationKey }>;

const THEME_LABEL_KEYS = {
  dark: 'themeDark',
  light: 'themeLight',
  hc: 'themeHighContrast',
} satisfies Record<ThemeKey, TranslationKey>;

const LOCALE_LABEL_KEYS = {
  'zh-CN': 'toolbarLanguageZh',
  'en-US': 'toolbarLanguageEn',
} satisfies Record<Locale, TranslationKey>;

const NEXT_LOCALE_BY_LOCALE: Record<Locale, Locale> = {
  'zh-CN': 'en-US',
  'en-US': 'zh-CN',
};

function isLocale(value: unknown): value is Locale {
  return value === 'zh-CN' || value === 'en-US';
}

export function translate<K extends TranslationKey>(
  locale: Locale,
  key: K,
  ...args: TranslationArgs<K>
): string {
  const messages = MESSAGES_BY_LOCALE[locale];
  const params = (args[0] ?? {}) as RuntimeTranslationParams;
  return translateMessage(messages, key, params);
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

function detectNavigatorLocale(): Locale {
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
    const saved = globalThis.localStorage?.getItem(LOCALE_STORAGE_KEY)
      ?? globalThis.localStorage?.getItem(LEGACY_LOCALE_STORAGE_KEY);
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
