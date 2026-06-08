import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '..');
const manifestPath = path.join(repoRoot, 'rust', 'Cargo.toml');
const candidates = [
  process.env.CARGO,
  process.platform === 'win32'
    ? path.join(process.env.USERPROFILE || '', '.cargo', 'bin', 'cargo.exe')
    : path.join(process.env.HOME || '', '.cargo', 'bin', 'cargo'),
  process.platform === 'win32' ? 'cargo.exe' : 'cargo',
  'cargo',
].filter((candidate): candidate is string => Boolean(candidate));

const cargoPath = candidates.find((candidate) => {
  if (candidate.includes(path.sep)) return existsSync(candidate);
  return true;
});

if (!cargoPath) {
  console.error('Rust cargo executable was not found. Install Rust or set the CARGO env var.');
  process.exit(1);
}

const result = spawnSync(cargoPath, ['build', '--manifest-path', manifestPath, '--release'], {
  cwd: repoRoot,
  stdio: 'inherit',
  shell: false,
  env: {
    ...process.env,
    PATH: [
      path.join(process.env.USERPROFILE || '', '.cargo', 'bin'),
      process.env.PATH || '',
    ].filter(Boolean).join(path.delimiter),
  },
});

if (result.error) {
  console.error(`Failed to run Rust cargo executable "${cargoPath}".`);
  console.error(result.error.message);
  console.error('Install the Rust stable toolchain or set the CARGO environment variable to a working cargo executable.');
  process.exit(1);
}

if (typeof result.status === 'number') {
  process.exit(result.status);
}

if (result.signal) {
  console.error(`Rust build was terminated by signal ${result.signal}.`);
}

process.exit(1);
