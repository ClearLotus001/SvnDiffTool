import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { strToU8, zipSync } from 'fflate';

const execFileAsync = promisify(execFile);
const electronBinary = require('electron') as string;

const rootDir = path.resolve(__dirname, '..');
const rendererEntry = path.join(rootDir, 'dist', 'index.html');
const mainEntry = path.join(rootDir, 'dist-electron', 'electron', 'main.js');
const preloadEntry = path.join(rootDir, 'dist-electron', 'electron', 'preload.js');

interface VerifyOptions {
  basePath: string;
  minePath: string;
  timeoutMs: number;
}

interface StartedElectron {
  pid: number;
  stdoutPath: string;
  stderrPath: string;
  debugLogPath: string;
}

interface RunResult {
  combinedLog: string;
  cacheHit: boolean;
  metadataCacheHit: boolean;
  secondInstanceObserved: boolean;
  buildDiffCount: number;
  rendererCachedReload: boolean;
}

function ensureBuiltArtifacts() {
  const missing = [rendererEntry, mainEntry, preloadEntry].filter((target) => !fs.existsSync(target));
  if (missing.length > 0) {
    throw new Error(`Missing build artifacts:\n${missing.join('\n')}\nRun npm run build:renderer && npm run build:electron first.`);
  }
}

function parseArgs(argv: string[]): VerifyOptions {
  let timeoutMs = 20_000;
  const positional: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index]!;
    if (current === '--timeout-ms') {
      const next = argv[index + 1];
      if (!next) throw new Error('Missing value for --timeout-ms');
      timeoutMs = Number(next);
      index += 1;
      continue;
    }
    positional.push(current);
  }

  const defaultWorkbook = String.raw`F:\QSM_TDRS\Trunk\Tools\TDR_res\Excel\[1]新物品表.xlsm`;
  const basePath = positional[0] ?? defaultWorkbook;
  const minePath = positional[1] ?? basePath;

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error(`Invalid --timeout-ms value: ${timeoutMs}`);
  }

  return {
    basePath,
    minePath,
    timeoutMs,
  };
}

function buildWorkbookZip(sheetName: string, rows: string[][]): Uint8Array {
  const sheetRows = rows.map((cells, rowIndex) => {
    const cellXml = cells.map((value, columnIndex) => {
      const columnLabel = String.fromCharCode(65 + columnIndex);
      const escapedValue = value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      const preserveWhitespace = value.trim() !== value;
      const textNode = preserveWhitespace
        ? `<t xml:space="preserve">${escapedValue}</t>`
        : `<t>${escapedValue}</t>`;
      return `<c r="${columnLabel}${rowIndex + 1}" t="inlineStr"><is>${textNode}</is></c>`;
    }).join('');
    return `<row r="${rowIndex + 1}">${cellXml}</row>`;
  }).join('');

  return zipSync({
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?>
      <workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
        <sheets>
          <sheet name="${sheetName}" sheetId="1" r:id="rId1" />
        </sheets>
      </workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml" />
      </Relationships>`),
    'xl/worksheets/sheet1.xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?>
      <worksheet><sheetData>${sheetRows}</sheetData></worksheet>`),
  });
}

async function resolveWorkbookPaths(options: VerifyOptions): Promise<{
  basePath: string;
  minePath: string;
  cleanup: () => Promise<void>;
}> {
  if (fs.existsSync(options.basePath) && fs.existsSync(options.minePath)) {
    return {
      basePath: options.basePath,
      minePath: options.minePath,
      cleanup: async () => {},
    };
  }

  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'svn-diff-single-instance-workbooks-'));
  const basePath = path.join(tempDir, 'base.xlsx');
  const minePath = path.join(tempDir, 'mine.xlsx');
  await fs.promises.writeFile(
    basePath,
    Buffer.from(buildWorkbookZip('Thing', [['ID', 'Name'], ['10001', 'Alpha']])),
  );
  await fs.promises.writeFile(
    minePath,
    Buffer.from(buildWorkbookZip('Thing', [['ID', 'Name'], ['10001', 'Bravo']])),
  );

  return {
    basePath,
    minePath,
    cleanup: async () => {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    },
  };
}

