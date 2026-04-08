export const localVersioningStatusCache = new Map<string, Promise<'versioned' | 'unversioned' | 'unknown'>>();

export const localSvnUrlCache = new Map<string, Promise<string>>();

export function clearSvnProbeCaches(): void {
  localVersioningStatusCache.clear();
  localSvnUrlCache.clear();
}
