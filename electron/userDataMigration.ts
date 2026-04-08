import { app } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { logMainWarn } from './logging.js';

interface MigrationMarker {
  migratedAt: string;
  sourcePath: string;
}

const LEGACY_USER_DATA_NAMES = ['SvnExcelDiffTool', 'svn-diff-tool'];
const MIGRATION_MARKER_NAME = '.legacy-user-data-migrated.json';

export interface PendingLegacyUserDataMigration {
  currentUserDataPath: string;
  legacyUserDataPath: string;
  markerPath: string;
}

function directoryHasEntries(targetPath: string): boolean {
  if (!fs.existsSync(targetPath)) return false;
  try {
    return fs.readdirSync(targetPath).length > 0;
  } catch {
    return false;
  }
}

export function resolveLegacyUserDataPath(currentUserDataPath: string = app.getPath('userData')): string | null {
  const appDataPath = app.getPath('appData');
  for (const legacyName of LEGACY_USER_DATA_NAMES) {
    const candidate = path.join(appDataPath, legacyName);
    if (candidate === currentUserDataPath) continue;
    if (directoryHasEntries(candidate)) return candidate;
  }
  return null;
}

export function resolvePendingLegacyUserDataMigration(): PendingLegacyUserDataMigration | null {
  if (!app.isPackaged) return null;

  const currentUserDataPath = app.getPath('userData');
  const markerPath = path.join(currentUserDataPath, MIGRATION_MARKER_NAME);

  if (fs.existsSync(markerPath)) return null;
  if (directoryHasEntries(currentUserDataPath)) return null;

  const legacyUserDataPath = resolveLegacyUserDataPath(currentUserDataPath);
  if (!legacyUserDataPath) return null;

  return {
    currentUserDataPath,
    legacyUserDataPath,
    markerPath,
  };
}

export function performLegacyUserDataMigration(pendingMigration: PendingLegacyUserDataMigration): boolean {
  try {
    fs.mkdirSync(pendingMigration.currentUserDataPath, { recursive: true });
    fs.cpSync(pendingMigration.legacyUserDataPath, pendingMigration.currentUserDataPath, {
      recursive: true,
      force: false,
      errorOnExist: false,
    });

    const marker: MigrationMarker = {
      migratedAt: new Date().toISOString(),
      sourcePath: pendingMigration.legacyUserDataPath,
    };
    fs.writeFileSync(pendingMigration.markerPath, JSON.stringify(marker, null, 2), 'utf-8');
    return true;
  } catch (error) {
    logMainWarn('user-data-migration', error);
    return false;
  }
}

export function ensureLegacyUserDataMigration() {
  const pendingMigration = resolvePendingLegacyUserDataMigration();
  if (!pendingMigration) return;
  performLegacyUserDataMigration(pendingMigration);
}
