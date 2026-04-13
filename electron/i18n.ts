import enUS from './locales/en-US.json';
import { ELECTRON_TRANSLATION_PARAM_KEYS } from './i18nParamKeys.js';
import zhCN from './locales/zh-CN.json';
import { readStartupAppearance, type StartupLocale } from './main/startupAppearance.js';
import {
  coerceMessages,
  translateMessage,
  type LocaleKeyParity,
  type RuntimeTranslationParams,
  type TranslationArgsForKeyMap,
  type TranslationParamsForKeyMap,
} from '../shared/i18n/common.js';

type ElectronLocaleMessagesZh = typeof zhCN;
type ElectronLocaleMessagesEn = typeof enUS;
type ElectronLocaleKeyParity = LocaleKeyParity<ElectronLocaleMessagesZh, ElectronLocaleMessagesEn>;
const electronLocaleKeyParity: ElectronLocaleKeyParity = true;
void electronLocaleKeyParity;

type Messages = ElectronLocaleMessagesZh;
type ElectronTranslationParamKeyMap = typeof ELECTRON_TRANSLATION_PARAM_KEYS;
export type ElectronTranslationParams<K extends ElectronTranslationKey = ElectronTranslationKey> = TranslationParamsForKeyMap<
  ElectronTranslationParamKeyMap,
  K
>;
type ElectronTranslationArgs<K extends ElectronTranslationKey> = TranslationArgsForKeyMap<ElectronTranslationParamKeyMap, K>;

export type ElectronTranslationKey = keyof Messages;

const MESSAGES_BY_LOCALE: Record<StartupLocale, Messages> = {
  'zh-CN': coerceMessages(zhCN, 'Invalid electron locale messages payload.'),
  'en-US': coerceMessages(enUS, 'Invalid electron locale messages payload.'),
};

function getElectronLocale(): StartupLocale {
  return readStartupAppearance().locale;
}

export function electronT<K extends ElectronTranslationKey>(
  key: K,
  ...args: ElectronTranslationArgs<K>
): string {
  const locale = getElectronLocale();
  const params = (args[0] ?? {}) as RuntimeTranslationParams;
  return translateMessage(MESSAGES_BY_LOCALE[locale], key, params);
}
