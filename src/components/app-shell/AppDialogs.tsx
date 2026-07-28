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

interface AppDialogsProps {
  showGoto: boolean;
  showHelp: boolean;
  showAbout: boolean;
  showSvnConfig: boolean;
  showLocalFileCompare: boolean;
  localFileCompareLoading: boolean;
  localFileCompareError: string;
  localFileCompareBasePath: string;
  localFileCompareMinePath: string;
  totalLines: number;
  onGoto: (lineNo: number) => void;
  onCloseGoto: () => void;
  onCloseHelp: () => void;
  onCloseAbout: () => void;
  onCloseSvnConfig: () => void;
  onCloseLocalFileCompare: () => void;
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
  onPickComparableFile: (
    side: LocalFilePickSide,
    requiredExtension?: string,
  ) => Promise<LocalDiffFilePickResult | null>;
  onCompareLocalFiles: (basePath: string, minePath: string) => Promise<boolean>;
}

export default function AppDialogs({
  showGoto,
  showHelp,
  showAbout,
  showSvnConfig,
  showLocalFileCompare,
  localFileCompareLoading,
  localFileCompareError,
  localFileCompareBasePath,
  localFileCompareMinePath,
  totalLines,
  onGoto,
  onCloseGoto,
  onCloseHelp,
  onCloseAbout,
  onCloseSvnConfig,
  onCloseLocalFileCompare,
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
  onPickComparableFile,
  onCompareLocalFiles,
}: AppDialogsProps) {
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
          loading={localFileCompareLoading}
          error={localFileCompareError}
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
