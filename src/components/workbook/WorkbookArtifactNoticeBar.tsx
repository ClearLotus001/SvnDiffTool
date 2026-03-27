import { memo } from 'react';
import { FONT_SIZE, FONT_UI } from '@/constants/typography';
import { useI18n } from '@/context/i18n';
import { useTheme } from '@/context/theme';
import Tooltip from '@/components/shared/Tooltip';

interface WorkbookArtifactNoticeBarProps {
  onClose: () => void;
}

const WorkbookArtifactNoticeBar = memo(({ onClose }: WorkbookArtifactNoticeBarProps) => {
  const T = useTheme();
  const { t } = useI18n();

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) 28px',
        gap: 12,
        alignItems: 'center',
        padding: '10px 14px',
        margin: '0 10px',
        borderRadius: 14,
        border: `1px solid ${T.acc2}35`,
        background: `linear-gradient(180deg, ${T.bg0} 0%, ${T.bg1} 100%)`,
        boxShadow: `0 12px 24px -24px ${T.acc2}55, inset 0 1px 0 ${T.bg0}`,
        position: 'relative',
        overflow: 'hidden',
        flexShrink: 0,
      }}>
      <div
        style={{
          minWidth: 0,
          width: '100%',
          textAlign: 'center',
          justifySelf: 'center',
          position: 'relative',
          zIndex: 1,
        }}>
        <div
          style={{
            color: T.acc2,
            fontFamily: FONT_UI,
            fontSize: FONT_SIZE.sm,
            fontWeight: 800,
            lineHeight: 1.35,
            textAlign: 'center',
            textShadow: `0 1px 0 ${T.bg0}`,
          }}>
          {t('artifactNoticeTitle')}
        </div>
        <div
          style={{
            marginTop: 4,
            color: T.t1,
            fontFamily: FONT_UI,
            fontSize: FONT_SIZE.sm,
            lineHeight: 1.45,
            textAlign: 'center',
          }}>
          {t('artifactNoticeBody')}
        </div>
      </div>

      <Tooltip content={t('artifactNoticeDismiss')} maxWidth={180}>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('artifactNoticeDismiss')}
          style={{
            width: 28,
            height: 28,
            borderRadius: 10,
            border: `1px solid ${T.border}`,
            background: `${T.bg0}cc`,
            color: T.t2,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16,
            lineHeight: 1,
            fontFamily: FONT_UI,
            flexShrink: 0,
            position: 'relative',
            zIndex: 1,
          }}>
          ×
        </button>
      </Tooltip>
    </div>
  );
});

export default WorkbookArtifactNoticeBar;
