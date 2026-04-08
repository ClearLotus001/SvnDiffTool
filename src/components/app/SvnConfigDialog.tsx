import { memo } from 'react';
import { Settings, X } from 'lucide-react';
import { useI18n } from '@/context/i18n';
import { cssAlpha, cssAlphaRaw, cssVar } from '@/theme/cssUtils';
import DialogFrame from '@/components/shared/DialogFrame';
import type { AnimatedVisibilityState } from '@/hooks/ui/useAnimatedVisibility';
import type { SvnDiffViewerScope, SvnDiffViewerStatus } from '@/types';

interface SvnConfigDialogProps {
  animationState: AnimatedVisibilityState;
  status: SvnDiffViewerStatus | null;
  loading: boolean;
  applyingScope: SvnDiffViewerScope | null;
  isRestoringDefault: boolean;
  error: string;
  onApply: (scope: SvnDiffViewerScope) => void;
  onRestoreDefault: () => void;
  onRefresh: () => void;
  onClose: () => void;
}

function normalizeCommand(value: string | null | undefined) {
  return (value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

const SvnConfigDialog = memo(({
  animationState,
  status, loading, applyingScope, isRestoringDefault, error,
  onApply, onRestoreDefault, onRefresh, onClose,
}: SvnConfigDialogProps) => {
  const { t } = useI18n();
  const isBusy = applyingScope !== null || isRestoringDefault;
  const normalizedCommand = normalizeCommand(status?.command);

  const workbookCoverage = status
    ? status.workbookExtensions.filter((extension) => (
        status.workbookDiffCommands[extension] != null
        && normalizedCommand
        && normalizeCommand(status.workbookDiffCommands[extension]) === normalizedCommand
      )).length
    : 0;
  const canRestoreDefault = Boolean(status?.available && status.canRestoreDefault);

  const currentModeLabel = (() => {
    switch (status?.currentMode) {
      case 'all-files': return t('svnConfigModeAllFiles');
      case 'text-only': return t('svnConfigModeTextOnly');
      case 'workbook-only': return t('svnConfigModeWorkbookOnly');
      case 'mixed': return t('svnConfigModeMixed');
      case 'unsupported': return t('svnConfigModeUnsupported');
      case 'unconfigured': default: return t('svnConfigModeUnconfigured');
    }
  })();

  const availabilityHint = (() => {
    if (!status) return '';
    switch (status.reason) {
      case 'windows-only': return t('svnConfigAvailabilityWindowsOnly');
      case 'packaged-only': return t('svnConfigAvailabilityPackagedOnly');
      case 'ready': default: return t('svnConfigAvailabilityReady');
    }
  })();

  const InfoCard = ({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) => (
    <div className="rounded-[18px] p-[14px_16px] bg-bg-base border border-border-default grid gap-2 min-w-0">
      <div className="text-text-secondary text-[11px] uppercase tracking-widest font-bold">{label}</div>
      <div className={`text-text-title ${mono ? 'text-[13px] leading-relaxed font-semibold font-code break-all' : 'text-[15px] leading-tight font-[850] font-ui'}`}>
        {value}
      </div>
    </div>
  );

  const ScopeCard = ({
    scope, accent, title, body,
  }: {
    scope: SvnDiffViewerScope; accent: string; title: string; body: string;
  }) => {
    const current = status?.currentMode === scope;
    const busy = applyingScope === scope;
    const isDisabled = !status?.available || loading || isBusy;

    const applyLabel = (() => {
      if (busy) return t('svnConfigApplying');
      if (scope === 'all-files') return t('svnConfigApplyAllFiles');
      if (scope === 'text-only') return t('svnConfigApplyTextOnly');
      return t('svnConfigApplyWorkbookOnly');
    })();

    return (
      <div
        className="relative rounded-[22px] p-[20px_20px_18px] border grid gap-3 min-h-[212px] content-start"
        style={{
          background: `linear-gradient(180deg, ${current ? cssAlphaRaw(accent, '10') : 'var(--bg-surface-solid)'} 0%, var(--bg-base) 100%)`,
          borderColor: current ? cssAlphaRaw(accent, '40') : undefined,
          boxShadow: `0 20px 40px -34px var(--border-strong)`,
        }}>
        <div
          aria-hidden="true"
          className="absolute top-0 left-[22px] right-[22px] h-px"
          style={{ background: `linear-gradient(90deg, ${cssAlphaRaw(accent, '88')} 0%, ${cssAlphaRaw(accent, '18')} 55%, ${cssAlphaRaw(accent, '00')} 100%)` }}
        />
        <div className="grid gap-3 justify-items-center text-center">
          <div className="text-text-title text-[22px] font-[860] leading-tight tracking-tight whitespace-nowrap">
            {title}
          </div>
          {current && (
            <span
              className="h-[26px] px-3 rounded-full inline-flex items-center text-[11px] font-extrabold shrink-0"
              style={{ background: cssAlphaRaw(accent, '16'), color: `var(${accent})` }}>
              {t('svnConfigCurrentBadge')}
            </span>
          )}
        </div>
        <div className="text-text-secondary text-[13px] leading-[1.75] min-h-[46px] text-center">{body}</div>
        <button
          type="button"
          disabled={isDisabled}
          onClick={() => onApply(scope)}
          className={`
            h-11 rounded-[14px] border-none font-ui text-[13px] font-extrabold
            transition-all duration-150
            ${isDisabled
              ? 'bg-bg-elevated text-text-secondary cursor-not-allowed shadow-none'
              : 'text-[var(--btn-active-text)] cursor-pointer hover:-translate-y-px hover:brightness-[1.03] active:scale-[0.97]'
            }
          `}
          style={isDisabled ? undefined : {
            background: `linear-gradient(135deg, var(${accent}) 0%, ${cssAlphaRaw(accent, 'dd')} 100%)`,
            boxShadow: `0 18px 34px -26px var(${accent})`,
          }}>
          {applyLabel}
        </button>
      </div>
    );
  };

  return (
    <DialogFrame
      animationState={animationState}
      className="w-[1040px] max-w-[calc(100vw-32px)] max-h-[calc(100vh-72px)] overflow-hidden bg-bg-surface-solid border border-border-strong rounded-[28px] p-[24px_24px_20px] shadow-2xl font-ui box-border">
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 size-[34px] rounded-[10px] border-none bg-transparent text-text-primary cursor-pointer flex items-center justify-center hover:bg-bg-surface-hover hover:text-accent active:scale-95 transition-all duration-150">
        <X size={16} />
      </button>

      <div className="grid gap-3.5">
        <header className="grid gap-2.5 justify-items-center text-center">
          <div className="inline-flex items-center justify-center gap-3 flex-wrap">
            <div
              aria-hidden="true"
              className="size-[42px] rounded-[14px] inline-flex items-center justify-center shrink-0"
              style={{
                color: cssVar('acc'),
                background: cssAlpha('acc', '12'),
                border: `1px solid ${cssAlpha('acc', '24')}`,
              }}>
              <Settings size={18} />
            </div>
            <div className="text-text-title text-[32px] font-[920] leading-none tracking-tight">
              {t('svnConfigTitle')}
            </div>
          </div>
          <div className="max-w-[660px] text-text-secondary text-[13px] leading-[1.75]">
            {t('svnConfigSubtitle')}
          </div>
        </header>

        <section className="rounded-[24px] p-4 border border-border-default grid gap-3" style={{ background: `linear-gradient(180deg, var(--bg-surface-solid) 0%, var(--bg-base) 100%)`, boxShadow: `0 18px 40px -34px var(--border-strong)` }}>
          <div className="flex flex-wrap items-center justify-center gap-2.5 text-center">
            <span className="text-text-secondary text-[13px] font-bold">{t('svnConfigCurrentModeLabel')}</span>
            <span
              className="min-h-[30px] py-1 px-3.5 rounded-full inline-flex items-center justify-center text-[13px] font-[850]"
              style={{ background: cssAlpha('acc2', '14'), color: cssVar('acc2') }}>
              {loading && !status ? t('svnConfigLoading') : currentModeLabel}
            </span>
            {availabilityHint && (
              <span className="text-text-secondary text-[13px]">{availabilityHint}</span>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3">
            <InfoCard label={t('svnConfigExecutableLabel')} value={status?.executablePath ?? '—'} mono />
            <InfoCard label={t('svnConfigWorkbookCoverageLabel')} value={status ? `${workbookCoverage}/${status.workbookExtensions.length}` : '—'} />
            <InfoCard label={t('svnConfigGlobalCommandLabel')} value={status?.globalDiffCommand || t('svnConfigDefaultCommandFallback')} mono />
          </div>
        </section>

        {(error || (loading && !status)) && (
          <div
            className={`rounded-[18px] p-[13px_15px] border text-[13px] leading-relaxed font-bold text-center ${error ? 'text-diff-remove-text border-diff-remove-border' : 'text-text-primary border-border-default'}`}
            style={{ background: error ? cssAlpha('delBg', 'cc') : cssAlpha('acc2', '0f') }}>
            {error || t('svnConfigLoading')}
          </div>
        )}

        <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4">
          <ScopeCard scope="all-files" accent="--accent" title={t('svnConfigAllFilesTitle')} body={t('svnConfigAllFilesBody')} />
          <ScopeCard scope="text-only" accent="--accent-hover" title={t('svnConfigTextOnlyTitle')} body={t('svnConfigTextOnlyBody')} />
          <ScopeCard scope="workbook-only" accent="--acc2" title={t('svnConfigWorkbookOnlyTitle')} body={t('svnConfigWorkbookOnlyBody')} />
        </div>

        <section
          className="rounded-[18px] p-[14px_16px] border border-border-default text-text-primary text-[13px] leading-[1.8] text-center"
          style={{ background: cssAlpha('acc2', '0d') }}>
          {t('svnConfigSupportHint')}
        </section>

        <section
          className="rounded-[18px] p-[16px_18px] border flex items-center justify-between gap-4 flex-wrap"
          style={{
            background: `linear-gradient(180deg, ${cssAlpha('delBg', '22')} 0%, var(--bg-base) 100%)`,
            borderColor: cssAlpha('delBrd', '33'),
          }}>
          <div className="grid gap-1.5 flex-[1_1_320px] min-w-0">
            <div className="text-text-title text-[13px] font-[820]">{t('svnConfigRestoreDefaultTitle')}</div>
            <div className="text-text-secondary text-[13px] leading-[1.75]">{t('svnConfigRestoreDefaultBody')}</div>
            <div className="text-text-secondary text-[11px] leading-relaxed">{t('svnConfigRestoreDefaultHint')}</div>
          </div>
          <button
            type="button"
            onClick={onRestoreDefault}
            disabled={!canRestoreDefault || loading || isBusy}
            className={`
              h-[42px] min-w-[176px] px-[18px] rounded-xl border font-ui text-[13px] font-extrabold shrink-0
              transition-all duration-150
              ${!canRestoreDefault || loading || isBusy
                ? 'bg-bg-elevated text-text-secondary border-border-default cursor-not-allowed'
                : 'text-diff-remove-text border-diff-remove-border cursor-pointer hover:-translate-y-px hover:brightness-110 active:scale-[0.97]'
              }
            `}
            style={!canRestoreDefault || loading || isBusy ? undefined : { background: cssAlpha('delBg', 'cc') }}>
            {isRestoringDefault ? t('svnConfigRestoringDefault') : t('svnConfigRestoreDefaultAction')}
          </button>
        </section>

        <div className="flex justify-end gap-2.5">
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading || isBusy}
            className={`
              h-[38px] min-w-[98px] px-4 rounded-xl border border-border-strong bg-transparent
              font-ui text-[13px] font-bold transition-all duration-150
              ${loading || isBusy ? 'text-text-secondary cursor-not-allowed' : 'text-text-primary cursor-pointer hover:bg-bg-surface-hover hover:-translate-y-px active:scale-[0.97]'}
            `}>
            {t('svnConfigRefresh')}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="h-[38px] min-w-[98px] px-4 rounded-xl border-none bg-[var(--acc2)] text-[var(--btn-active-text)] font-ui text-[13px] font-extrabold cursor-pointer hover:-translate-y-px hover:brightness-[1.03] active:scale-[0.97] transition-all duration-150"
            style={{ boxShadow: `0 16px 30px -24px var(--acc2)` }}>
            {t('svnConfigClose')}
          </button>
        </div>
      </div>
    </DialogFrame>
  );
});

export default SvnConfigDialog;
