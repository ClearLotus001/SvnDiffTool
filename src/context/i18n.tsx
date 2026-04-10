import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  getInitialLocale,
  getLocaleLabel as resolveLocaleLabel,
  getNextLocale as resolveNextLocale,
  getShortcuts,
  getThemeLabel as resolveThemeLabel,
  LOCALE_STORAGE_KEY,
  translate,
  type Locale,
  type TranslationFn,
  type TranslationKey,
  type TranslationParams,
} from '@/i18n/core';
import type { ThemeKey } from '@/types';

export type { Locale, TranslationFn, TranslationKey, TranslationParams } from '@/i18n/core';

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: TranslationFn;
  getThemeLabel: (themeKey: ThemeKey) => string;
  getLocaleLabel: (locale: Locale) => string;
  getNextLocale: () => Locale;
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

  useEffect(() => {
    window.svnDiff?.saveStartupAppearance?.({ locale });
  }, [locale]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = locale;
    document.documentElement.setAttribute('data-app-locale', locale);
  }, [locale]);

  const value = useMemo<I18nContextValue>(() => {
    const t = (key: TranslationKey, params?: TranslationParams) => translate(locale, key, params);

    return {
      locale,
      setLocale,
      t,
      getThemeLabel: (themeKey: ThemeKey) => resolveThemeLabel(themeKey, locale),
      getLocaleLabel: (targetLocale: Locale) => resolveLocaleLabel(targetLocale, locale),
      getNextLocale: () => resolveNextLocale(locale),
      shortcuts: getShortcuts(locale),
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
