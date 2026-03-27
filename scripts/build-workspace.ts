import * as path from 'node:path';

const rootDir = path.resolve(__dirname, '..');
const buildWorkspaceDir = path.join(rootDir, '.build-tmp');

export function getBuildWorkspaceDir(): string {
  return buildWorkspaceDir;
}

export function getBootstrapperShellDir(): string {
  return path.join(buildWorkspaceDir, 'bootstrapper-dist');
}

export function getBootstrapperPayloadDir(): string {
  return path.join(buildWorkspaceDir, 'payload');
}

export function getBootstrapperPayloadPath(): string {
  return path.join(getBootstrapperPayloadDir(), 'SvnDiffTool-installer.exe');
}

export async function removeDirectoryWithRetries(
  targetPath: string,
  options: { retries?: number; delayMs?: number } = {},
): Promise<void> {
  const retries = options.retries ?? 8;
  const delayMs = options.delayMs ?? 350;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      // Dynamic import keeps this helper side-effect free for the small utility module.
      const fs = await import('node:fs');
      await fs.promises.rm(targetPath, { recursive: true, force: true });
      return;
    } catch (error) {
      if (attempt >= retries) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}
