import { memo } from 'react';
import { FONT_CODE, FONT_SIZE, FONT_UI } from '@/constants/typography';
import { useI18n } from '@/context/i18n';
import { useTheme } from '@/context/theme';
import type { SvnDiffViewerScope, SvnDiffViewerStatus } from '@/types';

interface SvnConfigDialogProps {
  status: SvnDiffViewerStatus | null;
  loading: boolean;
  applyingScope: SvnDiffViewerScope | null;
  error: string;
  onApply: (scope: SvnDiffViewerScope) => void;
  onRefresh: () => void;
  onClose: () => void;
}

function ConfigIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round">
      <path d="M8 2.5v1.2" />
      <path d="M8 12.3v1.2" />
      <path d="m4.8 4.8.9.9" />
      <path d="m10.3 10.3.9.9" />
      <path d="M2.5 8h1.2" />
      <path d="M12.3 8h1.2" />
      <path d="m4.8 11.2.9-.9" />
      <path d="m10.3 5.7.9-.9" />
      <circle cx="8" cy="8" r="2.4" />
    </svg>
  );
}

const SvnConfigDialog = memo(({
  status,
  loading,
  applyingScope,
  error,
  onApply,
  onRefresh,
  onClose,
}: SvnConfigDialogProps) => {
  const T = useTheme();
  const { t } = useI18n();

  const workbookCoverage = status
    ? status.workbookExtensions.filter((extension) => (
        status.workbookDiffCommands[extension] != null
        && status.command
        && status.workbookDiffCommands[extension]?.trim().toLowerCase() === status.command.trim().toLowerCase()
      )).length
    : 0;

  const currentModeLabel = (() => {
    switch (status?.currentMode) {
      case 'all-files':
        return t('svnConfigModeAllFiles');
      case 'excel-only':
        return t('svnConfigModeExcelOnly');
      case 'mixed':
        return t('svnConfigModeMixed');
      case 'unsupported':
        return t('svnConfigModeUnsupported');
      case 'unconfigured':
      default:
        return t('svnConfigModeUnconfigured');
    }
  })();

  const availabilityHint = (() => {
    if (!status) return '';
    switch (status.reason) {
      case 'windows-only':
        return t('svnConfigAvailabilityWindowsOnly');
      case 'packaged-only':
        return t('svnConfigAvailabilityPackagedOnly');
      case 'ready':
      default:
        return t('svnConfigAvailabilityReady');
    }
  })();

  const InfoCard = ({
    label,
    value,
    mono = false,
  }: {
    label: string;
    value: string;
    mono?: boolean;
  }) => (
    <div
      style={{
        borderRadius: 18,
        padding: '14px 16px',
        background: `linear-gradient(180deg, ${T.bg0} 0%, ${T.bg1} 100%)`,
        border: `1px solid ${T.border}`,
        display: 'grid',
        gap: 8,
        minWidth: 0,
        }}>
        <div
          style={{
            color: T.t2,
            fontSize: FONT_SIZE.xs,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          fontWeight: 700,
        }}>
        {label}
      </div>
      <div
        style={{
          color: T.t0,
          fontSize: mono ? FONT_SIZE.sm : FONT_SIZE.lg,
          lineHeight: mono ? 1.65 : 1.15,
          fontWeight: mono ? 600 : 850,
          fontFamily: mono ? FONT_CODE : FONT_UI,
          wordBreak: mono ? 'break-all' : 'normal',
        }}>
        {value}
      </div>
    </div>
  );

  const ScopeCard = ({
    scope,
    accent,
    title,
    body,
  }: {
    scope: SvnDiffViewerScope;
    accent: string;
    title: string;
    body: string;
  }) => {
    const current = status?.currentMode === scope;
    const busy = applyingScope === scope;

    return (
      <div
        style={{
          position: 'relative',
          borderRadius: 22,
          padding: '20px 20px 18px',
          background: `linear-gradient(180deg, ${current ? `${accent}10` : T.bg1} 0%, ${T.bg0} 100%)`,
          border: `1px solid ${current ? `${accent}40` : T.border}`,
          boxShadow: `0 20px 40px -34px ${T.border2}`,
          display: 'grid',
          gap: 12,
          minHeight: 212,
          alignContent: 'start',
        }}>
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: 0,
            left: 22,
            right: 22,
            height: 1,
            background: `linear-gradient(90deg, ${accent}88 0%, ${accent}18 55%, ${accent}00 100%)`,
          }}
        />

        <div style={{ display: 'grid', gap: 12, justifyItems: 'center', textAlign: 'center' }}>
          <div
            style={{
              color: T.t0,
              fontSize: 22,
              fontWeight: 860,
              lineHeight: 1.15,
              letterSpacing: -0.35,
              whiteSpace: 'nowrap',
            }}>
            {title}
          </div>
          {current && (
            <span
              style={{
                height: 26,
                padding: '0 12px',
                borderRadius: 999,
                display: 'inline-flex',
                alignItems: 'center',
                background: `${accent}16`,
                color: accent,
                fontSize: FONT_SIZE.xs,
                fontWeight: 800,
                flexShrink: 0,
              }}>
              {t('svnConfigCurrentBadge')}
            </span>
          )}
        </div>

        <div
          style={{
            color: T.t2,
            fontSize: FONT_SIZE.sm,
            lineHeight: 1.75,
            minHeight: 46,
            textAlign: 'center',
          }}>
          {body}
        </div>

        <button
          className="svn-config-action-btn"
          type="button"
          disabled={!status?.available || loading || applyingScope !== null}
          onClick={() => onApply(scope)}
          style={{
            height: 44,
            borderRadius: 14,
            border: 'none',
            background: !status?.available || loading || applyingScope !== null
              ? T.bg3
              : `linear-gradient(135deg, ${accent} 0%, ${accent}dd 100%)`,
            color: !status?.available || loading || applyingScope !== null ? T.t2 : '#fff',
            fontFamily: FONT_UI,
            fontSize: FONT_SIZE.sm,
            fontWeight: 800,
            cursor: !status?.available || loading || applyingScope !== null ? 'not-allowed' : 'pointer',
            boxShadow: !status?.available || loading || applyingScope !== null ? 'none' : `0 18px 34px -26px ${accent}`,
            transition: 'transform 160ms ease, filter 160ms ease, box-shadow 160ms ease',
          }}>
          {busy ? t('svnConfigApplying') : scope === 'all-files' ? t('svnConfigApplyAllFiles') : t('svnConfigApplyExcelOnly')}
        </button>
      </div>
    );
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 100,
        width: 840,
        maxWidth: 'calc(100vw - 32px)',
        maxHeight: 'calc(100vh - 72px)',
        overflow: 'hidden',
        background: T.bg1,
        border: `1px solid ${T.border2}`,
        borderRadius: 28,
        padding: '24px 24px 20px',
        boxShadow: '0 28px 78px rgba(0,0,0,0.35)',
        fontFamily: FONT_UI,
        boxSizing: 'border-box',
      }}>
      <button
        className="svn-config-close-btn"
        type="button"
        onClick={onClose}
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          width: 34,
          height: 34,
          borderRadius: 10,
          border: 'none',
          background: 'transparent',
          color: T.t1,
          cursor: 'pointer',
          fontSize: 18,
          fontFamily: FONT_UI,
          lineHeight: 1,
          transition: 'background 160ms ease, color 160ms ease, transform 160ms ease',
        }}>
        ×
      </button>

      <div style={{ display: 'grid', gap: 14 }}>
        <header style={{ display: 'grid', gap: 10, justifyItems: 'center', textAlign: 'center' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              flexWrap: 'wrap',
            }}>
            <div
              aria-hidden="true"
              style={{
                width: 42,
                height: 42,
                borderRadius: 14,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: T.acc,
                background: `${T.acc}12`,
                border: `1px solid ${T.acc}24`,
                flexShrink: 0,
              }}>
              <ConfigIcon />
            </div>
            <div
              style={{
                color: T.t0,
                fontSize: 32,
                fontWeight: 920,
                lineHeight: 1.08,
                letterSpacing: -1,
              }}>
              {t('svnConfigTitle')}
            </div>
          </div>
          <div
            style={{
              maxWidth: 660,
              color: T.t2,
              fontSize: FONT_SIZE.sm,
              lineHeight: 1.75,
            }}>
            {t('svnConfigSubtitle')}
          </div>
        </header>

        <section
          style={{
            borderRadius: 24,
            padding: '16px',
            background: `linear-gradient(180deg, ${T.bg1} 0%, ${T.bg0} 100%)`,
            border: `1px solid ${T.border}`,
            boxShadow: `0 18px 40px -34px ${T.border2}`,
            display: 'grid',
            gap: 12,
          }}>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              textAlign: 'center',
            }}>
            <span style={{ color: T.t2, fontSize: FONT_SIZE.sm, fontWeight: 700 }}>
              {t('svnConfigCurrentModeLabel')}
            </span>
            <span
              style={{
                minHeight: 30,
                padding: '4px 14px',
                borderRadius: 999,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: `${T.acc2}14`,
                color: T.acc2,
                fontSize: FONT_SIZE.sm,
                fontWeight: 850,
              }}>
              {loading && !status ? t('svnConfigLoading') : currentModeLabel}
            </span>
            {availabilityHint && (
              <span style={{ color: T.t2, fontSize: FONT_SIZE.sm }}>
                {availabilityHint}
              </span>
            )}
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr',
              gap: 12,
            }}>
            <InfoCard
              label={t('svnConfigExecutableLabel')}
              value={status?.executablePath ?? '—'}
              mono
            />
            <InfoCard
              label={t('svnConfigWorkbookCoverageLabel')}
              value={status ? `${workbookCoverage}/${status.workbookExtensions.length}` : '—'}
            />
            <InfoCard
              label={t('svnConfigGlobalCommandLabel')}
              value={status?.globalDiffCommand || t('svnConfigDefaultCommandFallback')}
              mono
            />
          </div>
        </section>

        {(error || (loading && !status)) && (
          <div
            style={{
              borderRadius: 18,
              padding: '13px 15px',
              background: error ? `${T.delBg}cc` : `${T.acc2}0f`,
              border: `1px solid ${error ? T.delBrd : T.border}`,
              color: error ? T.delTx : T.t1,
              fontSize: FONT_SIZE.sm,
              lineHeight: 1.7,
              fontWeight: 700,
              textAlign: 'center',
            }}>
            {error || t('svnConfigLoading')}
          </div>
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
            gap: 16,
          }}>
          <ScopeCard
            scope="all-files"
            accent={T.acc}
            title={t('svnConfigAllFilesTitle')}
            body={t('svnConfigAllFilesBody')}
          />
          <ScopeCard
            scope="excel-only"
            accent={T.acc2}
            title={t('svnConfigExcelOnlyTitle')}
            body={t('svnConfigExcelOnlyBody')}
          />
        </div>

        <section
          style={{
            borderRadius: 18,
            padding: '14px 16px',
            background: `${T.acc2}0d`,
            border: `1px solid ${T.border}`,
            color: T.t1,
            fontSize: FONT_SIZE.sm,
            lineHeight: 1.8,
            textAlign: 'center',
          }}>
          {t('svnConfigSupportHint')}
        </section>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button
            className="svn-config-ghost-btn"
            type="button"
            onClick={onRefresh}
            disabled={loading || applyingScope !== null}
            style={{
              height: 38,
              minWidth: 98,
              padding: '0 16px',
              borderRadius: 12,
              border: `1px solid ${T.border2}`,
              background: 'transparent',
              color: loading || applyingScope !== null ? T.t2 : T.t1,
              fontFamily: FONT_UI,
              fontSize: FONT_SIZE.sm,
              fontWeight: 700,
              cursor: loading || applyingScope !== null ? 'not-allowed' : 'pointer',
              transition: 'background 160ms ease, border-color 160ms ease, color 160ms ease, transform 160ms ease',
            }}>
            {t('svnConfigRefresh')}
          </button>
          <button
            className="svn-config-primary-btn"
            type="button"
            onClick={onClose}
            style={{
              height: 38,
              minWidth: 98,
              padding: '0 16px',
              borderRadius: 12,
              border: 'none',
              background: T.acc2,
              color: '#fff',
              fontFamily: FONT_UI,
              fontSize: FONT_SIZE.sm,
              fontWeight: 800,
              cursor: 'pointer',
              boxShadow: `0 16px 30px -24px ${T.acc2}`,
              transition: 'transform 160ms ease, filter 160ms ease, box-shadow 160ms ease',
            }}>
            {t('svnConfigClose')}
          </button>
        </div>

        <style>{`
          .svn-config-action-btn:not(:disabled):hover,
          .svn-config-primary-btn:not(:disabled):hover {
            transform: translateY(-1px);
            filter: brightness(1.03) saturate(1.04);
            box-shadow: 0 0 0 3px ${T.acc2}14, 0 24px 44px -28px ${T.border2};
          }

          .svn-config-ghost-btn:not(:disabled):hover,
          .svn-config-close-btn:hover {
            transform: translateY(-1px);
            background: ${T.bg2};
            color: ${T.t0};
            border-color: ${T.border2};
          }
        `}</style>
      </div>
    </div>
  );
});

export default SvnConfigDialog;
