// src/components/SearchBar.tsx
import { memo, useState, useEffect, useRef } from 'react';
import { FONT_CODE, FONT_SIZE, FONT_UI } from '@/constants/typography';
import { useI18n } from '@/context/i18n';
import { useTheme } from '@/context/theme';
import Tooltip from '@/components/shared/Tooltip';

interface SearchBarProps {
  matchCount: number;
  activeIdx: number;
  onSearch: (q: string, regex: boolean, cs: boolean) => void;
  onNav: (dir: 1 | -1) => void;
  onClose: () => void;
}

const SearchBar = memo(({ matchCount, activeIdx, onSearch, onNav, onClose }: SearchBarProps) => {
  const T = useTheme();
  const { t } = useI18n();
  const [q,  setQ]  = useState('');
  const [rx, setRx] = useState(false);
  const [cs, setCs] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { onSearch(q, rx, cs); }, [q, rx, cs, onSearch]);

  const pill = (active: boolean, label: string, tooltip: string, onClick: () => void) => (
    <Tooltip content={tooltip}>
      <button onClick={onClick} aria-label={tooltip} style={{
        background: active ? `${T.acc}22` : 'transparent',
        border: `1px solid ${active ? `${T.acc}66` : T.border2}`,
        color: active ? T.acc : T.t1,
        padding: '0 8px', borderRadius: 6,
        cursor: 'pointer', fontSize: FONT_SIZE.sm, fontFamily: FONT_UI, height: 26,
      }}>
        {label}
      </button>
    </Tooltip>
  );

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px',
      background: T.bg1, borderBottom: `1px solid ${T.border}`, flexShrink: 0, fontFamily: FONT_UI,
    }}>
      <span style={{ color: T.t2, fontSize: FONT_SIZE.lg, lineHeight: 1 }}>⌕</span>
      <input
        ref={inputRef}
        value={q}
        onChange={e => setQ(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter')  onNav(e.shiftKey ? -1 : 1);
          if (e.key === 'Escape') onClose();
        }}
        placeholder={t('searchPlaceholder')}
        style={{
          flex: 1, maxWidth: 360,
          background: T.bg2, border: `1px solid ${T.border2}`,
          color: T.t0, padding: '0 10px', borderRadius: 6,
          fontSize: FONT_SIZE.md, outline: 'none', fontFamily: FONT_CODE, height: 28,
        }} />
      {pill(rx, '.*', t('searchRegexTitle'), () => setRx(v => !v))}
      {pill(cs, 'Aa', t('searchCaseSensitiveTitle'), () => setCs(v => !v))}
      <span style={{
        fontSize: FONT_SIZE.sm,
        color: q && matchCount === 0 ? T.delTx : T.t2,
        minWidth: 72, textAlign: 'right', fontFamily: FONT_CODE,
      }}>
        {q ? (matchCount > 0 ? `${activeIdx + 1} / ${matchCount}` : t('searchNoResults')) : ''}
      </span>
      <Tooltip content={t('searchPrevTitle')}>
        <button onClick={() => onNav(-1)} aria-label={t('searchPrevTitle')} style={{ background: 'transparent', border: `1px solid ${T.border2}`, color: T.t1, padding: '0 7px', borderRadius: 6, cursor: 'pointer', fontSize: FONT_SIZE.md, fontFamily: FONT_UI, height: 26 }}>↑</button>
      </Tooltip>
      <Tooltip content={t('searchNextTitle')}>
        <button onClick={() => onNav(1)} aria-label={t('searchNextTitle')} style={{ background: 'transparent', border: `1px solid ${T.border2}`, color: T.t1, padding: '0 7px', borderRadius: 6, cursor: 'pointer', fontSize: FONT_SIZE.md, fontFamily: FONT_UI, height: 26 }}>↓</button>
      </Tooltip>
      <Tooltip content={t('searchCloseTitle')}>
        <button onClick={onClose} aria-label={t('searchCloseTitle')} style={{ background: 'transparent', border: 'none', color: T.t1, cursor: 'pointer', fontSize: 16, padding: '0 4px', lineHeight: 1, fontFamily: FONT_UI }}>×</button>
      </Tooltip>
    </div>
  );
});

export default SearchBar;
