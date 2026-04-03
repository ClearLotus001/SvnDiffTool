import { memo } from 'react';
import { X } from 'lucide-react';
import { useI18n } from '@/context/i18n';
import Tooltip from '@/components/shared/Tooltip';

interface WorkbookArtifactNoticeBarProps {
  onClose: () => void;
}

const WorkbookArtifactNoticeBar = memo(({ onClose }: WorkbookArtifactNoticeBarProps) => {
  const { t } = useI18n();

  return (
    <div
      role="status"
      aria-live="polite"
      className="
        grid grid-cols-[minmax(0,1fr)_28px] gap-3 items-center
        py-2.5 px-3.5 mx-2.5 rounded-[14px]
        border border-[color-mix(in_srgb,var(--acc2)_21%,transparent)]
        bg-[linear-gradient(180deg,var(--bg-base)_0%,var(--bg-surface-solid)_100%)]
        relative overflow-hidden shrink-0
      ">
      <div className="min-w-0 w-full text-center justify-self-center relative z-[1]">
        <div className="text-[var(--acc2)] font-ui text-[13px] font-extrabold leading-tight text-center">
          {t('artifactNoticeTitle')}
        </div>
        <div className="mt-1 text-text-primary font-ui text-[13px] leading-snug text-center">
          {t('artifactNoticeBody')}
        </div>
      </div>

      <Tooltip content={t('artifactNoticeDismiss')} maxWidth={180}>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('artifactNoticeDismiss')}
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

export default WorkbookArtifactNoticeBar;
