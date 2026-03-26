import { memo } from 'react';
import { FONT_CODE, FONT_SIZE, FONT_UI } from '../constants/typography';
import { useI18n } from '../context/i18n';
import { useTheme } from '../context/theme';
import type { AppUpdateState } from '../types';

interface AboutDialogProps {
  updateState: AppUpdateState | null;
  onClose: () => void;
  onCheckForUpdates: () => void;
  onDownloadUpdate: () => void;
  onInstallUpdate: () => void;
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
  updateState,
  onClose,
  onCheckForUpdates,
  onDownloadUpdate,
  onInstallUpdate,
}: AboutDialogProps) => {
  const T = useTheme();
  const { t } = useI18n();

  const currentVersion = updateState?.currentVersion ?? '—';
  const availableVersion = updateState?.availableVersion ?? '—';
  const lastCheckedAt = formatDateTime(updateState?.lastCheckedAt ?? null);
  const publishedAt = formatDateTime(updateState?.publishedAt ?? null);
  const releaseNotes = updateState?.releaseNotes?.trim() ?? '';

  const statusLabel = (() => {
    switch (updateState?.status) {
      case 'checking':
        return t('aboutUpdateStatusChecking');
      case 'available':
        return t('aboutUpdateStatusAvailable');
      case 'downloading':
        return `${t('aboutUpdateStatusDownloading')} ${Math.round(updateState.downloadPercent)}%`;
      case 'downloaded':
        return t('aboutUpdateStatusDownloaded');
      case 'upToDate':
        return t('aboutUpdateStatusUpToDate');
      case 'error':
        return t('aboutUpdateStatusError');
      case 'disabled':
        return t('aboutUpdateStatusDisabled');
      case 'unsupported':
        return t('aboutUpdateStatusUnsupported');
      case 'idle':
      default:
        return t('aboutUpdateStatusIdle');
    }
  })();

  const hintText = (() => {
    switch (updateState?.status) {
      case 'disabled':
        return t('aboutUpdateDisabledHint');
      case 'unsupported':
        return t('aboutUpdateUnsupportedHint');
      case 'error':
        return updateState.errorMessage || t('aboutUpdateErrorFallback');
      case 'available':
        return updateState.releaseName
          ? t('aboutUpdateAvailableHint', { version: updateState.releaseName })
          : t('aboutUpdateAvailableHint', { version: availableVersion });
      default:
        return '';
    }
  })();

  const notesTitle = (() => {
    switch (updateState?.status) {
      case 'available':
      case 'downloading':
      case 'downloaded':
        return t('aboutReleaseNotesLatest');
      default:
        return t('aboutReleaseNotesTitle');
    }
  })();

  const releaseNotesText = releaseNotes || (() => {
    switch (updateState?.status) {
      case 'disabled':
        return t('aboutReleaseNotesDisabledHint');
      case 'unsupported':
        return t('aboutReleaseNotesUnsupportedHint');
      case 'checking':
        return t('aboutReleaseNotesCheckingHint');
      case 'upToDate':
        return t('aboutReleaseNotesNoChangesHint');
      default:
        return t('aboutReleaseNotesEmpty');
    }
  })();

  const actionButton = (() => {
    switch (updateState?.status) {
      case 'available':
        return {
          label: t('toolbarUpdateDownload'),
          onClick: onDownloadUpdate,
          disabled: false,
        };
      case 'downloaded':
        return {
          label: t('toolbarUpdateInstall'),
          onClick: onInstallUpdate,
          disabled: false,
        };
      case 'checking':
      case 'downloading':
        return {
          label: t('toolbarUpdateChecking'),
          onClick: onCheckForUpdates,
          disabled: true,
        };
      case 'disabled':
      case 'unsupported':
        return {
          label: t('toolbarUpdateCheck'),
          onClick: onCheckForUpdates,
          disabled: true,
        };
      case 'idle':
      case 'upToDate':
      case 'error':
      default:
        return {
          label: t('toolbarUpdateCheck'),
          onClick: onCheckForUpdates,
          disabled: false,
        };
    }
  })();

  return (
    <div style={{
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%,-50%)',
      zIndex: 100,
      width: 500,
      maxWidth: 'calc(100vw - 32px)',
      background: T.bg1,
      border: `1px solid ${T.border2}`,
      borderRadius: 18,
      padding: '20px 22px',
      boxShadow: '0 24px 70px rgba(0,0,0,0.45)',
      fontFamily: FONT_UI,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontSize: FONT_SIZE.lg, fontWeight: 700, color: T.t0 }}>
            {t('aboutTitle')}
          </div>
          <div style={{ marginTop: 6, color: T.t2, fontSize: FONT_SIZE.sm, lineHeight: 1.5 }}>
            {t('aboutSubtitle')}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: T.t1,
            cursor: 'pointer',
            fontSize: 18,
            fontFamily: FONT_UI,
            lineHeight: 1,
          }}>
          ×
        </button>
      </div>

      <div style={{
        marginTop: 16,
        padding: '14px 16px',
        borderRadius: 14,
        background: T.bg2,
        border: `1px solid ${T.border}`,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, paddingBottom: 10 }}>
          <span style={{ color: T.t2, fontSize: FONT_SIZE.sm }}>{t('aboutVersionLabel')}</span>
          <code style={{ color: T.acc2, fontSize: FONT_SIZE.sm, fontFamily: FONT_CODE }}>v{currentVersion}</code>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderTop: `1px solid ${T.border}` }}>
          <span style={{ color: T.t2, fontSize: FONT_SIZE.sm }}>{t('aboutUpdateStatusLabel')}</span>
          <span style={{ color: T.t0, fontSize: FONT_SIZE.sm, fontWeight: 600 }}>{statusLabel}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderTop: `1px solid ${T.border}` }}>
          <span style={{ color: T.t2, fontSize: FONT_SIZE.sm }}>{t('aboutAvailableVersionLabel')}</span>
          <code style={{ color: T.t0, fontSize: FONT_SIZE.sm, fontFamily: FONT_CODE }}>{availableVersion === '—' ? availableVersion : `v${availableVersion}`}</code>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderTop: `1px solid ${T.border}` }}>
          <span style={{ color: T.t2, fontSize: FONT_SIZE.sm }}>{t('aboutLastCheckedLabel')}</span>
          <span style={{ color: T.t1, fontSize: FONT_SIZE.sm }}>{lastCheckedAt}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, paddingTop: 10, borderTop: `1px solid ${T.border}` }}>
          <span style={{ color: T.t2, fontSize: FONT_SIZE.sm }}>{t('aboutPublishedAtLabel')}</span>
          <span style={{ color: T.t1, fontSize: FONT_SIZE.sm }}>{publishedAt}</span>
        </div>
      </div>

      {hintText && (
        <div style={{
          marginTop: 12,
          color: updateState?.status === 'error' ? T.delTx : T.t1,
          fontSize: FONT_SIZE.sm,
          lineHeight: 1.5,
        }}>
          {hintText}
        </div>
      )}

      <div style={{
        marginTop: 16,
        padding: '14px 16px',
        borderRadius: 14,
        background: `linear-gradient(180deg, ${T.bg2} 0%, ${T.bg1} 100%)`,
        border: `1px solid ${T.border}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
          <div style={{ color: T.t0, fontSize: FONT_SIZE.md, fontWeight: 700 }}>
            {notesTitle}
          </div>
          <div style={{ color: T.t2, fontSize: FONT_SIZE.xs, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            {t('aboutChannelStable')}
          </div>
        </div>
        <div style={{
          maxHeight: 176,
          overflowY: 'auto',
          padding: '12px 12px 12px 14px',
          borderRadius: 12,
          background: T.bg0,
          border: `1px solid ${T.border}`,
          color: releaseNotes ? T.t1 : T.t2,
          fontSize: FONT_SIZE.sm,
          lineHeight: 1.65,
          whiteSpace: 'pre-wrap',
        }}>
          {releaseNotesText}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
          <button
            type="button"
            onClick={() => openExternal('https://github.com/ClearLotus001/SvnDiffTool')}
            style={{
              height: 32,
              padding: '0 12px',
              borderRadius: 9,
              border: `1px solid ${T.border2}`,
              background: 'transparent',
              color: T.t1,
              fontFamily: FONT_UI,
              fontSize: FONT_SIZE.sm,
              fontWeight: 600,
              cursor: 'pointer',
            }}>
            {t('aboutOpenRepository')}
          </button>
          <button
            type="button"
            onClick={() => openExternal('https://github.com/ClearLotus001/SvnDiffTool/releases')}
            style={{
              height: 32,
              padding: '0 12px',
              borderRadius: 9,
              border: `1px solid ${T.border2}`,
              background: 'transparent',
              color: T.t1,
              fontFamily: FONT_UI,
              fontSize: FONT_SIZE.sm,
              fontWeight: 600,
              cursor: 'pointer',
            }}>
            {t('aboutOpenReleases')}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
        <button
          type="button"
          onClick={actionButton.onClick}
          disabled={actionButton.disabled}
          style={{
            height: 34,
            minWidth: 108,
            padding: '0 14px',
            borderRadius: 9,
            border: 'none',
            background: actionButton.disabled ? T.bg3 : T.acc2,
            color: actionButton.disabled ? T.t2 : '#fff',
            fontFamily: FONT_UI,
            fontSize: FONT_SIZE.sm,
            fontWeight: 700,
            cursor: actionButton.disabled ? 'not-allowed' : 'pointer',
          }}>
          {actionButton.label}
        </button>
        <button
          type="button"
          onClick={onClose}
          style={{
            height: 34,
            minWidth: 86,
            padding: '0 14px',
            borderRadius: 9,
            border: `1px solid ${T.border2}`,
            background: 'transparent',
            color: T.t1,
            fontFamily: FONT_UI,
            fontSize: FONT_SIZE.sm,
            fontWeight: 600,
            cursor: 'pointer',
          }}>
          {t('aboutClose')}
        </button>
      </div>
    </div>
  );
});

export default AboutDialog;
