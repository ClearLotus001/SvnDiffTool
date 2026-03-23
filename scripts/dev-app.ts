import { spawn, type ChildProcess } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';

const rootDir = path.resolve(__dirname, '..');
const devServerHost = '127.0.0.1';
const viteCliPath = path.join(rootDir, 'node_modules', 'vite', 'bin', 'vite.js');
const tscCliPath = path.join(rootDir, 'node_modules', 'typescript', 'bin', 'tsc');
const tsxCliPath = path.join(rootDir, 'node_modules', 'tsx', 'dist', 'cli.mjs');

const processes: ChildProcess[] = [];
let shuttingDown = false;

function startChild(command: string, args: string[], label: string, env: NodeJS.ProcessEnv) {
  const child = spawn(command, args, {
    cwd: rootDir,
    env,
    stdio: 'inherit',
  });

  processes.push(child);
  child.on('exit', (code, signal) => {
    if (shuttingDown) return;

    const normalizedCode = code ?? (signal ? 1 : 0);
    console.error(`[dev-app] ${label} exited with code ${normalizedCode}${signal ? ` (signal: ${signal})` : ''}`);
    shutdown(normalizedCode);
  });
}

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of processes) {
    if (!child.killed) {
      try {
        child.kill();
      } catch {
        // ignore child shutdown failure
      }
    }
  }

  setTimeout(() => process.exit(exitCode), 50);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

async function main() {
  const devServerPort = await findAvailablePort(5173);
  const devServerUrl = `http://${devServerHost}:${devServerPort}`;
  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    DEV_SERVER_URL: devServerUrl,
  };

  console.log(`[dev-app] renderer url: ${devServerUrl}`);

  startChild(process.execPath, [viteCliPath, '--host', devServerHost, '--port', String(devServerPort), '--strictPort'], 'vite', childEnv);
  startChild(process.execPath, [tscCliPath, '-p', 'tsconfig.electron.json', '--watch', '--preserveWatchOutput'], 'tsc', childEnv);
  startChild(process.execPath, [tsxCliPath, 'scripts/dev-electron-runner.ts'], 'electron', childEnv);
}

async function findAvailablePort(startPort: number): Promise<number> {
  let port = startPort;
  while (true) {
    const available = await canListen(port);
    if (available) return port;
    port += 1;
  }
}

function canListen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.on('error', () => resolve(false));
    server.listen(port, devServerHost, () => {
      server.close(() => resolve(true));
    });
  });
}

void main().catch((error) => {
  console.error('[dev-app] failed to start', error);
  shutdown(1);
});