function createEnv(profileRoot: string): NodeJS.ProcessEnv {
  const nextEnv: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: 'production',
    ELECTRON_DEV_PROFILE_DIR: profileRoot,
    SVN_DIFF_DEBUG_TIMING: '1',
    SVN_DIFF_RUST_PROFILE: '0',
    SVN_DIFF_AUTO_EXIT_AFTER_LOAD_MS: '0',
  };
  delete nextEnv.ELECTRON_RUN_AS_NODE;
  return nextEnv;
}

async function writeExternalDiffRequestFile(
  tempDir: string,
  basePath: string,
  minePath: string,
): Promise<string> {
  const displayName = path.basename(minePath || basePath);
  const requestPath = path.join(tempDir, 'external-diff-request.json');
  const payload = {
    version: 1,
    basePath,
    minePath,
    baseName: `${displayName} : base input`,
    mineName: `${displayName} : mine input`,
    baseUrl: '',
    mineUrl: '',
    baseRevision: '',
    mineRevision: '',
    pegRevision: '',
    fileName: displayName,
  };
  await fs.promises.writeFile(requestPath, JSON.stringify(payload), 'utf8');
  return requestPath;
}

function buildLogExcerpt(text: string): string {
  const lines = text.trim().split(/\r?\n/);
  return lines.slice(-80).join('\n');
}

function countOccurrences(text: string, pattern: string): number {
  if (!text) return 0;
  return text.split(pattern).length - 1;
}

function hasRendererCachedReload(text: string): boolean {
  return /renderer:apply-diff-data:done[\s\S]*?cached:\s*true/.test(text);
}

async function startElectronProcessWithProfile(
  args: string[],
  profileRoot: string,
): Promise<StartedElectron> {
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'svn-diff-single-instance-'));
  const stdoutPath = path.join(tempDir, 'stdout.log');
  const stderrPath = path.join(tempDir, 'stderr.log');
  const debugLogPath = path.join(profileRoot, 'logs', 'external-diff-debug.log');
  const stdoutFd = fs.openSync(stdoutPath, 'w');
  const stderrFd = fs.openSync(stderrPath, 'w');

  try {
    const child = spawn(electronBinary, args, {
      cwd: rootDir,
      env: createEnv(profileRoot),
      windowsHide: true,
      detached: true,
      stdio: ['ignore', stdoutFd, stderrFd],
    });

    const pid = await new Promise<number>((resolve, reject) => {
      child.once('error', reject);
      child.once('spawn', () => {
        if (!child.pid || child.pid <= 0) {
          reject(new Error('Electron process started without a valid pid.'));
          return;
        }
        resolve(child.pid);
      });
    });

    child.unref();

    return {
      pid,
      stdoutPath,
      stderrPath,
      debugLogPath,
    };
  } finally {
    fs.closeSync(stdoutFd);
    fs.closeSync(stderrFd);
  }
}

async function stopElectronProcess(pid: number): Promise<void> {
  await execFileAsync('powershell', [
    '-NoProfile',
    '-Command',
    'Stop-Process -Id $args[0] -Force -ErrorAction SilentlyContinue',
    String(pid),
  ], {
    cwd: rootDir,
    windowsHide: true,
  }).catch(() => {});
}

async function stopExistingElectronProcesses(): Promise<void> {
  if (process.platform !== 'win32') return;

  const script = [
    '$target = $args[0]',
    '$workspace = $args[1]',
    "$processes = Get-CimInstance Win32_Process -Filter \"Name = 'electron.exe'\" | Where-Object {",
    "  ($_.ExecutablePath -eq $target) -or ($_.CommandLine -like ('*' + $workspace + '*'))",
    '}',
    '$processes | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }',
  ].join('; ');

  await execFileAsync('powershell', ['-NoProfile', '-Command', script, electronBinary, rootDir], {
    cwd: rootDir,
    windowsHide: true,
  }).catch(() => {});
  await new Promise((resolve) => setTimeout(resolve, 500));
}

async function readCombinedLog(primary: StartedElectron): Promise<string> {
  const [stdout, stderr, debugLog] = await Promise.all([
    fs.promises.readFile(primary.stdoutPath, 'utf8').catch(() => ''),
    fs.promises.readFile(primary.stderrPath, 'utf8').catch(() => ''),
    fs.promises.readFile(primary.debugLogPath, 'utf8').catch(() => ''),
  ]);
  return `${stdout}\n${stderr}\n${debugLog}`;
}

