import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { getBootstrapperShellDir } from './build-workspace';

const execFileAsync = promisify(execFile);
const rootDir = path.resolve(__dirname, '..');
const distBootstrapperDir = getBootstrapperShellDir();

async function runTsc(projectPath: string) {
  const tscCommand = process.platform === 'win32'
    ? path.join(rootDir, 'node_modules', '.bin', 'tsc.cmd')
    : path.join(rootDir, 'node_modules', '.bin', 'tsc');

  if (process.platform === 'win32') {
    await execFileAsync(
      'cmd.exe',
      ['/d', '/s', '/c', `${tscCommand} -p ${projectPath}`],
      {
        cwd: rootDir,
        windowsHide: true,
      },
    );
    return;
  }

  await execFileAsync(
    tscCommand,
    ['-p', projectPath],
    {
      cwd: rootDir,
      windowsHide: true,
    },
  );
}

async function copyFile(from: string, to: string) {
  await fs.promises.mkdir(path.dirname(to), { recursive: true });
  await fs.promises.copyFile(from, to);
}

async function main() {
  await fs.promises.rm(distBootstrapperDir, { recursive: true, force: true });
  await fs.promises.rm(path.join(rootDir, 'dist-bootstrapper'), { recursive: true, force: true }).catch(() => {});
  await runTsc('tsconfig.bootstrapper.json');
  await runTsc('tsconfig.bootstrapper.renderer.json');

  const rendererTargetDir = path.join(distBootstrapperDir, 'renderer');

  await copyFile(
    path.join(rootDir, 'bootstrapper', 'renderer', 'index.html'),
    path.join(rendererTargetDir, 'index.html'),
  );
  await copyFile(
    path.join(rootDir, 'bootstrapper', 'renderer', 'styles.css'),
    path.join(rendererTargetDir, 'styles.css'),
  );
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
