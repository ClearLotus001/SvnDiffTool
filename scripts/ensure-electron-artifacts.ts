import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '..');
const electronPackageDir = path.join(repoRoot, 'node_modules', 'electron');
const electronInstallScript = path.join(electronPackageDir, 'install.js');
const electronPathFile = path.join(electronPackageDir, 'path.txt');

function resolveElectronExecutablePath(): string | null {
  if (!existsSync(electronPathFile)) {
    return null;
  }

  try {
    const electronBinary = require('electron') as unknown;
    return typeof electronBinary === 'string' && electronBinary.trim() ? electronBinary : null;
  } catch {
    return null;
  }
}

function runElectronInstallScript() {
  if (!existsSync(electronInstallScript)) {
    console.error(`Missing Electron install script: ${electronInstallScript}`);
    process.exit(1);
  }

  const result = spawnSync(process.execPath, [electronInstallScript], {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: false,
    env: {
      ...process.env,
      ELECTRON_SKIP_BINARY_DOWNLOAD: '',
    },
  });

  if (result.error) {
    console.error('Failed to run Electron install script.');
    console.error(result.error.message);
    process.exit(1);
  }

  if (typeof result.status === 'number') {
    if (result.status !== 0) {
      process.exit(result.status);
    }
    return;
  }

  if (result.signal) {
    console.error(`Electron install script was terminated by signal ${result.signal}.`);
  }
  process.exit(1);
}

let electronExecutablePath = resolveElectronExecutablePath();
if (!electronExecutablePath) {
  console.warn('[ensure-electron-artifacts] Electron binary metadata is missing; running Electron install script.');
  runElectronInstallScript();
  electronExecutablePath = resolveElectronExecutablePath();
}

if (!electronExecutablePath || !existsSync(electronExecutablePath)) {
  console.error('Electron binary is not available after installation.');
  console.error(`Resolved path: ${electronExecutablePath ?? '(none)'}`);
  process.exit(1);
}

console.log(`[ensure-electron-artifacts] Electron binary ready: ${electronExecutablePath}`);
