import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { promisify } from 'node:util';
import {
  getBuildWorkspaceDir,
  getBootstrapperPayloadPath,
  removeDirectoryWithRetries,
} from './build-workspace';

const execFileAsync = promisify(execFile);
const rootDir = path.resolve(__dirname, '..');
const packageJsonPath = path.join(rootDir, 'package.json');

interface PackageJsonShape {
  version?: string;
}

function readPackageVersion(): string {
  const raw = fs.readFileSync(packageJsonPath, 'utf-8');
  const parsed = JSON.parse(raw) as PackageJsonShape;
  const version = parsed.version?.trim();
  if (!version) {
    throw new Error('Unable to resolve package version from package.json.');
  }
  return version;
}

async function ensurePayloadReady(version: string) {
  const bootstrapperPayloadPath = getBootstrapperPayloadPath();
  if (!fs.existsSync(bootstrapperPayloadPath)) {
    throw new Error(`Inner installer payload not found for version ${version}: ${bootstrapperPayloadPath}`);
  }
}

async function buildBootstrapperShell() {
  const tsxCommand = process.platform === 'win32'
    ? path.join(rootDir, 'node_modules', '.bin', 'tsx.cmd')
    : path.join(rootDir, 'node_modules', '.bin', 'tsx');

  if (process.platform === 'win32') {
    await execFileAsync(
      'cmd.exe',
      ['/d', '/s', '/c', `${tsxCommand} scripts/build-bootstrapper-shell.ts`],
      {
        cwd: rootDir,
        windowsHide: true,
      },
    );
    return;
  }

  await execFileAsync(
    tsxCommand,
    ['scripts/build-bootstrapper-shell.ts'],
    {
      cwd: rootDir,
      windowsHide: true,
    },
  );
}

async function runBootstrapperBuild() {
  const workspaceDir = getBuildWorkspaceDir();
  const outputDir = path.join(workspaceDir, `bootstrapper-run-${Date.now()}`);
  const outputDirName = path.relative(rootDir, outputDir).replace(/\\/g, '/');
  const electronBuilderCommand = process.platform === 'win32'
    ? path.join(rootDir, 'node_modules', '.bin', 'electron-builder.cmd')
    : path.join(rootDir, 'node_modules', '.bin', 'electron-builder');
  await fs.promises.mkdir(workspaceDir, { recursive: true });
  await removeDirectoryWithRetries(outputDir).catch(() => {});
  if (process.platform === 'win32') {
    await execFileAsync(
      'cmd.exe',
      ['/d', '/s', '/c', `${electronBuilderCommand} --config bootstrapper/electron-builder.json --win portable --config.directories.output=${outputDirName}`],
      {
        cwd: rootDir,
        windowsHide: true,
      },
    );
  } else {
    await execFileAsync(
      electronBuilderCommand,
      ['--config', 'bootstrapper/electron-builder.json', '--win', 'portable', `--config.directories.output=${outputDirName}`],
      {
        cwd: rootDir,
        windowsHide: true,
      },
    );
  }

  const version = readPackageVersion();
  const tempBootstrapperPath = path.join(outputDir, `SvnDiffTool-Setup-${version}.exe`);
  const targetBootstrapperPath = path.join(rootDir, 'release', `SvnDiffTool-Setup-${version}.exe`);
  await fs.promises.mkdir(path.join(rootDir, 'release'), { recursive: true });
  await fs.promises.rm(path.join(rootDir, 'release', `SvnDiffTool-${version}.exe`), { force: true }).catch(() => {});
  await fs.promises.rm(path.join(rootDir, 'release', `SvnDiffTool-${version}.exe.blockmap`), { force: true }).catch(() => {});
  await fs.promises.rm(path.join(rootDir, 'release', 'latest.yml'), { force: true }).catch(() => {});
  await fs.promises.rm(path.join(rootDir, 'release', 'builder-debug.yml'), { force: true }).catch(() => {});
  await removeDirectoryWithRetries(path.join(rootDir, 'release', 'win-unpacked')).catch(() => {});
  await fs.promises.rm(targetBootstrapperPath, { force: true }).catch(() => {});
  await fs.promises.copyFile(tempBootstrapperPath, targetBootstrapperPath);
  await removeDirectoryWithRetries(workspaceDir, { retries: 12, delayMs: 500 }).catch(() => {});
}

async function main() {
  const version = readPackageVersion();
  await buildBootstrapperShell();
  await ensurePayloadReady(version);
  await runBootstrapperBuild();
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
