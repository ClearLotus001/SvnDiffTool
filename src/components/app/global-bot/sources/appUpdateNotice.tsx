import type { TranslationFn } from '@/context/i18n';
import type { AppUpdateState } from '@/types';
import type { GlobalBotMessage } from '@/components/app/global-bot/messages/types';

interface ResolveAppUpdateNoticeOptions {
  state: AppUpdateState | null;
  t: TranslationFn;
  onDownload: () => void;
  onInstall: () => void;
}

export function resolveAppUpdateNotice({
  state,
  t,
  onDownload,
  onInstall,
}: ResolveAppUpdateNoticeOptions): GlobalBotMessage | null {
  if (!state || !['available', 'downloading', 'downloaded'].includes(state.status)) return null;

  const version = state.availableVersion || state.releaseName || state.currentVersion;
  const shared = {
    id: `update:${state.status}:${version}`,
    source: 'update' as const,
    delivery: 'prompt' as const,
    priority: 100,
  };

  switch (state.status) {
    case 'available':
      return {
        ...shared,
        mood: 'attentive',
        text: `${t('updateBotAvailableTitle', { version })} · ${t('updateBotAvailableMessage')}`,
        action: {
          label: t('updateBotDownloadAction'),
          onClick: onDownload,
        },
      };
    case 'downloading':
      return {
        ...shared,
        mood: 'working',
        text: t('updateBotDownloadingTitle', { version }),
        progress: {
          label: t('updateBotDownloadProgress'),
          value: state.downloadPercent,
        },
      };
    case 'downloaded':
      return {
        ...shared,
        mood: 'celebrating',
        text: `${t('updateBotDownloadedTitle', { version })} · ${t('updateBotDownloadedMessage')}`,
        action: {
          label: t('updateBotInstallAction'),
          onClick: onInstall,
        },
      };
    default:
      return null;
  }
}
