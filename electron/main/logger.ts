import * as fs from 'node:fs';
import * as path from 'node:path';
import { getRuntimePathState } from '../runtimePaths.js';

export function logDebugTiming(message: string, payload?: unknown): void {
  if (process.env.SVN_DIFF_DEBUG_TIMING !== '1') return;
  if (payload === undefined) {
    console.log(`[debug-timing] ${message}`);
    return;
  }
  console.log(`[debug-timing] ${message}`, payload);
}

export function logRustDebugStderr(label: string, stderr: string): void {
  if (process.env.SVN_DIFF_DEBUG_TIMING !== '1') return;
  const normalized = stderr.trim();
  if (!normalized) return;
  console.log(`[${label}] ${normalized}`);
}

function toSerializableDebugValue(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack ?? '',
    };
  }
  if (Array.isArray(value)) {
    return value.map(item => toSerializableDebugValue(item));
  }
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(
        ([key, entryValue]) => [key, toSerializableDebugValue(entryValue)],
      ),
    );
  }
  return String(value);
}

function getExternalDiffDebugLogPaths(): string[] {
  const runtimePaths = getRuntimePathState();
  const candidateRoots = [
    process.env.APPDATA ? path.join(process.env.APPDATA, 'svn-diff-tool', 'logs') : '',
    runtimePaths.logsPath ?? '',
    runtimePaths.userDataPath ? path.join(runtimePaths.userDataPath, 'logs') : '',
    process.execPath ? path.dirname(process.execPath) : '',
    path.join(process.cwd(), 'logs'),
  ].filter(Boolean);

  return Array.from(new Set(candidateRoots)).map(rootPath => path.join(rootPath, 'external-diff-debug.log'));
}

export function writeExternalDiffDebugLog(event: string, payload?: unknown): void {
  const entry = {
    timestamp: new Date().toISOString(),
    pid: process.pid,
    event,
    payload: payload === undefined ? null : toSerializableDebugValue(payload),
  };

  getExternalDiffDebugLogPaths().forEach((targetPath) => {
    try {
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.appendFileSync(targetPath, `${JSON.stringify(entry)}\n`, 'utf-8');
    } catch (error) {
      console.debug(
        '[debug-log] write skipped:',
        targetPath,
        error instanceof Error ? error.message : String(error),
      );
    }
  });
}
