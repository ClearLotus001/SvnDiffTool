import { memo } from 'react';
import { X } from 'lucide-react';
import { useI18n } from '@/context/i18n';
import { cssAlpha } from '@/theme/cssUtils';
import DialogFrame from '@/components/shared/DialogFrame';
import type { AnimatedVisibilityState } from '@/hooks/ui/useAnimatedVisibility';
import type { AppUpdateState } from '@/types';

interface AboutDialogProps {
  animationState: AnimatedVisibilityState;
  updateState: AppUpdateState | null;
  canUninstall: boolean;
  onClose: () => void;
  onCheckForUpdates: () => void;
  onDownloadUpdate: () => void;
  onInstallUpdate: () => void;
  onUninstall: () => void;
}

function formatDateTime(value: string | null): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return `${parsed.getFullYear()}-${`${parsed.getMonth() + 1}`.padStart(2, '0')}-${`${parsed.getDate()}`.padStart(2, '0')} ${`${parsed.getHours()}`.padStart(2, '0')}:${`${parsed.getMinutes()}`.padStart(2, '0')}`;
}

function openExternal(url: string) {
  window.svnDiff?.openExternal?.(url);
}

const AboutDialog = memo(({
  animationState,
  updateState, canUninstall, onClose,
  onCheckForUpdates, onDownloadUpdate, onInstallUpdate, onUninstall,
}: AboutDialogProps) => {
  const { t } = useI18n();

  const currentVersion = updateState?.currentVersion ?? '—';
  const availableVersion = updateState?.availableVersion ?? '—';
  const lastCheckedAt = formatDateTime(updateState?.lastCheckedAt ?? null);
  const publishedAt = formatDateTime(updateState?.publishedAt ?? null);
  const releaseNotes = updateState?.releaseNotes?.trim() ?? '';

  const statusLabel = (() => {
    switch (updateState?.status) {
      case 'checking': return t('aboutUpdateStatusChecking');
      case 'available': return t('aboutUpdateStatusAvailable');
      case 'downloading': return `${t('aboutUpdateStatusDownloading')} ${Math.round(updateState.downloadPercent)}%`;
      case 'downloaded': return t('aboutUpdateStatusDownloaded');
      case 'upToDate': return t('aboutUpdateStatusUpToDate');
      case 'error': return t('aboutUpdateStatusError');
      case 'disabled': return t('aboutUpdateStatusDisabled');
      case 'unsupported': return t('aboutUpdateStatusUnsupported');
      case 'idle': default: return t('aboutUpdateStatusIdle');
    }
  })();

  const hintText = (() => {
    switch (updateState?.status) {
      case 'disabled': return t('aboutUpdateDisabledHint');
      case 'unsupported': return t('aboutUpdateUnsupportedHint');
      case 'error': return updateState.errorMessage || t('aboutUpdateErrorFallback');
      case 'available': return updateState.releaseName
        ? t('aboutUpdateAvailableHint', { version: updateState.releaseName })
        : t('aboutUpdateAvailableHint', { version: availableVersion });
      default: return '';
    }
  })();

  const notesTitle = (() => {
    switch (updateState?.status) {
      case 'available': case 'downloading': case 'downloaded': return t('aboutReleaseNotesLatest');
      default: return t('aboutReleaseNotesTitle');
    }
  })();

  const releaseNotesText = releaseNotes || (() => {
    switch (updateState?.status) {
      case 'disabled': return t('aboutReleaseNotesDisabledHint');
      case 'unsupported': return t('aboutReleaseNotesUnsupportedHint');
      case 'checking': return t('aboutReleaseNotesCheckingHint');
      case 'upToDate': return t('aboutReleaseNotesNoChangesHint');
      default: return t('aboutReleaseNotesEmpty');
    }
  })();

  const actionButton = (() => {
    switch (updateState?.status) {
      case 'available': return { label: t('toolbarUpdateDownload'), onClick: onDownloadUpdate, disabled: false };
      case 'downloaded': return { label: t('toolbarUpdateInstall'), onClick: onInstallUpdate, disabled: false };
      case 'checking': case 'downloading': return { label: t('toolbarUpdateChecking'), onClick: onCheckForUpdates, disabled: true };
      case 'disabled': case 'unsupported': return { label: t('toolbarUpdateCheck'), onClick: onCheckForUpdates, disabled: true };
      case 'idle': case 'upToDate': case 'error': default:
        return { label: t('toolbarUpdateCheck'), onClick: onCheckForUpdates, disabled: false };
    }
  })();

  const InfoRow = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="flex justify-between gap-3 py-2.5 border-t border-border-default first:border-t-0 first:pb-2.5 first:pt-0">
      <span className="text-text-secondary text-[13px]">{label}</span>
      {children}
    </div>
  );

  return (
    <DialogFrame
      animationState={animationState}
      className="w-[500px] max-w-[calc(100vw-32px)] bg-bg-surface-solid border border-border-strong rounded-[18px] p-[20px_22px] shadow-2xl font-ui">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[15px] font-bold text-text-title">{t('aboutTitle')}</div>
          <div className="mt-1.5 text-text-secondary text-[13px] leading-normal">{t('aboutSubtitle')}</div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('commonClose')}
          className="size-7 rounded-lg bg-transparent border-none text-text-primary cursor-pointer flex items-center justify-center hover:bg-bg-surface-hover hover:text-accent active:scale-95 transition-all duration-150">
          <X size={16} />
        </button>
      </div>

      <div className="mt-4 p-[14px_16px] rounded-[14px] bg-bg-surface-hover border border-border-default">
        <InfoRow label={t('aboutVersionLabel')}>
          <code className="text-[var(--acc2)] text-[13px] font-code">v{currentVersion}</code>
        </InfoRow>
        <InfoRow label={t('aboutUpdateStatusLabel')}>
          <span className="text-text-title text-[13px] font-semibold">{statusLabel}</span>
        </InfoRow>
        <InfoRow label={t('aboutAvailableVersionLabel')}>
          <code className="text-text-title text-[13px] font-code">{availableVersion === '—' ? availableVersion : `v${availableVersion}`}</code>
        </InfoRow>
        <InfoRow label={t('aboutLastCheckedLabel')}>
          <span className="text-text-primary text-[13px]">{lastCheckedAt}</span>
        </InfoRow>
        <InfoRow label={t('aboutPublishedAtLabel')}>
          <span className="text-text-primary text-[13px]">{publishedAt}</span>
        </InfoRow>
      </div>

      {hintText && (
        <div className={`mt-3 text-[13px] leading-normal ${updateState?.status === 'error' ? 'text-diff-remove-text' : 'text-text-primary'}`}>
          {hintText}
        </div>
      )}

      <div className="mt-4 p-[14px_16px] rounded-[14px] bg-bg-surface-hover border border-border-default">
        <div className="flex items-center justify-between gap-3 mb-2.5">
          <div className="text-text-title text-[14px] font-bold">{notesTitle}</div>
          <div className="text-text-secondary text-[11px] tracking-wider uppercase">{t('aboutChannelStable')}</div>
        </div>
        <div className={`max-h-44 overflow-y-auto p-3 pl-3.5 rounded-xl bg-bg-base border border-border-default text-[13px] leading-relaxed whitespace-pre-wrap ${releaseNotes ? 'text-text-primary' : 'text-text-secondary'}`}>
          {releaseNotesText}
        </div>
        <div className="flex gap-2.5 mt-3">
          <button
            type="button"
            onClick={() => openExternal('https://github.com/ClearLotus001/Versora')}
            className="h-8 px-3 rounded-[9px] border border-border-strong bg-transparent text-text-primary font-ui text-[13px] font-semibold cursor-pointer hover:bg-bg-surface-hover hover:text-accent active:scale-[0.97] transition-all duration-150">
            {t('aboutOpenRepository')}
          </button>
          <button
            type="button"
            onClick={() => openExternal('https://github.com/ClearLotus001/Versora/releases')}
            className="h-8 px-3 rounded-[9px] border border-border-strong bg-transparent text-text-primary font-ui text-[13px] font-semibold cursor-pointer hover:bg-bg-surface-hover hover:text-accent active:scale-[0.97] transition-all duration-150">
            {t('aboutOpenReleases')}
          </button>
        </div>
      </div>

      <div className="flex justify-end gap-2.5 mt-[18px]">
        {canUninstall && (
          <button
            type="button"
            onClick={onUninstall}
            className="h-[34px] min-w-[108px] px-3.5 rounded-[9px] border border-diff-remove-border text-diff-remove-text font-ui text-[13px] font-bold cursor-pointer hover:brightness-110 active:scale-[0.97] transition-all duration-150"
            style={{ background: cssAlpha('delBg', 'cc') }}>
            {t('aboutUninstallAction')}
          </button>
        )}
        <button
          type="button"
          onClick={actionButton.onClick}
          disabled={actionButton.disabled}
          className={`
            h-[34px] min-w-[108px] px-3.5 rounded-[9px] border-none
            font-ui text-[13px] font-bold transition-all duration-150
            ${actionButton.disabled
              ? 'bg-bg-elevated text-text-secondary cursor-not-allowed'
              : 'bg-[var(--acc2)] text-[var(--btn-active-text)] cursor-pointer hover:-translate-y-px hover:brightness-105 active:scale-[0.97] shadow-[0_16px_30px_-24px_var(--acc2)]'
            }
          `}>
          {actionButton.label}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="h-[34px] min-w-[86px] px-3.5 rounded-[9px] border border-border-strong bg-transparent text-text-primary font-ui text-[13px] font-semibold cursor-pointer hover:bg-bg-surface-hover hover:text-accent active:scale-[0.97] transition-all duration-150">
          {t('aboutClose')}
        </button>
      </div>
    </DialogFrame>
  );
});

export default AboutDialog;
