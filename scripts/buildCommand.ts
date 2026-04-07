import { spawn } from 'node:child_process';

const RCEDIT_WARNING_PATTERNS = [
  'cannot execute  cause=exit status 1',
  'errorOut=Fatal error: Unable to commit changes',
  'Above command failed, retrying',
  'rcedit-x64.exe',
  'workingDir=',
];

function shouldSuppressLine(line: string): boolean {
  return RCEDIT_WARNING_PATTERNS.some((pattern) => line.includes(pattern));
}

function flushBufferedLines(
  buffer: string,
  writer: NodeJS.WriteStream,
  state: { suppressedCount: number },
): string {
  const lines = buffer.split(/\r?\n/);
  const pending = lines.pop() ?? '';

  for (const line of lines) {
    if (shouldSuppressLine(line)) {
      state.suppressedCount += 1;
      continue;
    }
    writer.write(`${line}\n`);
  }

  return pending;
}

function attachFilteredOutput(
  stream: NodeJS.ReadableStream | null,
  writer: NodeJS.WriteStream,
  state: { suppressedCount: number },
) {
  if (!stream) return;

  let buffer = '';
  stream.on('data', (chunk: Buffer | string) => {
    buffer += chunk.toString();
    buffer = flushBufferedLines(buffer, writer, state);
  });
  stream.on('end', () => {
    if (!buffer) return;
    if (shouldSuppressLine(buffer)) {
      state.suppressedCount += 1;
      return;
    }
    writer.write(buffer);
  });
}

function formatBuildCommand(command: string, args: string[]): string {
  return [command, ...args]
    .map((part) => (
      /\s/.test(part)
        ? JSON.stringify(part)
        : part
    ))
    .join(' ');
}

export async function runBuildCommand(
  command: string,
  args: string[],
  cwd: string,
): Promise<{ suppressedCount: number }> {
  return await new Promise<{ suppressedCount: number }>((resolve, reject) => {
    const outputState = { suppressedCount: 0 };
    const child = spawn(command, args, {
      cwd,
      windowsHide: true,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    attachFilteredOutput(child.stdout, process.stdout, outputState);
    attachFilteredOutput(child.stderr, process.stderr, outputState);

    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) {
        resolve(outputState);
        return;
      }
      reject(new Error(`Command failed with exit code ${code ?? 'unknown'}: ${formatBuildCommand(command, args)}`));
    });
  });
}
