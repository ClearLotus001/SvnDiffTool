import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const electronBinary = require('electron') as string;

const rootDir = path.resolve(__dirname, '..');
const rendererEntry = path.join(rootDir, 'dist', 'index.html');
const mainEntry = path.join(rootDir, 'dist-electron', 'main.js');
const preloadEntry = path.join(rootDir, 'dist-electron', 'preload.js');

interface VerifyOptions {
  basePath: string;
  minePath: string;
  timeoutMs: number;
}

interface StartedElectron {
  pid: number;
  stdoutPath: string;
  stderrPath: string;
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

function buildElectronArgs(basePath: string, minePath: string): string[] {
  const displayName = path.basename(minePath || basePath);
  return [
    '.',
    basePath,
    minePath,
    `${displayName} (base)`,
    `${displayName} (mine)`,
    displayName,
  ];
}

function createEnv(): NodeJS.ProcessEnv {
  const nextEnv: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: 'production',
    SVN_DIFF_DEBUG_TIMING: '1',
    SVN_DIFF_RUST_PROFILE: '0',
    SVN_DIFF_AUTO_EXIT_AFTER_LOAD_MS: '0',
  };
  delete nextEnv.ELECTRON_RUN_AS_NODE;
  return nextEnv;
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

async function startElectronProcess(args: string[]): Promise<StartedElectron> {
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'svn-diff-single-instance-'));
  const stdoutPath = path.join(tempDir, 'stdout.log');
  const stderrPath = path.join(tempDir, 'stderr.log');
  const scriptPath = path.join(tempDir, 'start-electron.ps1');
  const encodedArgs = Buffer.from(args.join('\0'), 'utf8').toString('base64');
  const script = [
    'param($exe, $out, $err, $argvBase64)',
    '$argvText = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($argvBase64))',
    '$argv = $argvText -split "`0"',
    '$proc = Start-Process -FilePath $exe -ArgumentList $argv -RedirectStandardOutput $out -RedirectStandardError $err -PassThru',
    '$proc.Id | Write-Output',
  ].join('\n');
  await fs.promises.writeFile(scriptPath, script, 'utf8');

  const result = await execFileAsync('powershell', [
    '-NoProfile',
    '-File',
    scriptPath,
    electronBinary,
    stdoutPath,
    stderrPath,
    encodedArgs,
  ], {
    cwd: rootDir,
    env: createEnv(),
    windowsHide: true,
  });

  const pid = Number((result.stdout ?? '').trim());
  if (!Number.isFinite(pid) || pid <= 0) {
    throw new Error(`Failed to start Electron process. stdout=${result.stdout ?? ''} stderr=${result.stderr ?? ''}`);
  }

  return {
    pid,
    stdoutPath,
    stderrPath,
  };
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

async function isPidAlive(pid: number): Promise<boolean> {
  try {
    const result = await execFileAsync('powershell', [
      '-NoProfile',
      '-Command',
      '$proc = Get-Process -Id $args[0] -ErrorAction SilentlyContinue; if ($null -eq $proc) { "0" } else { "1" }',
      String(pid),
    ], {
      cwd: rootDir,
      windowsHide: true,
    });
    return (result.stdout ?? '').trim() === '1';
  } catch {
    return false;
  }
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
  const [stdout, stderr] = await Promise.all([
    fs.promises.readFile(primary.stdoutPath, 'utf8').catch(() => ''),
    fs.promises.readFile(primary.stderrPath, 'utf8').catch(() => ''),
  ]);
  return `${stdout}\n${stderr}`;
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

    const alive = await isPidAlive(primary.pid);
    if (!alive) {
      throw new Error(`Primary Electron process exited early with code 0\n--- log excerpt ---\n${buildLogExcerpt(combinedLog)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  const combinedLog = await readCombinedLog(primary);
  throw new Error(`Timed out waiting for ${label} after ${timeoutMs}ms\n--- log excerpt ---\n${buildLogExcerpt(combinedLog)}`);
}

async function runVerification(options: VerifyOptions): Promise<RunResult> {
  const electronArgs = buildElectronArgs(options.basePath, options.minePath);
  console.log('Starting primary Electron instance...');
  const primary = await startElectronProcess(electronArgs);

  try {
    await waitForCondition(
      'first buildDiffData completion',
      primary,
      options.timeoutMs,
      (log) => countOccurrences(log, 'build-diff-data:done') >= 1,
    );

    console.log('Starting secondary Electron instance...');
    const secondary = await startElectronProcess(electronArgs);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await stopElectronProcess(secondary.pid);

    const combinedLog = await waitForCondition(
      'compare cache memory hit',
      primary,
      options.timeoutMs,
      (log) => (
        log.includes('second-instance:cli-args-updated')
        && log.includes('workbook-compare-cache:memory-hit')
        && countOccurrences(log, 'build-diff-data:done') >= 2
      ),
    );

    return {
      combinedLog,
      cacheHit: combinedLog.includes('workbook-compare-cache:memory-hit'),
      metadataCacheHit: combinedLog.includes('workbook-metadata-cache:memory-hit'),
      secondInstanceObserved: combinedLog.includes('second-instance:cli-args-updated'),
      buildDiffCount: countOccurrences(combinedLog, 'build-diff-data:done'),
      rendererCachedReload: hasRendererCachedReload(combinedLog),
    };
  } finally {
    await stopElectronProcess(primary.pid);
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
  console.log(`Verifying single-instance cache for:\n- base: ${options.basePath}\n- mine: ${options.minePath}`);
  const result = await runVerification(options);
  if (!result.secondInstanceObserved) {
    throw new Error(`Single-instance handoff was not observed.\n--- log excerpt ---\n${buildLogExcerpt(result.combinedLog)}`);
  }
  if (!result.cacheHit) {
    throw new Error(`Workbook compare cache did not hit.\n--- log excerpt ---\n${buildLogExcerpt(result.combinedLog)}`);
  }
  printSummary(result);
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Single-instance cache verification failed: ${message}`);
  process.exit(1);
});
