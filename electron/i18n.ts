import enUS from './locales/en-US.json';
import zhCN from './locales/zh-CN.json';
import { readStartupAppearance, type StartupLocale } from './main/startupAppearance.js';

type Messages = Record<string, string>;
type TranslationParams = Record<string, number | string>;

export type ElectronTranslationKey = keyof typeof enUS;

const MESSAGES_BY_LOCALE: Record<StartupLocale, Messages> = {
  'zh-CN': zhCN as Messages,
  'en-US': enUS as Messages,
};

function formatMessage(template: string, params: TranslationParams = {}): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(params[key] ?? `{${key}}`));
}

export function getElectronLocale(): StartupLocale {
  return readStartupAppearance().locale;
}

export function electronT(
  key: ElectronTranslationKey,
  params?: TranslationParams,
  locale: StartupLocale = getElectronLocale(),
): string {
  return formatMessage(MESSAGES_BY_LOCALE[locale][key] ?? key, params);
}