async function waitForCondition(
  label: string,
  primary: StartedElectron,
  timeoutMs: number,
  check: (log: string) => boolean,
): Promise<string> {
  console.log(`Waiting for ${label}...`);
  const start = Date.now();

  while (Date.now() - start <= timeoutMs) {
    const combinedLog = await readCombinedLog(primary);
    if (check(combinedLog)) {
      return combinedLog;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  const combinedLog = await readCombinedLog(primary);
  throw new Error(`Timed out waiting for ${label} after ${timeoutMs}ms\n--- log excerpt ---\n${buildLogExcerpt(combinedLog)}`);
}

async function runVerification(options: VerifyOptions): Promise<RunResult> {
  const profileRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'svn-diff-single-instance-profile-'));
  const primaryTempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'svn-diff-single-instance-request-'));
  const primaryRequestPath = await writeExternalDiffRequestFile(primaryTempDir, options.basePath, options.minePath);
  const electronArgs = ['.', `${'--external-diff-request'}=${primaryRequestPath}`];
  console.log('Starting primary Electron instance...');
  const primary = await startElectronProcessWithProfile(electronArgs, profileRoot);

  try {
    await waitForCondition(
      'first buildDiffData completion',
      primary,
      options.timeoutMs,
      (log) => countOccurrences(log, 'build-diff-data:done') >= 1,
    );

    console.log('Starting secondary Electron instance...');
    const secondaryTempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'svn-diff-single-instance-request-'));
    const secondaryRequestPath = await writeExternalDiffRequestFile(secondaryTempDir, options.basePath, options.minePath);
    const secondary = await startElectronProcessWithProfile(
      ['.', `${'--external-diff-request'}=${secondaryRequestPath}`],
      profileRoot,
    );
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await stopElectronProcess(secondary.pid);
    await fs.promises.rm(secondaryTempDir, { recursive: true, force: true }).catch(() => {});

    const combinedLog = await waitForCondition(
      'compare cache memory hit',
      primary,
      options.timeoutMs,
      (log) => (
        log.includes('"event":"second-instance"')
        && log.includes('workbook-compare-cache:memory-hit')
        && countOccurrences(log, 'build-diff-data:done') >= 2
      ),
    );

    return {
      combinedLog,
      cacheHit: combinedLog.includes('workbook-compare-cache:memory-hit'),
      metadataCacheHit: combinedLog.includes('workbook-metadata-cache:memory-hit'),
      secondInstanceObserved: combinedLog.includes('"event":"second-instance"'),
      buildDiffCount: countOccurrences(combinedLog, 'build-diff-data:done'),
      rendererCachedReload: hasRendererCachedReload(combinedLog),
    };
  } finally {
    await stopElectronProcess(primary.pid);
    await stopExistingElectronProcesses();
    await fs.promises.rm(primaryTempDir, { recursive: true, force: true }).catch(() => {});
    await fs.promises.rm(profileRoot, { recursive: true, force: true }).catch(() => {});
  }
}

function printSummary(result: RunResult) {
  console.log('Single-instance cache verification passed.');
  console.log(`- second-instance observed: ${result.secondInstanceObserved}`);
  console.log(`- compare cache memory hit: ${result.cacheHit}`);
  console.log(`- metadata cache memory hit: ${result.metadataCacheHit}`);
  console.log(`- buildDiffData count: ${result.buildDiffCount}`);
  console.log(`- renderer cached reload: ${result.rendererCachedReload}`);
}

async function main() {
  ensureBuiltArtifacts();
  await stopExistingElectronProcesses();
  const options = parseArgs(process.argv.slice(2));
  const resolvedPaths = await resolveWorkbookPaths(options);
  try {
    console.log(`Verifying single-instance cache for:\n- base: ${resolvedPaths.basePath}\n- mine: ${resolvedPaths.minePath}`);
    const result = await runVerification({
      ...options,
      basePath: resolvedPaths.basePath,
      minePath: resolvedPaths.minePath,
    });
    if (!result.secondInstanceObserved) {
      throw new Error(`Single-instance handoff was not observed.\n--- log excerpt ---\n${buildLogExcerpt(result.combinedLog)}`);
    }
    if (!result.cacheHit) {
      throw new Error(`Workbook compare cache did not hit.\n--- log excerpt ---\n${buildLogExcerpt(result.combinedLog)}`);
    }
    printSummary(result);
  } finally {
    await resolvedPaths.cleanup();
  }
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Single-instance cache verification failed: ${message}`);
  process.exit(1);
});
