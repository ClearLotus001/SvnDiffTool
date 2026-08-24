// src/components/GotoLine.tsx
import { memo, useState, useEffect, useRef, type CSSProperties } from 'react';
import { useI18n } from '@/context/i18n';
import DialogFrame from '@/components/shared/DialogFrame';
import type { AnimatedVisibilityState } from '@/hooks/ui/useAnimatedVisibility';

interface GotoLineProps {
  animationState: AnimatedVisibilityState;
  totalLines: number;
  onGoto: (lineNo: number) => void;
  onClose: () => void;
}

const GotoLine = memo(({
  animationState,
  totalLines,
  onGoto,
  onClose,
}: GotoLineProps) => {
  const { t } = useI18n();
  const [val, setVal] = useState('');
  const [triedSubmit, setTriedSubmit] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const maxLine = Math.max(0, totalLines);
  const hasLines = maxLine > 0;
  const parsedLine = val ? parseInt(val, 10) : NaN;
  const hasValue = val.trim().length > 0;
  const isValidLine = hasLines && Number.isFinite(parsedLine) && parsedLine >= 1 && parsedLine <= maxLine;

  const helperText = !hasLines
    ? t('gotoEmpty')
    : !hasValue
    ? t('gotoHint', { totalLines: maxLine })
    : !Number.isFinite(parsedLine) || parsedLine < 1
    ? t('gotoInvalid')
    : parsedLine > maxLine
    ? t('gotoOutOfRange', { totalLines: maxLine })
    : t('gotoPreview', { lineNo: parsedLine });

  const helperIsError = hasLines && (hasValue || triedSubmit) && !isValidLine;
  const helperIsSuccess = isValidLine;

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const go = () => {
    if (!isValidLine) {
      setTriedSubmit(true);
      return;
    }
    onGoto(parsedLine);
    onClose();
  };

  return (
    <DialogFrame
      animationState={animationState}
      titleId="goto-line-dialog-title"
      descriptionId="goto-line-dialog-description"
      onClose={onClose}
      className="goto-line-dialog w-[340px] max-w-[calc(100vw-32px)] rounded-[14px] p-[18px] bg-bg-surface-solid border border-border-strong shadow-2xl font-ui">
      <div id="goto-line-dialog-title" className="text-[15px] text-text-title mb-1.5 font-bold">
        {t('gotoTitle')}
      </div>
      <div
        id="goto-line-dialog-description"
        className={`
          text-[13px] mb-3 min-h-4
          ${helperIsError ? 'text-diff-remove-text' : helperIsSuccess ? 'text-[var(--acc2)]' : 'text-text-secondary'}
        `}>
        {helperText}
      </div>
      <input
        ref={inputRef}
        data-dialog-initial-focus
        value={val}
        onChange={e => {
          setVal(e.target.value.replace(/[^\d]/g, ''));
          if (triedSubmit) setTriedSubmit(false);
        }}
        onKeyDown={e => {
          if (e.key === 'Enter') go();
        }}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        disabled={!hasLines}
        placeholder={hasLines ? t('gotoInputPlaceholder') : '—'}
        className={`
          w-full h-[38px] px-3 rounded-lg
          border text-text-title text-[15px] font-code
          outline-none transition-colors duration-150
          ${hasLines ? 'bg-bg-surface-hover' : 'bg-bg-surface-solid opacity-65'}
          ${isValidLine || !hasValue ? 'border-border-strong' : 'border-diff-remove-border'}
          focus:border-accent
        `}
      />
      <div className="flex gap-2 mt-3 justify-end">
        <button
          onClick={onClose}
          className="
            h-[34px] px-4 rounded-lg
            border border-border-strong bg-transparent
            text-text-primary text-[14px] font-ui
            cursor-pointer
            hover:bg-bg-surface-hover hover:border-accent
            active:scale-[0.97] transition-all duration-150
          ">
          {t('gotoCancel')}
        </button>
        <button
          type="button"
          data-testid="goto-line-submit"
          onClick={go}
          disabled={!isValidLine}
          style={{
            '--liquid-control-fill': 'var(--btn-active-bg)',
            '--liquid-control-fill-hover': 'var(--btn-active-bg)',
            '--liquid-control-fill-pressed': 'var(--btn-active-bg)',
          } as CSSProperties}
          className={`
            goto-line-dialog__submit
            h-[34px] px-4 min-w-[76px]
            text-[14px] font-ui font-bold
            transition-all duration-150
            ${isValidLine
              ? 'bg-[var(--acc2)] text-[var(--btn-active-text)] cursor-pointer hover:-translate-y-px hover:brightness-105 active:scale-[0.97] shadow-[0_16px_30px_-24px_var(--acc2)]'
              : 'bg-bg-elevated text-text-secondary cursor-not-allowed'
            }
          `}>
          <span className="relative z-[1]">{t('gotoGo')}</span>
        </button>
      </div>
    </DialogFrame>
  );
});

export default GotoLine;
