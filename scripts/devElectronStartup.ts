import path from 'node:path';

export function areDevElectronResourcesFresh(
  resourceMtimes: readonly number[],
  buildEpochMs: number | null,
): boolean {
  if (resourceMtimes.length === 0 || resourceMtimes.some((mtimeMs) => mtimeMs <= 0)) return false;
  if (buildEpochMs == null) return true;
  return resourceMtimes.every((mtimeMs) => mtimeMs >= buildEpochMs);
}

export function resolveDevElectronProfileDir(options: {
  devRootDir: string;
  profileHash: string;
  runnerPid: number;
  stableProfileLocked: boolean;
}): string {
  const stableProfileDir = path.join(options.devRootDir, options.profileHash);
  if (!options.stableProfileLocked) return stableProfileDir;
  return path.join(
    options.devRootDir,
    `${options.profileHash}-recovery-${options.runnerPid}`,
  );
}
