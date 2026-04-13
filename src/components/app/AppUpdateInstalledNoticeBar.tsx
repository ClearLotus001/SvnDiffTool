import { memo } from 'react';
import { X } from 'lucide-react';
import { useI18n } from '@/context/i18n';
import { resolveDiffIndicatorCssPalette } from '@/utils/diff/diffIndicatorVisuals';
import Tooltip from '@/components/shared/Tooltip';

interface AppUpdateInstalledNoticeBarProps {
  version: string;
  onClose: () => void;
}

const AppUpdateInstalledNoticeBar = memo(({
  version,
  onClose,
}: AppUpdateInstalledNoticeBarProps) => {
  const { t } = useI18n();
  const successPalette = resolveDiffIndicatorCssPalette('add');

  return (
    <div
      role="status"
      aria-live="polite"
      className="grid grid-cols-[minmax(0,1fr)_28px] gap-3 items-center py-2.5 px-3.5 mx-2.5 rounded-[14px] relative overflow-hidden shrink-0"
      style={{
        border: `1px solid ${successPalette.border}`,
        background: `linear-gradient(180deg, ${successPalette.softBackground} 0%, var(--bg-surface-solid) 100%)`,
        boxShadow: `0 10px 20px -24px ${successPalette.shadow}`,
      }}>
      <div className="min-w-0 w-full text-center justify-self-center relative z-[1]">
        <div
          className="font-ui text-[13px] font-extrabold leading-tight text-center"
          style={{ color: successPalette.text }}>
          {t('updateInstalledNoticeTitle', { version })}
        </div>
      </div>

      <Tooltip content={t('updateInstalledNoticeDismiss')} maxWidth={180}>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('updateInstalledNoticeDismiss')}
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

export default AppUpdateInstalledNoticeBar;
