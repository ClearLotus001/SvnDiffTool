import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import enUS from '../locales/en-US.json';
import zhCN from '../locales/zh-CN.json';
import type { ThemeKey } from '../types';

export type Locale = 'zh-CN' | 'en-US';

const zhCNMessages = zhCN;
type Messages = typeof zhCNMessages;
type TranslationKey = keyof Messages;
type TranslationParams = Record<string, number | string>;

const LOCALE_STORAGE_KEY = 'svn-excel-diff-tool.locale';
const enUSMessages: Messages = enUS;

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

function formatMessage(template: string, params: TranslationParams = {}): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(params[key] ?? `{${key}}`));
}

function getInitialLocale(): Locale {
  if (typeof window === 'undefined') return 'zh-CN';

  const saved = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  return saved === 'en-US' || saved === 'zh-CN' ? saved : 'zh-CN';
}

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, params?: TranslationParams) => string;
  getThemeLabel: (themeKey: ThemeKey) => string;
  shortcuts: [string, string][];
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(getInitialLocale);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    }
  }, [locale]);

  const value = useMemo<I18nContextValue>(() => {
    const messages = MESSAGES_BY_LOCALE[locale];
    const t = (key: TranslationKey, params?: TranslationParams) => formatMessage(messages[key], params);
    const shortcuts = SHORTCUT_DEFS.map(item => [item.key, t(item.labelKey)] as [string, string]);

    return {
      locale,
      setLocale,
      t,
      getThemeLabel: (themeKey: ThemeKey) => t(THEME_LABEL_KEYS[themeKey]),
      shortcuts,
    };
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider.');
  }
  return context;
}
