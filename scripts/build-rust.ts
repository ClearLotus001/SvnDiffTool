import path from 'node:path';
import { runRustReleaseBuild } from './rustArtifacts';

const repoRoot = path.resolve(__dirname, '..');
const result = runRustReleaseBuild({ repoRoot, stdio: 'inherit' });

if (result.ok) process.exit(0);

console.error(result.message);
if (result.reason === 'missing-cargo') {
  console.error('Download Rust from https://rustup.rs/ or set CARGO to a working cargo executable.');
}
process.exit(result.status ?? 1);
