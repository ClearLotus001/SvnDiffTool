import { useCallback, useEffect, useMemo, useState } from 'react';

import type { TranslationFn } from '@/context/i18n';
import type { AppUpdateState } from '@/types';
import type { GlobalBotMessage } from '@/components/app/global-bot/messages/types';
import { resolveAppUpdateNotice } from '@/components/app/global-bot/sources/appUpdateNotice';

type DevPreviewPhase = 'idle' | 'available' | 'downloading' | 'downloaded';

interface DevPreviewState {
  phase: DevPreviewPhase;
  progress: number;
}

interface UseDevPreviewNoticeOptions {
  enabled: boolean;
  t: TranslationFn;
}

const DEV_PREVIEW_VERSION = '9.9.9-dev';
const INITIAL_DEV_PREVIEW_STATE: DevPreviewState = {
  phase: 'available',
  progress: 0,
};

function createDevUpdateState(state: DevPreviewState): AppUpdateState {
  return {
    status: state.phase,
    platform: 'win32',
    supportsAutoUpdate: true,
    currentVersion: 'dev',
    availableVersion: DEV_PREVIEW_VERSION,
    downloadPercent: state.progress,
    releaseName: DEV_PREVIEW_VERSION,
    releaseNotes: null,
    publishedAt: null,
    lastCheckedAt: null,
    errorMessage: null,
  };
}

export default function useDevPreviewNotice({
  enabled,
  t,
}: UseDevPreviewNoticeOptions): GlobalBotMessage | null {
  const [previewState, setPreviewState] = useState<DevPreviewState>(INITIAL_DEV_PREVIEW_STATE);

  useEffect(() => {
    if (!enabled || previewState.phase !== 'downloading') return;

    const timer = window.setInterval(() => {
      setPreviewState((current) => {
        if (current.phase !== 'downloading') return current;
        const nextProgress = Math.min(100, current.progress + 5);
        return nextProgress >= 100
          ? { phase: 'downloaded', progress: 100 }
          : { ...current, progress: nextProgress };
      });
    }, 120);

    return () => window.clearInterval(timer);
  }, [enabled, previewState.phase]);

  const startDownloadPreview = useCallback(() => {
    setPreviewState({ phase: 'downloading', progress: 0 });
  }, []);

  const finishPreview = useCallback(() => {
    setPreviewState({ phase: 'idle', progress: 100 });
  }, []);

  return useMemo(() => {
    if (!enabled) return null;
    if (previewState.phase === 'idle') return null;

    const notice = resolveAppUpdateNotice({
      state: createDevUpdateState(previewState),
      t,
      onDownload: startDownloadPreview,
      onInstall: finishPreview,
    });
    if (!notice) return null;

    return {
      ...notice,
      id: `dev-preview:${notice.id}`,
      text: `DEV · ${notice.text}`,
    };
  }, [enabled, finishPreview, previewState, startDownloadPreview, t]);
}
