import type {
  AppUpdateState,
  LocalDiffFilePickResult,
  LocalFilePickSide,
  SvnDiffViewerScope,
  SvnDiffViewerStatus,
} from '@/types';
import useAnimatedVisibility from '@/hooks/ui/useAnimatedVisibility';
import GotoLine from '@/components/diff/GotoLine';
import AboutDialog from '@/components/app/AboutDialog';
import ShortcutsPanel from '@/components/app/ShortcutsPanel';
import SvnConfigDialog from '@/components/app/SvnConfigDialog';
import LocalFileCompareDialog from '@/components/app/LocalFileCompareDialog';
import type { DialogController } from '@/hooks/app';

interface AppDialogsNavigation {
  totalLines: number;
  onGoto: (lineNo: number) => void;
}

interface AppDialogsUpdate {
  appUpdateState: AppUpdateState | null;
  canLaunchUninstaller: boolean;
  onCheckForUpdates: () => void;
  onDownloadUpdate: () => void;
  onInstallUpdate: () => void;
  onLaunchUninstaller: () => void;
}

interface AppDialogsSvnConfig {
  svnDiffViewerStatus: SvnDiffViewerStatus | null;
  isLoadingSvnDiffViewerStatus: boolean;
  applyingSvnDiffViewerScope: SvnDiffViewerScope | null;
  isRestoringSvnDiffViewerDefault: boolean;
  svnDiffViewerError: string;
  onApplySvnDiffViewerScope: (scope: SvnDiffViewerScope) => void;
  onRestoreSvnDiffViewerDefault: () => void;
  onRefreshSvnDiffViewerStatus: () => void;
}

interface AppDialogsLocalCompare {
  basePath: string;
  minePath: string;
  onPickComparableFile: (
    side: LocalFilePickSide,
    requiredExtension?: string,
  ) => Promise<LocalDiffFilePickResult | null>;
  onCompareLocalFiles: (basePath: string, minePath: string) => Promise<boolean>;
}

interface AppDialogsProps {
  dialogs: DialogController;
  navigation: AppDialogsNavigation;
  update: AppDialogsUpdate;
  svnConfig: AppDialogsSvnConfig;
  localCompare: AppDialogsLocalCompare;
}

export default function AppDialogs({
  dialogs,
  navigation,
  update,
  svnConfig,
  localCompare,
}: AppDialogsProps) {
  const {
    showGoto, showHelp, showAbout, showSvnConfig, showLocalFileCompare,
  } = dialogs.state;
  const { totalLines, onGoto } = navigation;
  const {
    appUpdateState, canLaunchUninstaller,
    onCheckForUpdates, onDownloadUpdate, onInstallUpdate, onLaunchUninstaller,
  } = update;
  const {
    svnDiffViewerStatus, isLoadingSvnDiffViewerStatus,
    applyingSvnDiffViewerScope, isRestoringSvnDiffViewerDefault, svnDiffViewerError,
    onApplySvnDiffViewerScope, onRestoreSvnDiffViewerDefault, onRefreshSvnDiffViewerStatus,
  } = svnConfig;
  const {
    basePath: localFileCompareBasePath,
    minePath: localFileCompareMinePath,
    onPickComparableFile,
    onCompareLocalFiles,
  } = localCompare;
  const onCloseGoto = () => dialogs.actions.close('goto');
  const onCloseHelp = () => dialogs.actions.close('help');
  const onCloseAbout = () => dialogs.actions.close('about');
  const onCloseSvnConfig = () => dialogs.actions.close('svnConfig');
  const onCloseLocalFileCompare = () => dialogs.actions.close('localFileCompare');
  const onCloseAll = dialogs.actions.closeAll;
  const anyDialogOpen = showGoto || showHelp || showAbout || showSvnConfig || showLocalFileCompare;
  const overlayMotion = useAnimatedVisibility(anyDialogOpen, { exitDurationMs: 150 });
  const gotoMotion = useAnimatedVisibility(showGoto);
  const helpMotion = useAnimatedVisibility(showHelp);
  const aboutMotion = useAnimatedVisibility(showAbout);
  const svnConfigMotion = useAnimatedVisibility(showSvnConfig, { exitDurationMs: 190 });
  const localFileCompareMotion = useAnimatedVisibility(showLocalFileCompare, { exitDurationMs: 190 });

  return (
    <>
      {overlayMotion.shouldRender && (
        <div
          data-state={overlayMotion.state}
          onClick={onCloseAll}
          className="motion-dialog-overlay fixed inset-0 bg-modal-overlay z-[99]"
        />
      )}

      {gotoMotion.shouldRender && (
        <GotoLine
          animationState={gotoMotion.state}
          totalLines={totalLines}
          onGoto={onGoto}
          onClose={onCloseGoto}
        />
      )}
      {helpMotion.shouldRender && (
        <ShortcutsPanel
          animationState={helpMotion.state}
          onClose={onCloseHelp}
        />
      )}
      {aboutMotion.shouldRender && (
        <AboutDialog
          animationState={aboutMotion.state}
          updateState={appUpdateState}
          canUninstall={canLaunchUninstaller}
          onClose={onCloseAbout}
          onCheckForUpdates={onCheckForUpdates}
          onDownloadUpdate={onDownloadUpdate}
          onInstallUpdate={onInstallUpdate}
          onUninstall={onLaunchUninstaller}
        />
      )}
      {svnConfigMotion.shouldRender && (
        <SvnConfigDialog
          animationState={svnConfigMotion.state}
          status={svnDiffViewerStatus}
          loading={isLoadingSvnDiffViewerStatus}
          applyingScope={applyingSvnDiffViewerScope}
          isRestoringDefault={isRestoringSvnDiffViewerDefault}
          error={svnDiffViewerError}
          onApply={onApplySvnDiffViewerScope}
          onRestoreDefault={onRestoreSvnDiffViewerDefault}
          onRefresh={onRefreshSvnDiffViewerStatus}
          onClose={onCloseSvnConfig}
        />
      )}
      {localFileCompareMotion.shouldRender && (
        <LocalFileCompareDialog
          animationState={localFileCompareMotion.state}
          initialBasePath={localFileCompareBasePath}
          initialMinePath={localFileCompareMinePath}
          onPickFile={onPickComparableFile}
          onCompare={onCompareLocalFiles}
          onClose={onCloseLocalFileCompare}
        />
      )}
    </>
  );
}
