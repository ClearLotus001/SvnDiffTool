import { memo } from 'react';
import { ArrowRight, FileText, Settings, Sparkles } from 'lucide-react';
import { useI18n } from '@/context/i18n';
import { cssAlpha, cssAlphaRaw } from '@/theme/cssUtils';

interface HomeStartPanelProps {
  error: string;
  isElectron: boolean;
  onPickWorkingCopy: () => void;
  onOpenSvnConfig: () => void;
}

function HomeIcon({ kind }: { kind: 'spark' | 'file' | 'gear' }) {
  if (kind === 'spark') return <Sparkles size={18} />;
  if (kind === 'gear') return <Settings size={18} />;
  return <FileText size={18} />;
}

const HomeStartPanel = memo(({
  error, isElectron, onPickWorkingCopy, onOpenSvnConfig,
}: HomeStartPanelProps) => {
  const { t } = useI18n();

  const ActionCard = ({
    accent, icon, title, body, actionLabel, onClick, disabled = false,
  }: {
    accent: string; icon: 'file' | 'gear'; title: string; body: string;
    actionLabel: string; onClick: () => void; disabled?: boolean;
  }) => (
    <div
      className="relative min-w-0 rounded-[24px] p-[22px_22px_20px] border border-border-default flex flex-col gap-4 overflow-hidden"
      style={{
        background: `linear-gradient(180deg, var(--bg-surface-solid) 0%, var(--bg-base) 100%)`,
        boxShadow: `0 26px 54px -42px var(--border-strong)`,
      }}>
      <div
        aria-hidden="true"
        className="absolute top-0 left-[24px] right-[24px] h-px"
        style={{ background: `linear-gradient(90deg, ${cssAlphaRaw(accent, '88')} 0%, ${cssAlphaRaw(accent, '22')} 55%, ${cssAlphaRaw(accent, '00')} 100%)` }}
      />
      <div
        aria-hidden="true"
        className="absolute -top-10 -right-10 size-28 rounded-full blur-2xl"
        style={{ background: cssAlphaRaw(accent, '12') }}
      />
      <div className="inline-flex items-center gap-3 min-w-0 w-full">
        <div
          aria-hidden="true"
          className="size-[42px] rounded-[14px] inline-flex items-center justify-center shrink-0"
          style={{
            color: `var(${accent})`,
            background: cssAlphaRaw(accent, '12'),
            border: `1px solid ${cssAlphaRaw(accent, '26')}`,
          }}>
          <HomeIcon kind={icon} />
        </div>
        <div className="text-text-title text-[21px] font-[850] tracking-tight leading-tight">
          {title}
        </div>
      </div>
      <div className="text-text-secondary text-[13px] leading-[1.75] min-h-10 flex-1 break-words">
        {body}
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className={`
          h-11 rounded-[14px] border-none font-ui text-[13px] font-extrabold tracking-wide
          transition-all duration-150 w-full inline-flex items-center justify-center gap-2
          ${disabled
            ? 'bg-bg-elevated text-text-secondary cursor-not-allowed shadow-none'
            : 'text-[var(--btn-active-text)] cursor-pointer hover:-translate-y-px hover:brightness-[1.03] hover:saturate-[1.04] active:scale-[0.97]'
          }
        `}
        style={disabled ? undefined : {
          background: `linear-gradient(135deg, var(${accent}) 0%, ${cssAlphaRaw(accent, 'dd')} 100%)`,
          boxShadow: `0 18px 34px -26px var(${accent})`,
        }}>
        {actionLabel}
        {!disabled && <ArrowRight size={14} />}
      </button>
    </div>
  );

  const HintRow = ({
    accent, title, body,
  }: {
    accent: string;
    title: string;
    body: string;
  }) => (
    <div className="grid grid-cols-[10px_1fr] gap-3 items-start min-w-0">
      <span
        aria-hidden="true"
        className="mt-[6px] size-[10px] rounded-full"
        style={{ background: cssAlphaRaw(accent, '88') }}
      />
      <div className="grid gap-1 min-w-0">
        <div className="text-text-title text-[13px] font-bold leading-snug">{title}</div>
        <div className="text-text-secondary text-[12px] leading-[1.65]">{body}</div>
      </div>
    </div>
  );

  return (
    <div className="flex-1 w-full min-w-0 min-h-0 flex items-center justify-center p-[28px_24px_40px] overflow-auto">
      <div className="w-[min(1100px,100%)] grid gap-5">
        {error && (
          <div
            className="rounded-[18px] p-[14px_16px] border border-diff-remove-border text-diff-remove-text text-[13px] leading-relaxed font-bold"
            style={{ background: cssAlpha('delBg', 'cc') }}>
            {error}
          </div>
        )}

        {!isElectron && (
          <div
            className="rounded-[18px] p-[14px_16px] border border-border-default text-text-secondary text-[13px] leading-relaxed font-semibold"
            style={{ background: cssAlpha('bg1', 'd9') }}>
            {t('homeStartDesktopOnly')}
          </div>
        )}

        <div className="grid xl:grid-cols-[minmax(0,1.18fr)_minmax(360px,0.82fr)] gap-5 items-stretch">
          <section
            className="relative overflow-hidden rounded-[28px] border border-border-default p-[24px_24px_22px] grid gap-5"
            style={{
              background: `linear-gradient(180deg, ${cssAlpha('bg1', 'f4')} 0%, var(--bg-surface-solid) 56%, var(--bg-base) 100%)`,
              boxShadow: `0 30px 60px -48px var(--border-strong)`,
            }}>
            <div
              aria-hidden="true"
              className="absolute inset-x-0 top-0 h-px"
              style={{ background: `linear-gradient(90deg, ${cssAlphaRaw('--acc2', '88')} 0%, ${cssAlphaRaw('--accent', '44')} 55%, transparent 100%)` }}
            />
            <div
              aria-hidden="true"
              className="absolute -top-16 right-[-10%] size-56 rounded-full blur-3xl"
              style={{ background: cssAlphaRaw('--acc2', '10') }}
            />
            <div
              aria-hidden="true"
              className="absolute bottom-[-18%] left-[-8%] size-48 rounded-full blur-3xl"
              style={{ background: cssAlphaRaw('--accent', '10') }}
            />

            <div className="inline-flex items-center gap-2 w-fit h-8 px-3 rounded-full border border-border-default bg-bg-surface-hover text-[11px] font-bold uppercase tracking-[0.18em] text-text-secondary">
              <Sparkles size={14} style={{ color: 'var(--acc2)' }} />
              {t('homeStartWorkspaceLabel')}
            </div>

            <div className="grid gap-3 max-w-[660px]">
              <h1 className="text-text-title text-[34px] leading-[1.1] font-[900] tracking-[-0.03em]">
                {t('homeStartHeroTitle')}
              </h1>
              <p className="text-text-secondary text-[14px] leading-[1.8] max-w-[54ch]">
                {t('homeStartHeroBody')}
              </p>
            </div>

            <div className="grid gap-4 pt-1">
              <HintRow
                accent="--acc2"
                title={t('homeStartCapabilityTitle')}
                body={t('homeStartCapabilityBody')}
              />
              <HintRow
                accent="--accent"
                title={t('homeStartLaunchModeTitle')}
                body={t('homeStartLaunchModeBody')}
              />
            </div>
          </section>

          <div className="grid gap-4 auto-rows-fr">
            <ActionCard
              accent="--acc2"
              icon="file"
              title={t('homeStartPickTitle')}
              body={t('homeStartPickBody')}
              actionLabel={t('homeStartPickAction')}
              onClick={onPickWorkingCopy}
              disabled={!isElectron}
            />
            <ActionCard
              accent="--accent"
              icon="gear"
              title={t('homeStartConfigTitle')}
              body={t('homeStartConfigBody')}
              actionLabel={t('homeStartConfigAction')}
              onClick={onOpenSvnConfig}
              disabled={!isElectron}
            />
          </div>
        </div>
      </div>
    </div>
  );
});

export default HomeStartPanel;
