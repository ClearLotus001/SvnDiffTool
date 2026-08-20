import { spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const electronBinary = require('electron') as string;

const rootDir = path.resolve(__dirname, '..');
const mainBundlePath = path.join(rootDir, 'dist-electron', 'electron', 'main.js');
const preloadBundlePath = path.join(rootDir, 'dist-electron', 'electron', 'preload.js');
const devServerUrl = process.env.DEV_SERVER_URL?.trim() || 'http://localhost:5173';
const readyResources = [
  mainBundlePath,
  preloadBundlePath,
];
const devProfileHash = createHash('sha1').update(rootDir).digest('hex').slice(0, 10);
const devProfileDir = path.join(os.tmpdir(), 'Versora-dev', devProfileHash);
const EARLY_EXIT_WINDOW_MS = 5_000;
const MAX_EARLY_EXIT_RETRIES = 3;
const EARLY_EXIT_RETRY_DELAY_MS = 800;
const RESOURCE_STABLE_WINDOW_MS = 600;

let electronProcess: ChildProcess | null = null;
let shutdownRequested = false;
let restartQueued = false;
let restartTimer: NodeJS.Timeout | null = null;
let stableLaunchTimer: NodeJS.Timeout | null = null;
let earlyExitRetryCount = 0;
let lastLaunchedResourceSignature = '';

async function waitForBundles() {
  while (!shutdownRequested) {
    const bundlesReady = readyResources.every((resourcePath) => fs.existsSync(resourcePath));
    const serverReady = await isServerReady(devServerUrl);
    if (bundlesReady && serverReady) return;
    await sleep(250);
  }
}

function getResourceSignature() {
  return readyResources.map((resourcePath) => {
    const stat = fs.statSync(resourcePath);
    return `${resourcePath}:${stat.size}:${stat.mtimeMs}`;
  }).join('|');
}

async function waitForStableResources() {
  await waitForBundles();

  let stableSince = 0;
  let previousSignature = '';
  while (!shutdownRequested) {
    const signature = getResourceSignature();
    if (signature !== previousSignature) {
      previousSignature = signature;
      stableSince = Date.now();
    }

    if ((Date.now() - stableSince) >= RESOURCE_STABLE_WINDOW_MS) {
      return signature;
    }

    await sleep(120);
  }

  return previousSignature;
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

function startElectron(resourceSignature: string) {
  if (shutdownRequested) return;

  fs.mkdirSync(devProfileDir, { recursive: true });
  const launchStartedAt = Date.now();
  lastLaunchedResourceSignature = resourceSignature;

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

  if (stableLaunchTimer) {
    clearTimeout(stableLaunchTimer);
    stableLaunchTimer = null;
  }
  stableLaunchTimer = setTimeout(() => {
    earlyExitRetryCount = 0;
    stableLaunchTimer = null;
  }, EARLY_EXIT_WINDOW_MS);

  electronProcess.on('exit', (code) => {
    if (stableLaunchTimer) {
      clearTimeout(stableLaunchTimer);
      stableLaunchTimer = null;
    }

    const shouldRestart = restartQueued && !shutdownRequested;
    const normalizedCode = code ?? 0;
    const exitedEarly = (Date.now() - launchStartedAt) < EARLY_EXIT_WINDOW_MS;
    electronProcess = null;

    if (shouldRestart) {
      restartQueued = false;
      void bootElectron();
      return;
    }

    if (!shutdownRequested && normalizedCode === 0 && exitedEarly) {
      earlyExitRetryCount += 1;
      if (earlyExitRetryCount <= MAX_EARLY_EXIT_RETRIES) {
        console.warn(
          `[dev-electron-runner] Electron exited too early (attempt ${earlyExitRetryCount}/${MAX_EARLY_EXIT_RETRIES}). ` +
          'Retrying startup; this is often caused by a stale dev instance holding the single-instance lock.',
        );
        setTimeout(() => {
          if (!shutdownRequested && !electronProcess) {
            void bootElectron();
          }
        }, EARLY_EXIT_RETRY_DELAY_MS);
        return;
      }

      console.warn(
        '[dev-electron-runner] Electron kept exiting immediately. ' +
        'A previous Versora dev instance may still be running in the background. ' +
        'Close old Electron windows/processes, then save a file or restart `npm run dev:app`.',
      );
      return;
    }

    earlyExitRetryCount = 0;
    if (!shutdownRequested) {
      process.exit(normalizedCode);
    }
  });
}

async function bootElectron() {
  const resourceSignature = await waitForStableResources();
  if (shutdownRequested || electronProcess) return;
  startElectron(resourceSignature);
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
  }, 320);
}

function watchBundle(filePath: string) {
  fs.watchFile(filePath, { interval: 250 }, (current, previous) => {
    if (current.mtimeMs === 0 || current.mtimeMs === previous.mtimeMs) return;
    const nextSignature = readyResources.every(resourcePath => fs.existsSync(resourcePath))
      ? getResourceSignature()
      : '';
    if (nextSignature && nextSignature === lastLaunchedResourceSignature) return;
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
  if (stableLaunchTimer) {
    clearTimeout(stableLaunchTimer);
    stableLaunchTimer = null;
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
