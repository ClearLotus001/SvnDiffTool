import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';

import type { SvnRevisionInfo, Theme, WorkbookCompareMode } from '@/types';
import { clearTokenCache } from '@/engine/text/tokenizer';
import { saveStoredAppSettings, type AppSettings } from '@/utils/app/settings';

interface UseAppChromeEffectsArgs {
  theme: Theme;
  isElectron: boolean;
  usesNativeWindowControls: boolean;
  revisionOptions: SvnRevisionInfo[];
  revisionOptionsRef: MutableRefObject<SvnRevisionInfo[]>;
  artifactNoticeKey: string;
  setArtifactNoticeDismissed: Dispatch<SetStateAction<boolean>>;
  diffSourceNoticeKey: string;
  setDiffSourceNoticeDismissed: Dispatch<SetStateAction<boolean>>;
  hasLoadedDiff: boolean;
  hasLoadedDiffRef: MutableRefObject<boolean>;
  workbookCompareMode: WorkbookCompareMode;
  workbookCompareModeRef: MutableRefObject<WorkbookCompareMode>;
  settings: AppSettings;
}

export default function useAppChromeEffects({
  theme,
  isElectron,
  usesNativeWindowControls,
  revisionOptions,
  revisionOptionsRef,
  artifactNoticeKey,
  setArtifactNoticeDismissed,
  diffSourceNoticeKey,
  setDiffSourceNoticeDismissed,
  hasLoadedDiff,
  hasLoadedDiffRef,
  workbookCompareMode,
  workbookCompareModeRef,
  settings,
}: UseAppChromeEffectsArgs) {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.style.setProperty('--scroll-thumb', theme.scrollThumb);
    root.style.setProperty('--scroll-thumb-hover', theme.scrollThumbHover);
    root.style.setProperty('--scroll-track', theme.scrollTrack);
  }, [theme]);

  useEffect(() => {
    if (!isElectron || !usesNativeWindowControls || !window.svnDiff?.setTitleBarOverlay) return;
    window.svnDiff.setTitleBarOverlay({
      color: theme.bg1,
      symbolColor: theme.t0,
      height: 44,
    });
  }, [theme, isElectron, usesNativeWindowControls]);

  useEffect(() => {
    revisionOptionsRef.current = revisionOptions;
  }, [revisionOptions, revisionOptionsRef]);

  useEffect(() => {
    setArtifactNoticeDismissed(false);
  }, [artifactNoticeKey, setArtifactNoticeDismissed]);

  useEffect(() => {
    setDiffSourceNoticeDismissed(false);
  }, [diffSourceNoticeKey, setDiffSourceNoticeDismissed]);

  useEffect(() => {
    clearTokenCache();
  }, [theme]);

  useEffect(() => {
    hasLoadedDiffRef.current = hasLoadedDiff;
  }, [hasLoadedDiff, hasLoadedDiffRef]);

  useEffect(() => {
    workbookCompareModeRef.current = workbookCompareMode;
  }, [workbookCompareMode, workbookCompareModeRef]);

  useEffect(() => {
    saveStoredAppSettings(settings);
  }, [settings]);
}
