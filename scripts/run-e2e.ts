import { spawnSync } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '..');
const e2eHost = '127.0.0.1';
const playwrightCliPath = path.join(repoRoot, 'node_modules', '@playwright', 'test', 'cli.js');

function canListen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.on('error', () => resolve(false));
    server.listen(port, e2eHost, () => {
      server.close(() => resolve(true));
    });
  });
}

export async function findAvailableE2EPort(startPort = 4173): Promise<number> {
  let port = startPort;
  while (!(await canListen(port))) port += 1;
  return port;
}

async function main() {
  const configuredBaseUrl = process.env.VERSORA_E2E_BASE_URL?.trim();
  const baseUrl = configuredBaseUrl || `http://${e2eHost}:${await findAvailableE2EPort()}`;
  process.stdout.write(`[e2e] isolated preview: ${baseUrl}\n`);

  const result = spawnSync(process.execPath, [playwrightCliPath, 'test', ...process.argv.slice(2)], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      VERSORA_E2E_BASE_URL: baseUrl,
      SVN_DIFF_E2E_BASE_URL: baseUrl,
    },
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

if (require.main === module) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
