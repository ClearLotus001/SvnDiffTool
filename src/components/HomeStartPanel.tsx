import { memo } from 'react';
import { FONT_SIZE, FONT_UI } from '../constants/typography';
import { useI18n } from '../context/i18n';
import { useTheme } from '../context/theme';

interface HomeStartPanelProps {
  error: string;
  isElectron: boolean;
  onPickWorkingCopy: () => void;
  onOpenSvnConfig: () => void;
}

function HomeIcon({ kind }: { kind: 'spark' | 'file' | 'gear' }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: '0 0 16 16',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  if (kind === 'spark') {
    return (
      <svg {...common}>
        <path d="M8 2.2v2.1" />
        <path d="M8 11.7v2.1" />
        <path d="M2.2 8h2.1" />
        <path d="M11.7 8h2.1" />
        <path d="m3.9 3.9 1.5 1.5" />
        <path d="m10.6 10.6 1.5 1.5" />
        <path d="m10.6 5.4 1.5-1.5" />
        <path d="m3.9 12.1 1.5-1.5" />
        <circle cx="8" cy="8" r="2.4" />
      </svg>
    );
  }

  if (kind === 'gear') {
    return (
      <svg {...common}>
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

  return (
    <svg {...common}>
      <path d="M5 2.5h4l2.5 2.5v6A2 2 0 0 1 9.5 13h-4A2 2 0 0 1 3.5 11V4.5A2 2 0 0 1 5.5 2.5Z" />
      <path d="M9 2.5v3h3" />
      <path d="M5.5 9h5" />
    </svg>
  );
}

const HomeStartPanel = memo(({
  error,
  isElectron,
  onPickWorkingCopy,
  onOpenSvnConfig,
}: HomeStartPanelProps) => {
  const T = useTheme();
  const { t } = useI18n();

  const ActionCard = ({
    accent,
    icon,
    title,
    body,
    actionLabel,
    onClick,
    disabled = false,
  }: {
    accent: string;
    icon: 'file' | 'gear';
    title: string;
    body: string;
    actionLabel: string;
    onClick: () => void;
    disabled?: boolean;
  }) => (
    <div
      style={{
        position: 'relative',
        minWidth: 0,
        borderRadius: 22,
        padding: '22px 22px 20px',
        background: `linear-gradient(180deg, ${T.bg1} 0%, ${T.bg0} 100%)`,
        border: `1px solid ${T.border}`,
        boxShadow: `0 22px 46px -38px ${T.border2}`,
        display: 'grid',
        gap: 14,
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
          background: `linear-gradient(90deg, ${accent}88 0%, ${accent}22 55%, ${accent}00 100%)`,
        }}
      />

      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          minWidth: 0,
          width: '100%',
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
            color: accent,
            background: `${accent}12`,
            border: `1px solid ${accent}26`,
            flexShrink: 0,
          }}>
          <HomeIcon kind={icon} />
        </div>
        <div
          style={{
            color: T.t0,
            fontSize: 22,
            fontWeight: 850,
            letterSpacing: -0.35,
            lineHeight: 1.1,
            whiteSpace: 'nowrap',
            textAlign: 'center',
          }}>
          {title}
        </div>
      </div>

      <div
        style={{
          color: T.t2,
          fontSize: FONT_SIZE.sm,
          lineHeight: 1.75,
          minHeight: 28,
          textAlign: 'center',
        }}>
        {body}
      </div>

      <button
        className="svn-home-action-btn"
        type="button"
        disabled={disabled}
        onClick={onClick}
        style={{
          height: 44,
          borderRadius: 14,
          border: 'none',
          background: disabled
            ? T.bg3
            : `linear-gradient(135deg, ${accent} 0%, ${accent}dd 100%)`,
          color: disabled ? T.t2 : '#fff',
          fontFamily: FONT_UI,
          fontSize: FONT_SIZE.sm,
          fontWeight: 800,
          letterSpacing: 0.1,
          cursor: disabled ? 'not-allowed' : 'pointer',
          boxShadow: disabled ? 'none' : `0 18px 34px -26px ${accent}`,
          transition: 'transform 160ms ease, filter 160ms ease, box-shadow 160ms ease',
        }}>
        {actionLabel}
      </button>
    </div>
  );

  return (
    <div
      style={{
        flex: 1,
        width: '100%',
        minWidth: 0,
        minHeight: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 24px 40px',
        overflow: 'auto',
      }}>
      <div style={{ width: 'min(1040px, 100%)', display: 'grid', gap: 20 }}>
        <section
          style={{
            position: 'relative',
            overflow: 'hidden',
            borderRadius: 30,
            padding: '40px 36px 34px',
            background: `linear-gradient(180deg, ${T.bg1} 0%, ${T.bg0} 100%)`,
            border: `1px solid ${T.border}`,
            boxShadow: `0 42px 86px -58px ${T.border2}`,
            textAlign: 'center',
          }}>
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              background: `radial-gradient(circle at 20% 18%, ${T.acc2}12 0%, ${T.acc2}00 34%), radial-gradient(circle at 84% 78%, ${T.acc}10 0%, ${T.acc}00 30%)`,
            }}
          />
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 16,
              borderRadius: 22,
              border: `1px solid ${T.border}66`,
              pointerEvents: 'none',
            }}
          />

          <div style={{ position: 'relative', display: 'grid', gap: 14, justifyItems: 'center' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 14,
                maxWidth: '100%',
                minWidth: 0,
                flexWrap: 'nowrap',
              }}>
              <div
                aria-hidden="true"
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: 16,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: T.acc2,
                  background: `${T.acc2}12`,
                  border: `1px solid ${T.acc2}24`,
                  flexShrink: 0,
                }}>
                <HomeIcon kind="spark" />
              </div>
              <div
                style={{
                  color: T.t0,
                  fontSize: 'clamp(34px, 4vw, 40px)',
                  fontWeight: 920,
                  letterSpacing: -1.2,
                  lineHeight: 1.08,
                  whiteSpace: 'nowrap',
                }}>
                {t('homeStartHeroTitle')}
              </div>
            </div>

            <div
              style={{
                maxWidth: 860,
                color: T.t2,
                fontSize: 17,
                lineHeight: 1.8,
                textWrap: 'balance',
              }}>
              {t('homeStartHeroBody')}
            </div>
          </div>
        </section>

        {error && (
          <div
            style={{
              borderRadius: 18,
              padding: '14px 16px',
              background: `${T.delBg}cc`,
              border: `1px solid ${T.delBrd}`,
              color: T.delTx,
              fontSize: FONT_SIZE.sm,
              lineHeight: 1.7,
              fontWeight: 700,
            }}>
            {error}
          </div>
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
            gap: 18,
            alignItems: 'stretch',
          }}>
          <ActionCard
            accent={T.acc2}
            icon="file"
            title={t('homeStartPickTitle')}
            body={t('homeStartPickBody')}
            actionLabel={t('homeStartPickAction')}
            onClick={onPickWorkingCopy}
            disabled={!isElectron}
          />
          <ActionCard
            accent={T.acc}
            icon="gear"
            title={t('homeStartConfigTitle')}
            body={t('homeStartConfigBody')}
            actionLabel={t('homeStartConfigAction')}
            onClick={onOpenSvnConfig}
            disabled={!isElectron}
          />
        </div>

        <section
          style={{
            borderRadius: 20,
            padding: '18px 22px',
            background: `linear-gradient(180deg, ${T.bg1} 0%, ${T.bg0} 100%)`,
            border: `1px solid ${T.border}`,
            color: T.t1,
            fontSize: FONT_SIZE.sm,
            lineHeight: 1.8,
            textAlign: 'center',
            boxShadow: `0 22px 44px -40px ${T.border2}`,
          }}>
          {t('homeStartSupportHint')}
        </section>

        <style>{`
          .svn-home-action-btn:not(:disabled):hover {
            transform: translateY(-1px);
            filter: brightness(1.03) saturate(1.04);
            box-shadow: 0 0 0 3px ${T.acc2}14, 0 24px 44px -28px ${T.border2};
          }
        `}</style>
      </div>
    </div>
  );
});

export default HomeStartPanel;
