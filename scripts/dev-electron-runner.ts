import { spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const electronBinary = require('electron') as string;

const rootDir = path.resolve(__dirname, '..');
const mainBundlePath = path.join(rootDir, 'dist-electron', 'main.js');
const preloadBundlePath = path.join(rootDir, 'dist-electron', 'preload.js');
const devServerUrl = process.env.DEV_SERVER_URL?.trim() || 'http://localhost:5173';
const readyResources = [
  mainBundlePath,
  preloadBundlePath,
];
const devProfileHash = createHash('sha1').update(rootDir).digest('hex').slice(0, 10);
const devProfileDir = path.join(os.tmpdir(), 'SvnExcelDiffTool-dev', devProfileHash);

let electronProcess: ChildProcess | null = null;
let shutdownRequested = false;
let restartQueued = false;
let restartTimer: NodeJS.Timeout | null = null;

async function waitForBundles() {
  while (!shutdownRequested) {
    const bundlesReady = readyResources.every((resourcePath) => fs.existsSync(resourcePath));
    const serverReady = await isServerReady(devServerUrl);
    if (bundlesReady && serverReady) return;
    await sleep(250);
  }
}

async function isServerReady(url: string) {
  try {
    const response = await fetch(url, { method: 'GET' });
    return response.ok || response.status < 500;
  } catch {
    return false;
  }
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function stopElectron() {
  if (!electronProcess || electronProcess.killed) return;
  electronProcess.kill();
}

function startElectron() {
  if (shutdownRequested) return;

  fs.mkdirSync(devProfileDir, { recursive: true });

  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: 'development',
    ELECTRON_DEV_PROFILE_DIR: devProfileDir,
  };
  delete childEnv.ELECTRON_RUN_AS_NODE;

  electronProcess = spawn(electronBinary, ['.'], {
    cwd: rootDir,
    stdio: 'inherit',
    env: childEnv,
  });

  electronProcess.on('exit', (code) => {
    const shouldRestart = restartQueued && !shutdownRequested;
    electronProcess = null;

    if (shouldRestart) {
      restartQueued = false;
      void bootElectron();
      return;
    }

    if (!shutdownRequested) {
      process.exit(code ?? 0);
    }
  });
}

async function bootElectron() {
  await waitForBundles();
  startElectron();
}

function scheduleRestart() {
  if (shutdownRequested) return;

  if (restartTimer) clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    restartQueued = true;
    if (electronProcess) {
      stopElectron();
      return;
    }

    restartQueued = false;
    void bootElectron();
  }, 180);
}

function watchBundle(filePath: string) {
  fs.watchFile(filePath, { interval: 250 }, (current, previous) => {
    if (current.mtimeMs === 0 || current.mtimeMs === previous.mtimeMs) return;
    scheduleRestart();
  });
}

function cleanupAndExit(exitCode = 0) {
  shutdownRequested = true;
  fs.unwatchFile(mainBundlePath);
  fs.unwatchFile(preloadBundlePath);

  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }

  if (!electronProcess) {
    process.exit(exitCode);
    return;
  }

  const activeProcess = electronProcess;
  electronProcess = null;
  activeProcess.once('exit', () => process.exit(exitCode));
  activeProcess.kill();
}

process.on('SIGINT', () => cleanupAndExit(0));
process.on('SIGTERM', () => cleanupAndExit(0));

watchBundle(mainBundlePath);
watchBundle(preloadBundlePath);
void bootElectron();
