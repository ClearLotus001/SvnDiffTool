import type {
  AppUpdateState,
  SvnDiffViewerScope,
  SvnDiffViewerStatus,
} from '@/types';
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
  svnDiffViewerError: string;
  onApplySvnDiffViewerScope: (scope: SvnDiffViewerScope) => void;
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
  svnDiffViewerError,
  onApplySvnDiffViewerScope,
  onRefreshSvnDiffViewerStatus,
}: AppDialogsProps) {
  return (
    <>
      {(showGoto || showHelp || showAbout || showSvnConfig) && (
        <div
          onClick={onCloseAll}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 99 }}
        />
      )}

      {showGoto && (
        <GotoLine
          totalLines={totalLines}
          onGoto={onGoto}
          onClose={onCloseGoto}
        />
      )}
      {showHelp && (
        <ShortcutsPanel onClose={onCloseHelp} />
      )}
      {showAbout && (
        <AboutDialog
          updateState={appUpdateState}
          canUninstall={canLaunchUninstaller}
          onClose={onCloseAbout}
          onCheckForUpdates={onCheckForUpdates}
          onDownloadUpdate={onDownloadUpdate}
          onInstallUpdate={onInstallUpdate}
          onUninstall={onLaunchUninstaller}
        />
      )}
      {showSvnConfig && (
        <SvnConfigDialog
          status={svnDiffViewerStatus}
          loading={isLoadingSvnDiffViewerStatus}
          applyingScope={applyingSvnDiffViewerScope}
          error={svnDiffViewerError}
          onApply={onApplySvnDiffViewerScope}
          onRefresh={onRefreshSvnDiffViewerStatus}
          onClose={onCloseSvnConfig}
        />
      )}
    </>
  );
}
