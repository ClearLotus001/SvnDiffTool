// src/components/GotoLine.tsx
import { memo, useState, useEffect, useRef } from 'react';
import { FONT_CODE, FONT_SIZE, FONT_UI } from '@/constants/typography';
import { useI18n } from '@/context/i18n';
import { useTheme } from '@/context/theme';

interface GotoLineProps {
  totalLines: number;
  onGoto: (lineNo: number) => void;
  onClose: () => void;
}

const GotoLine = memo(({ totalLines, onGoto, onClose }: GotoLineProps) => {
  const T = useTheme();
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

  const helperColor = !hasLines
    ? T.t2
    : isValidLine
    ? T.acc2
    : hasValue || triedSubmit
    ? T.delTx
    : T.t2;

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
    <div style={{
      position: 'fixed', top: '50%', left: '50%',
      transform: 'translate(-50%,-50%)',
      zIndex: 100,
      background: T.bg1, border: `1px solid ${T.border2}`,
      borderRadius: 14, padding: 18,
      boxShadow: '0 18px 52px rgba(0,0,0,0.32)',
      width: 340,
      fontFamily: FONT_UI,
    }}>
      <div style={{ fontSize: FONT_SIZE.lg, color: T.t0, marginBottom: 6, fontFamily: FONT_UI, fontWeight: 700 }}>
        {t('gotoTitle')}
      </div>
      <div style={{
        fontSize: FONT_SIZE.sm,
        color: helperColor,
        marginBottom: 12,
        minHeight: 16,
        fontFamily: FONT_UI,
      }}>
        {helperText}
      </div>
      <input
        ref={inputRef}
        value={val}
        onChange={e => {
          setVal(e.target.value.replace(/[^\d]/g, ''));
          if (triedSubmit) setTriedSubmit(false);
        }}
        onKeyDown={e => {
          if (e.key === 'Enter') go();
          if (e.key === 'Escape') onClose();
        }}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        disabled={!hasLines}
        placeholder={hasLines ? t('gotoInputPlaceholder') : '—'}
        style={{
          width: '100%',
          background: hasLines ? T.bg2 : T.bg1,
          border: `1px solid ${isValidLine || !hasValue ? T.border2 : T.delBrd}`,
          color: T.t0, padding: '0 12px',
          borderRadius: 8, fontSize: FONT_SIZE.lg,
          outline: 'none', fontFamily: FONT_CODE,
          height: 38,
          lineHeight: '38px',
          boxSizing: 'border-box',
          opacity: hasLines ? 1 : 0.65,
        }} />
      <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
        <button onClick={onClose} style={{ background: 'transparent', border: `1px solid ${T.border2}`, color: T.t1, padding: '0 16px', borderRadius: 8, cursor: 'pointer', fontSize: FONT_SIZE.md, fontFamily: FONT_UI, height: 34 }}>{t('gotoCancel')}</button>
        <button
          onClick={go}
          disabled={!isValidLine}
          style={{
            background: isValidLine ? T.acc2 : T.bg3,
            border: 'none',
            color: isValidLine ? '#fff' : T.t2,
            padding: '0 16px',
            borderRadius: 8,
            cursor: isValidLine ? 'pointer' : 'not-allowed',
            fontSize: FONT_SIZE.md,
            fontFamily: FONT_UI,
            height: 34,
            minWidth: 76,
          }}>
          {t('gotoGo')}
        </button>
      </div>
    </div>
  );
});

export default GotoLine;
