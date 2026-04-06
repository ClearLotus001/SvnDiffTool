import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  getBuildWorkspaceDir,
  removeDirectoryWithRetries,
} from './build-workspace';
import { runBuildCommand } from './buildCommand';
import {
  getDirectorySizeBytes,
  getFileSizeBytes,
  getReleaseDir,
  listLocaleFileNames,
  updatePackageSizeReport,
} from './packageSizeReport';

const rootDir = path.resolve(__dirname, '..');
type PublishMode = 'never' | 'always' | 'onTag' | 'onTagOrDraft';

interface PackageJsonShape {
  version?: string;
}

interface ElectronPackageJsonShape {
  version?: string;
}

function readPackageVersion(): string {
  const raw = fs.readFileSync(path.join(rootDir, 'package.json'), 'utf-8');
  const parsed = JSON.parse(raw) as PackageJsonShape;
  const version = parsed.version?.trim();
  if (!version) {
    throw new Error('Unable to resolve package version from package.json.');
  }
  return version;
}

function readInstalledElectronVersion(): string {
  const raw = fs.readFileSync(path.join(rootDir, 'node_modules', 'electron', 'package.json'), 'utf-8');
  const parsed = JSON.parse(raw) as ElectronPackageJsonShape;
  const version = parsed.version?.trim();
  if (!version) {
    throw new Error('Unable to resolve installed Electron version from node_modules/electron/package.json.');
  }
  return version;
}

function findLocalElectronDistZip(): string | null {
  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) return null;

  const electronVersion = readInstalledElectronVersion();
  const zipFileName = `electron-v${electronVersion}-win32-x64.zip`;
  const cacheRoot = path.join(localAppData, 'electron', 'Cache');
  const directPath = path.join(cacheRoot, zipFileName);

  if (fs.existsSync(directPath)) {
    return directPath;
  }

  if (!fs.existsSync(cacheRoot)) return null;

  for (const entry of fs.readdirSync(cacheRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const candidate = path.join(cacheRoot, entry.name, zipFileName);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function parsePublishMode(): PublishMode {
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) continue;
    if (arg.startsWith('--publish=')) {
      const value = arg.slice('--publish='.length);
      if (value === 'never' || value === 'always' || value === 'onTag' || value === 'onTagOrDraft') {
        return value;
      }
      break;
    }
    if (arg === '--publish') {
      const value = args[index + 1];
      if (value === 'never' || value === 'always' || value === 'onTag' || value === 'onTagOrDraft') {
        return value;
      }
      break;
    }
  }
  return 'never';
}

function shouldCopyReleaseArtifact(entry: fs.Dirent): boolean {
  if (!entry.isFile()) return false;
  if (entry.name === 'builder-debug.yml') return false;
  if (entry.name.startsWith('__uninstaller-')) return false;
  return true;
}

async function copyReleaseArtifacts(tempOutputDir: string, releaseDir: string) {
  const entries = await fs.promises.readdir(tempOutputDir, { withFileTypes: true });
  const copiedArtifacts: Array<{ fileName: string; bytes: number }> = [];

  for (const entry of entries) {
    if (!shouldCopyReleaseArtifact(entry)) continue;
    const sourcePath = path.join(tempOutputDir, entry.name);
    const targetPath = path.join(releaseDir, entry.name);
    await fs.promises.copyFile(sourcePath, targetPath);
    copiedArtifacts.push({
      fileName: entry.name,
      bytes: await getFileSizeBytes(sourcePath),
    });
  }

  copiedArtifacts.sort((left, right) => left.fileName.localeCompare(right.fileName));
  return copiedArtifacts;
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function buildInstallerArtifacts(
  workspaceDir: string,
  publishMode: PublishMode,
): Promise<{ tempOutputDir: string; artifactsOutputDir: string }> {
  let lastError: unknown = null;
  const localElectronDistZip = findLocalElectronDistZip();

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const tempOutputDir = path.join(workspaceDir, `installer-run-${Date.now()}-${attempt}`);
    const tempOutputDirName = path.relative(rootDir, tempOutputDir).replace(/\\/g, '/');

    await removeDirectoryWithRetries(tempOutputDir).catch(() => {});

    try {
      const electronDistArg = localElectronDistZip
        ? ` --config.electronDist=${JSON.stringify(localElectronDistZip)}`
        : '';
      const result = await runBuildCommand(
        `npx electron-builder --win nsis --publish=${publishMode} --config.directories.output=${tempOutputDirName}${electronDistArg}`,
        rootDir,
      );
      if (result.suppressedCount > 0) {
        console.warn(`[build-win-installer] Suppressed ${result.suppressedCount} transient rcedit warnings.`);
      }
      return {
        tempOutputDir,
        artifactsOutputDir: tempOutputDir,
      };
    } catch (error) {
      lastError = error;
      if (attempt >= 4) break;
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[build-win-installer] Packaging attempt ${attempt} failed, retrying with a fresh output directory...`);
      console.warn(message);
      await removeDirectoryWithRetries(tempOutputDir, { retries: 12, delayMs: 500 }).catch(() => {});
      await delay(1500 * attempt);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function main() {
  const workspaceDir = getBuildWorkspaceDir();
  const version = readPackageVersion();
  const publishMode = parsePublishMode();
  const releaseDir = getReleaseDir(rootDir);

  await fs.promises.mkdir(workspaceDir, { recursive: true });
  await fs.promises.rm(releaseDir, { recursive: true, force: true }).catch(() => {});
  await fs.promises.mkdir(releaseDir, { recursive: true });

  const { tempOutputDir, artifactsOutputDir } = await buildInstallerArtifacts(workspaceDir, publishMode);
  const installerPath = path.join(artifactsOutputDir, `SvnDiffTool-${version}.exe`);
  const winUnpackedDir = path.join(tempOutputDir, 'win-unpacked');
  const localesDir = path.join(winUnpackedDir, 'locales');
  const appAsarPath = path.join(winUnpackedDir, 'resources', 'app.asar');

  const copiedArtifacts = await copyReleaseArtifacts(artifactsOutputDir, releaseDir);
  await updatePackageSizeReport(rootDir, version, {
    innerInstaller: {
      installerFileName: path.basename(installerPath),
      installerBytes: await getFileSizeBytes(installerPath),
      winUnpackedBytes: await getDirectorySizeBytes(winUnpackedDir),
      localesBytes: await getDirectorySizeBytes(localesDir),
      localesKept: await listLocaleFileNames(localesDir),
      appAsarBytes: await getFileSizeBytes(appAsarPath),
      artifacts: copiedArtifacts,
    },
  });
  await removeDirectoryWithRetries(tempOutputDir, { retries: 12, delayMs: 500 }).catch(() => {});
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
