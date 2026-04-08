import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { writeExternalDiffDebugLog } from '../electron/main/logger';
import {
  cleanupManagedTempFilesOnExitSync,
  cleanupStaleManagedTempFilesSync,
  configureRuntimePaths,
  writeManagedTempFile,
} from '../electron/runtimePaths';

type MockApp = Parameters<typeof configureRuntimePaths>[0];

function createMockApp(sandboxDir: string): MockApp {
  const knownPaths = new Map<string, string>([
    ['userData', path.join(sandboxDir, 'default-user-data')],
    ['logs', path.join(sandboxDir, 'default-logs')],
  ]);

  return {
    commandLine: {
      appendSwitch() {
        // No-op for tests.
      },
    },
    setPath(name: string, targetPath: string) {
      knownPaths.set(name, targetPath);
    },
    getPath(name: string) {
      return knownPaths.get(name) ?? path.join(sandboxDir, name);
    },
  } as unknown as MockApp;
}

async function withSandbox<T>(prefix: string, run: (sandboxDir: string) => Promise<T>): Promise<T> {
  const sandboxDir = await fsp.mkdtemp(path.join(os.tmpdir(), prefix));
  try {
    return await run(sandboxDir);
  } finally {
    await fsp.rm(sandboxDir, { recursive: true, force: true });
  }
}

function restoreEnvVar(name: string, previousValue: string | undefined) {
  if (previousValue === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = previousValue;
}

test('writeExternalDiffDebugLog stays in-memory-only by default', async () => {
  await withSandbox('svn-diff-debug-default-', async (sandboxDir) => {
    const runtimePaths = configureRuntimePaths(createMockApp(sandboxDir), sandboxDir, null);
    const logPath = path.join(runtimePaths.logsPath ?? sandboxDir, 'external-diff-debug.log');
    const previousDebugLogFlag = process.env.SVN_DIFF_DEBUG_LOG;
    const previousTimingFlag = process.env.SVN_DIFF_DEBUG_TIMING;

    delete process.env.SVN_DIFF_DEBUG_LOG;
    delete process.env.SVN_DIFF_DEBUG_TIMING;

    try {
      writeExternalDiffDebugLog('default-disabled');
      assert.equal(fs.existsSync(logPath), false);
    } finally {
      restoreEnvVar('SVN_DIFF_DEBUG_LOG', previousDebugLogFlag);
      restoreEnvVar('SVN_DIFF_DEBUG_TIMING', previousTimingFlag);
    }
  });
});

test('writeExternalDiffDebugLog persists only when explicitly enabled', async () => {
  await withSandbox('svn-diff-debug-enabled-', async (sandboxDir) => {
    const runtimePaths = configureRuntimePaths(createMockApp(sandboxDir), sandboxDir, null);
    const logPath = path.join(runtimePaths.logsPath ?? sandboxDir, 'external-diff-debug.log');
    const previousDebugLogFlag = process.env.SVN_DIFF_DEBUG_LOG;
    const previousTimingFlag = process.env.SVN_DIFF_DEBUG_TIMING;

    process.env.SVN_DIFF_DEBUG_LOG = '1';
    delete process.env.SVN_DIFF_DEBUG_TIMING;

    try {
      writeExternalDiffDebugLog('explicitly-enabled', { ok: true });
      assert.equal(fs.existsSync(logPath), true);

      const logContents = await fsp.readFile(logPath, 'utf8');
      assert.match(logContents, /explicitly-enabled/);
      assert.match(logContents, /"ok":true/);
    } finally {
      restoreEnvVar('SVN_DIFF_DEBUG_LOG', previousDebugLogFlag);
      restoreEnvVar('SVN_DIFF_DEBUG_TIMING', previousTimingFlag);
    }
  });
});

test('cleanupManagedTempFilesOnExitSync removes tracked and orphaned managed temp files', async () => {
  await withSandbox('svn-diff-temp-cleanup-', async (sandboxDir) => {
    const runtimePaths = configureRuntimePaths(createMockApp(sandboxDir), sandboxDir, null);
    assert.ok(runtimePaths.tempRootPath);

    const trackedTempPath = await writeManagedTempFile('payload', '.bin', Buffer.from('tracked'));
    const orphanTempPath = path.join(runtimePaths.tempRootPath, 'orphan', 'stale.bin');
    await fsp.mkdir(path.dirname(orphanTempPath), { recursive: true });
    await fsp.writeFile(orphanTempPath, 'orphan', 'utf8');

    cleanupManagedTempFilesOnExitSync();

    assert.equal(fs.existsSync(trackedTempPath), false);
    assert.equal(fs.existsSync(orphanTempPath), false);
    assert.equal(fs.existsSync(runtimePaths.tempRootPath), false);
  });
});

test('cleanupStaleManagedTempFilesSync throttles repeated scans unless forced', async () => {
  await withSandbox('svn-diff-temp-throttle-', async (sandboxDir) => {
    const runtimePaths = configureRuntimePaths(createMockApp(sandboxDir), sandboxDir, null);
    const tempRootPath = runtimePaths.tempRootPath;
    assert.ok(tempRootPath);

    const markStaleFile = async (relativePath: string, now: number) => {
      const targetPath = path.join(tempRootPath, relativePath);
      await fsp.mkdir(path.dirname(targetPath), { recursive: true });
      await fsp.writeFile(targetPath, 'stale', 'utf8');
      const staleAt = new Date(now - (48 * 60 * 60 * 1000));
      await fsp.utimes(targetPath, staleAt, staleAt);
      return targetPath;
    };

    const t0 = Date.now();
    const staleFileA = await markStaleFile(path.join('first', 'stale-a.bin'), t0);

    cleanupStaleManagedTempFilesSync(t0);
    assert.equal(fs.existsSync(staleFileA), false);

    const staleFileB = await markStaleFile(path.join('second', 'stale-b.bin'), t0 + 1_000);

    cleanupStaleManagedTempFilesSync(t0 + 1_000);
    assert.equal(fs.existsSync(staleFileB), true);

    cleanupStaleManagedTempFilesSync(t0 + 1_000, { force: true });
    assert.equal(fs.existsSync(staleFileB), false);
  });
});
