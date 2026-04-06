import { memo } from 'react';
import { X } from 'lucide-react';
import { useI18n } from '@/context/i18n';
import type { DiffSourceNoticeCode } from '@/types';
import { resolveDiffIndicatorCssPalette } from '@/utils/diff/diffIndicatorVisuals';
import Tooltip from '@/components/shared/Tooltip';

interface DiffSourceNoticeBarProps {
  code: DiffSourceNoticeCode;
  onClose: () => void;
}

const DiffSourceNoticeBar = memo(({ code, onClose }: DiffSourceNoticeBarProps) => {
  const { t } = useI18n();
  const neutralPalette = resolveDiffIndicatorCssPalette('neutral');

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
      className="grid grid-cols-[minmax(0,1fr)_28px] gap-3 items-center py-2.5 px-3.5 mx-2.5 rounded-[14px] relative overflow-hidden shrink-0"
      style={{
        border: `1px solid ${neutralPalette.border}`,
        background: `linear-gradient(180deg, ${neutralPalette.softBackground} 0%, var(--bg-base) 100%)`,
        boxShadow: `0 10px 20px -24px ${neutralPalette.shadow}`,
      }}>
      <div className="min-w-0 w-full text-center justify-self-center relative z-[1]">
        <div
          className="font-ui text-[13px] font-extrabold leading-tight text-center"
          style={{ color: neutralPalette.text }}>
          {title}
        </div>
        <div className="mt-1 text-text-primary font-ui text-[13px] leading-snug text-center">
          {body}
        </div>
      </div>

      <Tooltip content={t('sourceNoticeDismiss')} maxWidth={180}>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('sourceNoticeDismiss')}
          className="
            size-7 rounded-[10px] border border-border-default
            bg-bg-base/80 text-text-secondary
            cursor-pointer inline-flex items-center justify-center
            shrink-0 relative z-[1]
            hover:bg-bg-surface-hover hover:text-accent
            active:scale-95 transition-all duration-150
          ">
          <X size={14} />
        </button>
      </Tooltip>
    </div>
  );
});

export default DiffSourceNoticeBar;
