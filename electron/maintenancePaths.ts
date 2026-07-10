import * as fs from 'node:fs';
import * as path from 'node:path';

import type { InstallerBootstrapConfig } from './installerBootstrap';
import { logMainWarn } from './logging.js';
import {
  isSafeControlledCacheRootPath,
  isSafePathWithinRoot,
  removeControlledDirectorySync,
} from './runtimePaths';

const CACHE_SUBDIRECTORIES_TO_MIGRATE = ['session-data', 'disk-cache'] as const;

type CacheRootRelationship = 'same' | 'overlapping' | 'disjoint';

export interface UninstallCleanupPaths {
  userDataPath?: string | null;
  sessionDataPath?: string | null;
  currentCacheRoot?: string | null;
  previousCacheRoot?: string | null;
}

function removeDirectorySync(targetPath: string | null | undefined) {
  const normalized = targetPath?.trim();
  if (!normalized) return false;

  try {
    fs.rmSync(normalized, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

function toComparablePath(targetPath: string): string {
  const resolvedPath = path.resolve(targetPath.trim());
  const missingSegments: string[] = [];
  let existingAncestor = resolvedPath;
  let canonicalPath = resolvedPath;

  while (true) {
    try {
      canonicalPath = path.join(fs.realpathSync.native(existingAncestor), ...missingSegments);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') break;
      const parentPath = path.dirname(existingAncestor);
      if (parentPath === existingAncestor) break;
      missingSegments.unshift(path.basename(existingAncestor));
      existingAncestor = parentPath;
    }
  }
  const normalizedPath = path.normalize(canonicalPath);
  return process.platform === 'win32' ? normalizedPath.toLowerCase() : normalizedPath;
}

function isPathInside(parentPath: string, candidatePath: string): boolean {
  const relativePath = path.relative(parentPath, candidatePath);
  return relativePath !== ''
    && relativePath !== '..'
    && !relativePath.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relativePath);
}

function getCacheRootRelationship(previousCacheRoot: string, currentCacheRoot: string): CacheRootRelationship {
  const comparablePreviousRoot = toComparablePath(previousCacheRoot);
  const comparableCurrentRoot = toComparablePath(currentCacheRoot);
  if (comparablePreviousRoot === comparableCurrentRoot) return 'same';
  if (
    isPathInside(comparablePreviousRoot, comparableCurrentRoot)
    || isPathInside(comparableCurrentRoot, comparablePreviousRoot)
  ) {
    return 'overlapping';
  }
  return 'disjoint';
}

export function cleanupPreviousCacheRoot(
  previousConfig: InstallerBootstrapConfig | null,
  currentConfig: InstallerBootstrapConfig | null,
): boolean {
  const previousCacheRoot = previousConfig?.cacheRoot?.trim() ?? '';
  const currentCacheRoot = currentConfig?.cacheRoot?.trim() ?? '';
  if (!previousCacheRoot) return true;
  if (!currentCacheRoot) return false;
  if (!isSafeControlledCacheRootPath(previousCacheRoot) || !isSafeControlledCacheRootPath(currentCacheRoot)) return false;

  const relationship = getCacheRootRelationship(previousCacheRoot, currentCacheRoot);
  if (relationship === 'same') return true;
  if (relationship === 'overlapping') {
    logMainWarn('maintenance', 'previous cache cleanup skipped because cache roots overlap');
    return false;
  }
  return removeControlledDirectorySync(previousCacheRoot);
}

export function migratePreviousCacheRoot(
  previousConfig: InstallerBootstrapConfig | null,
  currentConfig: InstallerBootstrapConfig | null,
): boolean {
  const previousCacheRoot = previousConfig?.cacheRoot?.trim() ?? '';
  const currentCacheRoot = currentConfig?.cacheRoot?.trim() ?? '';

  if (!previousCacheRoot) return true;
  if (!currentCacheRoot) return false;
  if (!isSafeControlledCacheRootPath(previousCacheRoot) || !isSafeControlledCacheRootPath(currentCacheRoot)) return false;

  const relationship = getCacheRootRelationship(previousCacheRoot, currentCacheRoot);
  if (relationship === 'same') return true;
  if (relationship === 'overlapping') {
    logMainWarn('maintenance', 'cache migration skipped because cache roots overlap');
    return false;
  }
  if (!fs.existsSync(previousCacheRoot)) return true;

  let migrationSucceeded = true;

  CACHE_SUBDIRECTORIES_TO_MIGRATE.forEach((directoryName) => {
    const sourcePath = path.join(previousCacheRoot, directoryName);
    if (!fs.existsSync(sourcePath)) return;

    const targetPath = path.join(currentCacheRoot, directoryName);
    try {
      if (
        !isSafePathWithinRoot(previousCacheRoot, sourcePath)
        || !isSafePathWithinRoot(currentCacheRoot, targetPath)
      ) {
        throw new Error(`Unsafe cache migration path for ${directoryName}.`);
      }
      fs.mkdirSync(targetPath, { recursive: true });
      if (!isSafePathWithinRoot(currentCacheRoot, targetPath)) {
        throw new Error(`Unsafe cache migration destination for ${directoryName}.`);
      }
      fs.cpSync(sourcePath, targetPath, {
        recursive: true,
        force: false,
        errorOnExist: false,
        filter: (candidateSourcePath, candidateDestinationPath) => {
          if (fs.lstatSync(candidateSourcePath).isSymbolicLink()) return false;
          if (!isSafePathWithinRoot(currentCacheRoot, candidateDestinationPath)) {
            throw new Error(`Unsafe cache migration destination: ${candidateDestinationPath}`);
          }
          return true;
        },
      });
    } catch (error) {
      migrationSucceeded = false;
      logMainWarn('maintenance', `failed to migrate ${directoryName}`, error);
    }
  });

  return migrationSucceeded;
}

export function migrateAndCleanupPreviousCacheRoot(
  previousConfig: InstallerBootstrapConfig | null,
  currentConfig: InstallerBootstrapConfig | null,
): boolean {
  if (!migratePreviousCacheRoot(previousConfig, currentConfig)) return false;
  return cleanupPreviousCacheRoot(previousConfig, currentConfig);
}

export function cleanupRuntimeArtifactsForUninstall(paths: UninstallCleanupPaths) {
  removeDirectorySync(paths.userDataPath);
  removeDirectorySync(paths.sessionDataPath);
  void removeControlledDirectorySync(paths.currentCacheRoot);
  void removeControlledDirectorySync(paths.previousCacheRoot);
}
