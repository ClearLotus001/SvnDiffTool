import { app } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';

interface MigrationMarker {
  migratedAt: string;
  sourcePath: string;
}

const LEGACY_USER_DATA_NAMES = ['SvnExcelDiffTool', 'svn-diff-tool'];
const MIGRATION_MARKER_NAME = '.legacy-user-data-migrated.json';

function directoryHasEntries(targetPath: string): boolean {
  if (!fs.existsSync(targetPath)) return false;
  try {
    return fs.readdirSync(targetPath).length > 0;
  } catch {
    return false;
  }
}

function findLegacyUserDataPath(currentUserDataPath: string): string | null {
  const appDataPath = app.getPath('appData');
  for (const legacyName of LEGACY_USER_DATA_NAMES) {
    const candidate = path.join(appDataPath, legacyName);
    if (candidate === currentUserDataPath) continue;
    if (directoryHasEntries(candidate)) return candidate;
  }
  return null;
}

export function ensureLegacyUserDataMigration() {
  if (!app.isPackaged) return;

  const currentUserDataPath = app.getPath('userData');
  const markerPath = path.join(currentUserDataPath, MIGRATION_MARKER_NAME);

  if (fs.existsSync(markerPath)) return;
  if (directoryHasEntries(currentUserDataPath)) return;

  const legacyUserDataPath = findLegacyUserDataPath(currentUserDataPath);
  if (!legacyUserDataPath) return;

  try {
    fs.mkdirSync(currentUserDataPath, { recursive: true });
    fs.cpSync(legacyUserDataPath, currentUserDataPath, {
      recursive: true,
      force: false,
      errorOnExist: false,
    });

    const marker: MigrationMarker = {
      migratedAt: new Date().toISOString(),
      sourcePath: legacyUserDataPath,
    };
    fs.writeFileSync(markerPath, JSON.stringify(marker, null, 2), 'utf-8');
  } catch (error) {
    console.warn('[user-data-migration]', error);
  }
}
