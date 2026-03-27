import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { promisify } from 'node:util';
import {
  getBuildWorkspaceDir,
  getBootstrapperPayloadDir,
  getBootstrapperPayloadPath,
  removeDirectoryWithRetries,
} from './build-workspace';

const execFileAsync = promisify(execFile);
const rootDir = path.resolve(__dirname, '..');

interface PackageJsonShape {
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

async function removeIfExists(targetPath: string) {
  await fs.promises.rm(targetPath, { force: true }).catch(() => {});
}

async function main() {
  const workspaceDir = getBuildWorkspaceDir();
  const version = readPackageVersion();
  const tempOutputDir = path.join(workspaceDir, `installer-run-${Date.now()}`);
  const tempOutputDirName = path.relative(rootDir, tempOutputDir).replace(/\\/g, '/');
  const installerPath = path.join(tempOutputDir, `SvnDiffTool-${version}.exe`);
  const payloadDir = getBootstrapperPayloadDir();
  const payloadPath = getBootstrapperPayloadPath();

  await fs.promises.mkdir(workspaceDir, { recursive: true });
  await removeDirectoryWithRetries(tempOutputDir).catch(() => {});
  await removeIfExists(payloadPath);
  await fs.promises.rm(payloadDir, { recursive: true, force: true }).catch(() => {});

  const electronBuilderCommand = process.platform === 'win32'
    ? path.join(rootDir, 'node_modules', '.bin', 'electron-builder.cmd')
    : path.join(rootDir, 'node_modules', '.bin', 'electron-builder');
  if (process.platform === 'win32') {
    await execFileAsync(
      'cmd.exe',
      ['/d', '/s', '/c', `${electronBuilderCommand} --win nsis --config.directories.output=${tempOutputDirName}`],
      {
        cwd: rootDir,
        windowsHide: true,
      },
    );
  } else {
  await execFileAsync(
    electronBuilderCommand,
    ['--win', 'nsis', `--config.directories.output=${tempOutputDirName}`],
    {
      cwd: rootDir,
      windowsHide: true,
      },
    );
  }

  await fs.promises.mkdir(payloadDir, { recursive: true });
  await fs.promises.copyFile(installerPath, payloadPath);
  await removeDirectoryWithRetries(tempOutputDir, { retries: 12, delayMs: 500 }).catch(() => {});
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
