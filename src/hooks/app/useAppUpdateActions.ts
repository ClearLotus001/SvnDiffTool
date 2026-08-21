import { useCallback } from 'react';
import type { TranslationFn } from '@/context/i18n';

export default function useAppUpdateActions(t: TranslationFn) {
  const handleCheckForAppUpdate = useCallback(() => {
    void window.versora?.checkForAppUpdate?.({ manual: true });
  }, []);

  const handleDownloadAppUpdate = useCallback(() => {
    void window.versora?.downloadAppUpdate?.();
  }, []);

  const handleInstallDownloadedUpdate = useCallback(() => {
    if (!window.versora?.installDownloadedUpdate) return;
    const confirmed = window.confirm(t('toolbarUpdateInstallConfirm'));
    if (!confirmed) return;
    void window.versora.installDownloadedUpdate();
  }, [t]);

  const handleLaunchUninstaller = useCallback(async () => {
    if (!window.versora?.launchUninstaller) return;
    const confirmed = window.confirm(t('aboutUninstallConfirm'));
    if (!confirmed) return;

    try {
      await window.versora.launchUninstaller();
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
