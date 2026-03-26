import type { PlatformUpdater } from './platformUpdater';
import { NoopUpdater } from './noopUpdater';
import type { PlatformUpdaterContext } from './types';
import { WindowsUpdater } from './windowsUpdater';

export function createPlatformUpdater(context: PlatformUpdaterContext): PlatformUpdater {
  if (process.platform !== 'win32') {
    return new NoopUpdater(context, 'unsupported');
  }
  if (!context.app.isPackaged) {
    return new NoopUpdater(context, 'disabled');
  }
  return new WindowsUpdater(context);
}
