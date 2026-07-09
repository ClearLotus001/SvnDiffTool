import * as fs from 'node:fs';
import * as path from 'node:path';

import type {
  InstallerBootstrapConfig,
  InstallerDiffViewerMode,
} from './installerBootstrap';
import {
  normalizeSvnDiffViewerScope,
  type SvnDiffViewerScope,
} from './svnDiffViewerConfigShared';

export interface SvnDiffViewerPreference {
  version: number;
  desiredScope: SvnDiffViewerScope | null;
  updatedAt: string;
}

export interface ReadSvnDiffViewerPreferenceResult {
  hasPreference: boolean;
  desiredScope: SvnDiffViewerScope | null;
}

export interface EffectiveSvnDiffViewerPreference {
  desiredScope: SvnDiffViewerScope | null;
  source: 'user-preference' | 'installer-bootstrap' | 'none';
}

const SVN_DIFF_VIEWER_PREFERENCE_VERSION = 1;
const SVN_DIFF_VIEWER_PREFERENCE_FILE_NAME = 'svn-diff-viewer-preferences.json';

const NO_USER_PREFERENCE: ReadSvnDiffViewerPreferenceResult = {
  hasPreference: false,
  desiredScope: null,
};

function hasOwn(object: object, key: string) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

export function getSvnDiffViewerPreferencePath(userDataPath: string) {
  return path.join(userDataPath, SVN_DIFF_VIEWER_PREFERENCE_FILE_NAME);
}

export function resolveInstallerDiffViewerScope(
  diffViewerMode: InstallerDiffViewerMode | null | undefined,
): SvnDiffViewerScope | null {
  return normalizeSvnDiffViewerScope(diffViewerMode ?? null);
}

export function readSvnDiffViewerPreferenceSync(userDataPath: string): ReadSvnDiffViewerPreferenceResult {
  try {
    const raw = fs.readFileSync(getSvnDiffViewerPreferencePath(userDataPath), 'utf-8');
    const parsed = JSON.parse(raw) as { desiredScope?: unknown } | null;
    if (!parsed || typeof parsed !== 'object' || !hasOwn(parsed, 'desiredScope')) {
      return NO_USER_PREFERENCE;
    }

    if (parsed.desiredScope === null || parsed.desiredScope === 'keep') {
      return {
        hasPreference: true,
        desiredScope: null,
      };
    }

    const desiredScope = typeof parsed.desiredScope === 'string'
      ? normalizeSvnDiffViewerScope(parsed.desiredScope)
      : null;
    if (!desiredScope) return NO_USER_PREFERENCE;

    return {
      hasPreference: true,
      desiredScope,
    };
  } catch {
    return NO_USER_PREFERENCE;
  }
}

export function resolveEffectiveSvnDiffViewerPreference(
  userDataPath: string,
  installerBootstrap: InstallerBootstrapConfig | null,
): EffectiveSvnDiffViewerPreference {
  const userPreference = readSvnDiffViewerPreferenceSync(userDataPath);
  if (userPreference.hasPreference) {
    return {
      desiredScope: userPreference.desiredScope,
      source: 'user-preference',
    };
  }

  const installerScope = resolveInstallerDiffViewerScope(installerBootstrap?.diffViewerMode ?? null);
  if (installerScope) {
    return {
      desiredScope: installerScope,
      source: 'installer-bootstrap',
    };
  }

  return {
    desiredScope: null,
    source: 'none',
  };
}

export async function writeSvnDiffViewerPreference(
  userDataPath: string,
  desiredScope: SvnDiffViewerScope | null,
) {
  const preferencePath = getSvnDiffViewerPreferencePath(userDataPath);
  const payload: SvnDiffViewerPreference = {
    version: SVN_DIFF_VIEWER_PREFERENCE_VERSION,
    desiredScope,
    updatedAt: new Date().toISOString(),
  };

  await fs.promises.mkdir(path.dirname(preferencePath), { recursive: true });
  await fs.promises.writeFile(preferencePath, JSON.stringify(payload, null, 2), 'utf-8');
}
