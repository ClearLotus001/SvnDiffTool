import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

type SpawnSyncLike = (
  command: string,
  args: string[],
  options: {
    cwd?: string;
    encoding?: BufferEncoding;
    env?: NodeJS.ProcessEnv;
    shell?: boolean;
    stdio?: 'inherit' | 'pipe';
    windowsHide?: boolean;
  },
) => {
  error?: Error;
  status?: number | null;
  signal?: NodeJS.Signals | null;
};

interface RustArtifactOptions {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
}

interface CargoProbeOptions extends RustArtifactOptions {
  existsSync?: (targetPath: string) => boolean;
  spawnSync?: SpawnSyncLike;
}

interface CargoBuildOptions extends CargoProbeOptions {
  repoRoot: string;
  stdio?: 'inherit' | 'pipe';
}

export interface RustArtifactPaths {
  parserName: string;
  parserPath: string;
  manifestPath: string;
}

export type CargoProbeResult = {
  ok: true;
  cargoPath: string;
  attempted: string[];
} | {
  ok: false;
  attempted: string[];
  message: string;
};

export type CargoBuildResult = {
  ok: true;
  cargoPath: string;
} | {
  ok: false;
  cargoPath?: string;
  attempted: string[];
  reason: 'missing-cargo' | 'spawn-error' | 'failed' | 'signal';
  message: string;
  status?: number;
};

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(value => value.trim().length > 0)));
}

function isPathLike(candidate: string): boolean {
  return path.isAbsolute(candidate) || candidate.includes('/') || candidate.includes('\\');
}

export function buildCargoEnv(env: NodeJS.ProcessEnv, platform: NodeJS.Platform): NodeJS.ProcessEnv {
  const homeDir = platform === 'win32' ? env.USERPROFILE : env.HOME;
  const cargoBin = homeDir ? path.join(homeDir, '.cargo', 'bin') : '';
  return {
    ...env,
    PATH: [
      cargoBin,
      env.PATH || '',
    ].filter(Boolean).join(path.delimiter),
  };
}

export function getRustArtifactPaths(
  repoRoot: string,
  options: RustArtifactOptions = {},
): RustArtifactPaths {
  const platform = options.platform ?? process.platform;
  const parserName = platform === 'win32' ? 'svn_excel_parser.exe' : 'svn_excel_parser';
  return {
    parserName,
    parserPath: path.join(repoRoot, 'rust', 'target', 'release', parserName),
    manifestPath: path.join(repoRoot, 'rust', 'Cargo.toml'),
  };
}

function getCargoCandidates(options: RustArtifactOptions = {}): string[] {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const homeDir = platform === 'win32' ? env.USERPROFILE : env.HOME;
  const cargoExecutableName = platform === 'win32' ? 'cargo.exe' : 'cargo';
  return unique([
    env.CARGO ?? '',
    homeDir ? path.join(homeDir, '.cargo', 'bin', cargoExecutableName) : '',
    cargoExecutableName,
    'cargo',
  ]);
}

export function resolveCargoExecutable(options: CargoProbeOptions = {}): CargoProbeResult {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const exists = options.existsSync ?? existsSync;
  const spawn = options.spawnSync ?? spawnSync;
  const attempted: string[] = [];

  for (const candidate of getCargoCandidates({ platform, env })) {
    attempted.push(candidate);
    if (isPathLike(candidate) && !exists(candidate)) continue;

    const probe = spawn(candidate, ['--version'], {
      encoding: 'utf-8',
      env: buildCargoEnv(env, platform),
      shell: false,
      stdio: 'pipe',
      windowsHide: true,
    });

    if (!probe.error && probe.status === 0) {
      return {
        ok: true,
        cargoPath: candidate,
        attempted,
      };
    }
  }

  return {
    ok: false,
    attempted,
    message: [
      'Rust cargo executable was not found.',
      'Install the Rust stable toolchain or set the CARGO env var.',
      attempted.length > 0 ? `Checked: ${attempted.join(', ')}` : '',
    ].filter(Boolean).join(' '),
  };
}

export function runRustReleaseBuild(options: CargoBuildOptions): CargoBuildResult {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const spawn = options.spawnSync ?? spawnSync;
  const probe = resolveCargoExecutable(options);

  if (!probe.ok) {
    return {
      ok: false,
      reason: 'missing-cargo',
      attempted: probe.attempted,
      message: probe.message,
    };
  }

  const { manifestPath } = getRustArtifactPaths(options.repoRoot, { platform, env });
  const result = spawn(probe.cargoPath, ['build', '--manifest-path', manifestPath, '--release'], {
    cwd: options.repoRoot,
    env: buildCargoEnv(env, platform),
    shell: false,
    stdio: options.stdio ?? 'inherit',
    windowsHide: true,
  });

  if (result.error) {
    return {
      ok: false,
      cargoPath: probe.cargoPath,
      attempted: probe.attempted,
      reason: 'spawn-error',
      message: `Failed to run Rust cargo executable "${probe.cargoPath}": ${result.error.message}`,
    };
  }

  if (typeof result.status === 'number') {
    if (result.status === 0) {
      return {
        ok: true,
        cargoPath: probe.cargoPath,
      };
    }
    return {
      ok: false,
      cargoPath: probe.cargoPath,
      attempted: probe.attempted,
      reason: 'failed',
      status: result.status,
      message: `Rust release build failed with exit code ${result.status}.`,
    };
  }

  return {
    ok: false,
    cargoPath: probe.cargoPath,
    attempted: probe.attempted,
    reason: 'signal',
    message: `Rust release build was terminated${result.signal ? ` by signal ${result.signal}` : ''}.`,
  };
}
