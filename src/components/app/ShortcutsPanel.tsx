// src/components/ShortcutsPanel.tsx
import { memo } from 'react';
import { X } from 'lucide-react';
import { useI18n } from '@/context/i18n';
import DialogFrame from '@/components/shared/DialogFrame';
import type { AnimatedVisibilityState } from '@/hooks/ui/useAnimatedVisibility';

const ShortcutsPanel = memo(({
  animationState,
  onClose,
}: {
  animationState: AnimatedVisibilityState;
  onClose: () => void;
}) => {
  const { shortcuts, t } = useI18n();
  return (
    <DialogFrame
      animationState={animationState}
      titleId="shortcuts-dialog-title"
      onClose={onClose}
      className="w-[380px] max-w-[calc(100vw-32px)] rounded-[10px] p-[18px_24px] bg-bg-surface-solid border border-border-strong shadow-2xl font-ui">
      <div className="flex items-center justify-between mb-3.5">
        <h2 id="shortcuts-dialog-title" className="m-0 text-[15px] font-semibold text-text-title">{t('shortcutsTitle')}</h2>
        <button
          onClick={onClose}
          aria-label={t('commonClose')}
          className="size-7 rounded-lg bg-transparent border-none text-text-primary cursor-pointer flex items-center justify-center hover:bg-bg-surface-hover hover:text-accent active:scale-95 transition-all duration-150">
          <X size={16} />
        </button>
      </div>
      {shortcuts.map(([key, desc]) => (
        <div key={key} className="flex justify-between py-1.5 border-b border-border-default">
          <code className="bg-bg-elevated text-[var(--acc2)] py-px px-1.5 rounded text-[13px] font-code">
            {key}
          </code>
          <span className="text-[14px] text-text-primary font-ui">{desc}</span>
        </div>
      ))}
    </DialogFrame>
  );
});

export default ShortcutsPanel;
