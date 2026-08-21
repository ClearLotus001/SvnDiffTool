import * as fs from 'node:fs';
import * as path from 'node:path';

export type StartupThemeKey = 'dark' | 'light' | 'hc';
export type StartupLocale = 'zh-CN' | 'en-US';

export interface StartupAppearance {
  themeKey: StartupThemeKey;
  locale: StartupLocale;
}

export interface StartupPalette {
  backgroundColor: string;
  titleBarColor: string;
  titleBarSymbolColor: string;
}

const STARTUP_APPEARANCE_FILE = 'startup-appearance.json';

interface StartupElectronApp {
  getPath(name: 'userData'): string;
  getLocale(): string;
}

interface StartupElectronRuntime {
  app: StartupElectronApp;
  nativeTheme: {
    shouldUseDarkColors: boolean;
  };
}

function isStartupElectronApp(value: unknown): value is {
  getPath: (name: 'userData') => string;
  getLocale?: () => string;
} {
  return Boolean(
    value
    && typeof value === 'object'
    && typeof (value as { getPath?: unknown }).getPath === 'function',
  );
}

function readElectronRuntime(): StartupElectronRuntime | null {
  try {
    const electronModule: unknown = require('electron');
    if (!electronModule || typeof electronModule !== 'object') {
      return null;
    }

    const electronRecord = electronModule as {
      app?: unknown;
      nativeTheme?: unknown;
    };
    const appCandidate = electronRecord.app;
    const nativeThemeCandidate = electronRecord.nativeTheme;
    if (!isStartupElectronApp(appCandidate)) {
      return null;
    }

    const nativeThemeRecord = nativeThemeCandidate && typeof nativeThemeCandidate === 'object'
      ? nativeThemeCandidate as { shouldUseDarkColors?: unknown }
      : {};

    return {
      app: {
        getPath: (name) => appCandidate.getPath(name),
        getLocale: () => (
          typeof appCandidate.getLocale === 'function'
            ? appCandidate.getLocale()
            : ''
        ),
      },
      nativeTheme: {
        shouldUseDarkColors: Boolean(nativeThemeRecord.shouldUseDarkColors),
      },
    };
  } catch {
    return null;
  }
}

function resolveStartupLocale(value: string | null | undefined): StartupLocale {
  return value?.trim().toLowerCase().startsWith('en') ? 'en-US' : 'zh-CN';
}

function resolveFallbackStartupLocale(): StartupLocale {
  return resolveStartupLocale(
    process.env.SVN_DIFF_LOCALE
    ?? process.env.LANG
    ?? Intl.DateTimeFormat().resolvedOptions().locale,
  );
}

function resolveAppearanceFilePath(runtime: StartupElectronRuntime): string {
  return path.join(runtime.app.getPath('userData'), STARTUP_APPEARANCE_FILE);
}

function isThemeKey(value: unknown): value is StartupThemeKey {
  return value === 'dark' || value === 'light' || value === 'hc';
}

function isLocale(value: unknown): value is StartupLocale {
  return value === 'zh-CN' || value === 'en-US';
}

function getDefaultStartupAppearance(runtime: StartupElectronRuntime | null): StartupAppearance {
  return {
    // Keep the native window background aligned with the renderer's persisted
    // settings fallback, which is dark even on a light operating-system theme.
    themeKey: 'dark',
    locale: runtime ? resolveStartupLocale(runtime.app.getLocale()) : resolveFallbackStartupLocale(),
  };
}

export function readStartupAppearance(): StartupAppearance {
  const runtime = readElectronRuntime();
  const fallback = getDefaultStartupAppearance(runtime);
  if (!runtime) {
    return fallback;
  }

  try {
    const filePath = resolveAppearanceFilePath(runtime);
    if (!fs.existsSync(filePath)) {
      return fallback;
    }

    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<StartupAppearance>;

    return {
      themeKey: isThemeKey(parsed.themeKey) ? parsed.themeKey : fallback.themeKey,
      locale: isLocale(parsed.locale) ? parsed.locale : fallback.locale,
    };
  } catch {
    return fallback;
  }
}

export function writeStartupAppearance(next: Partial<StartupAppearance>): void {
  const runtime = readElectronRuntime();
  if (!runtime) {
    return;
  }

  try {
    const current = readStartupAppearance();
    const merged: StartupAppearance = {
      themeKey: isThemeKey(next.themeKey) ? next.themeKey : current.themeKey,
      locale: isLocale(next.locale) ? next.locale : current.locale,
    };

    fs.mkdirSync(runtime.app.getPath('userData'), { recursive: true });
    fs.writeFileSync(resolveAppearanceFilePath(runtime), JSON.stringify(merged), 'utf8');
  } catch {
    // Ignore persistence failures to avoid blocking app startup.
  }
}

export function getStartupPalette(themeKey: StartupThemeKey): StartupPalette {
  switch (themeKey) {
    case 'light':
      return {
        backgroundColor: '#f5f7fb',
        titleBarColor: '#ffffff',
        titleBarSymbolColor: '#09090b',
      };
    case 'hc':
      return {
        backgroundColor: '#000000',
        titleBarColor: '#000000',
        titleBarSymbolColor: '#ffffff',
      };
    case 'dark':
    default:
      return {
        backgroundColor: '#08090d',
        titleBarColor: '#09090b',
        titleBarSymbolColor: '#fafafa',
      };
  }
}
