import { memo } from 'react';
import { FONT_SIZE, FONT_UI } from '../constants/typography';
import { useI18n } from '../context/i18n';
import { useTheme } from '../context/theme';
import type { DiffSourceNoticeCode } from '../types';
import Tooltip from './Tooltip';

interface DiffSourceNoticeBarProps {
  code: DiffSourceNoticeCode;
  onClose: () => void;
}

const DiffSourceNoticeBar = memo(({ code, onClose }: DiffSourceNoticeBarProps) => {
  const T = useTheme();
  const { t } = useI18n();

  const title = code === 'unversioned-working-copy'
    ? t('sourceNoticeUnversionedTitle')
    : '';
  const body = code === 'unversioned-working-copy'
    ? t('sourceNoticeUnversionedBody')
    : '';

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
        border: `1px solid ${T.acc}35`,
        background: `linear-gradient(180deg, ${T.bg0} 0%, ${T.bg1} 100%)`,
        boxShadow: `0 12px 24px -24px ${T.acc}55, inset 0 1px 0 ${T.bg0}`,
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
            color: T.acc,
            fontFamily: FONT_UI,
            fontSize: FONT_SIZE.sm,
            fontWeight: 800,
            lineHeight: 1.35,
            textAlign: 'center',
            textShadow: `0 1px 0 ${T.bg0}`,
          }}>
          {title}
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
          {body}
        </div>
      </div>

      <Tooltip content={t('sourceNoticeDismiss')} maxWidth={180}>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('sourceNoticeDismiss')}
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

export default DiffSourceNoticeBar;
