import { app, nativeTheme } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolveLegacyUserDataPath } from '../userDataMigration.js';

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

function resolveAppearanceFilePath(): string {
  return path.join(app.getPath('userData'), STARTUP_APPEARANCE_FILE);
}

function resolveLegacyAppearanceFilePath(currentFilePath: string): string | null {
  const currentUserDataPath = path.dirname(currentFilePath);
  const legacyUserDataPath = resolveLegacyUserDataPath(currentUserDataPath);
  if (!legacyUserDataPath) return null;

  const legacyFilePath = path.join(legacyUserDataPath, STARTUP_APPEARANCE_FILE);
  return fs.existsSync(legacyFilePath) ? legacyFilePath : null;
}

function isThemeKey(value: unknown): value is StartupThemeKey {
  return value === 'dark' || value === 'light' || value === 'hc';
}

function isLocale(value: unknown): value is StartupLocale {
  return value === 'zh-CN' || value === 'en-US';
}

function getDefaultStartupAppearance(): StartupAppearance {
  return {
    themeKey: nativeTheme.shouldUseDarkColors ? 'dark' : 'light',
    locale: app.getLocale().toLowerCase().startsWith('en') ? 'en-US' : 'zh-CN',
  };
}

export function readStartupAppearance(): StartupAppearance {
  try {
    const filePath = resolveAppearanceFilePath();
    const effectiveFilePath = fs.existsSync(filePath)
      ? filePath
      : resolveLegacyAppearanceFilePath(filePath);
    if (!effectiveFilePath) {
      return getDefaultStartupAppearance();
    }

    const raw = fs.readFileSync(effectiveFilePath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<StartupAppearance>;
    const fallback = getDefaultStartupAppearance();

    return {
      themeKey: isThemeKey(parsed.themeKey) ? parsed.themeKey : fallback.themeKey,
      locale: isLocale(parsed.locale) ? parsed.locale : fallback.locale,
    };
  } catch {
    return getDefaultStartupAppearance();
  }
}

export function writeStartupAppearance(next: Partial<StartupAppearance>): void {
  try {
    const current = readStartupAppearance();
    const merged: StartupAppearance = {
      themeKey: isThemeKey(next.themeKey) ? next.themeKey : current.themeKey,
      locale: isLocale(next.locale) ? next.locale : current.locale,
    };

    fs.mkdirSync(app.getPath('userData'), { recursive: true });
    fs.writeFileSync(resolveAppearanceFilePath(), JSON.stringify(merged), 'utf8');
  } catch {
    // Ignore persistence failures to avoid blocking app startup.
  }
}

export function getStartupPalette(themeKey: StartupThemeKey): StartupPalette {
  switch (themeKey) {
    case 'light':
      return {
        backgroundColor: '#f4f4f5',
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
        backgroundColor: '#09090b',
        titleBarColor: '#09090b',
        titleBarSymbolColor: '#fafafa',
      };
  }
}
