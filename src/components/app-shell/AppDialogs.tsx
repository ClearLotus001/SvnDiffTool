import type {
  AppUpdateState,
  SvnDiffViewerScope,
  SvnDiffViewerStatus,
} from '@/types';
import useAnimatedVisibility from '@/hooks/ui/useAnimatedVisibility';
import GotoLine from '@/components/diff/GotoLine';
import AboutDialog from '@/components/app/AboutDialog';
import ShortcutsPanel from '@/components/app/ShortcutsPanel';
import SvnConfigDialog from '@/components/app/SvnConfigDialog';

interface AppDialogsProps {
  showGoto: boolean;
  showHelp: boolean;
  showAbout: boolean;
  showSvnConfig: boolean;
  totalLines: number;
  onGoto: (lineNo: number) => void;
  onCloseGoto: () => void;
  onCloseHelp: () => void;
  onCloseAbout: () => void;
  onCloseSvnConfig: () => void;
  onCloseAll: () => void;
  appUpdateState: AppUpdateState | null;
  canLaunchUninstaller: boolean;
  onCheckForUpdates: () => void;
  onDownloadUpdate: () => void;
  onInstallUpdate: () => void;
  onLaunchUninstaller: () => void;
  svnDiffViewerStatus: SvnDiffViewerStatus | null;
  isLoadingSvnDiffViewerStatus: boolean;
  applyingSvnDiffViewerScope: SvnDiffViewerScope | null;
  isRestoringSvnDiffViewerDefault: boolean;
  svnDiffViewerError: string;
  onApplySvnDiffViewerScope: (scope: SvnDiffViewerScope) => void;
  onRestoreSvnDiffViewerDefault: () => void;
  onRefreshSvnDiffViewerStatus: () => void;
}

export default function AppDialogs({
  showGoto,
  showHelp,
  showAbout,
  showSvnConfig,
  totalLines,
  onGoto,
  onCloseGoto,
  onCloseHelp,
  onCloseAbout,
  onCloseSvnConfig,
  onCloseAll,
  appUpdateState,
  canLaunchUninstaller,
  onCheckForUpdates,
  onDownloadUpdate,
  onInstallUpdate,
  onLaunchUninstaller,
  svnDiffViewerStatus,
  isLoadingSvnDiffViewerStatus,
  applyingSvnDiffViewerScope,
  isRestoringSvnDiffViewerDefault,
  svnDiffViewerError,
  onApplySvnDiffViewerScope,
  onRestoreSvnDiffViewerDefault,
  onRefreshSvnDiffViewerStatus,
}: AppDialogsProps) {
  const anyDialogOpen = showGoto || showHelp || showAbout || showSvnConfig;
  const overlayMotion = useAnimatedVisibility(anyDialogOpen, { exitDurationMs: 150 });
  const gotoMotion = useAnimatedVisibility(showGoto);
  const helpMotion = useAnimatedVisibility(showHelp);
  const aboutMotion = useAnimatedVisibility(showAbout);
  const svnConfigMotion = useAnimatedVisibility(showSvnConfig, { exitDurationMs: 190 });

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
    </>
  );
}
