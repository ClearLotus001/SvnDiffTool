import { useCallback } from 'react';
import type { TranslationFn } from '@/context/i18n';

export default function useAppUpdateActions(t: TranslationFn) {
  const handleCheckForAppUpdate = useCallback(() => {
    void window.svnDiff?.checkForAppUpdate?.({ manual: true });
  }, []);

  const handleDownloadAppUpdate = useCallback(() => {
    void window.svnDiff?.downloadAppUpdate?.();
  }, []);

  const handleInstallDownloadedUpdate = useCallback(() => {
    if (!window.svnDiff?.installDownloadedUpdate) return;
    const confirmed = window.confirm(t('toolbarUpdateInstallConfirm'));
    if (!confirmed) return;
    void window.svnDiff.installDownloadedUpdate();
  }, [t]);

  const handleLaunchUninstaller = useCallback(async () => {
    if (!window.svnDiff?.launchUninstaller) return;
    const confirmed = window.confirm(t('aboutUninstallConfirm'));
    if (!confirmed) return;

    try {
      await window.svnDiff.launchUninstaller();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      window.alert(`${t('aboutUninstallError')}\n${message}`);
    }
  }, [t]);

  return {
    handleCheckForAppUpdate,
    handleDownloadAppUpdate,
    handleInstallDownloadedUpdate,
    handleLaunchUninstaller,
  };
}
