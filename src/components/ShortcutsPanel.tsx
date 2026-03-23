// src/components/ShortcutsPanel.tsx
import { memo } from 'react';
import { FONT_CODE, FONT_SIZE, FONT_UI } from '../constants/typography';
import { useI18n } from '../context/i18n';
import { useTheme } from '../context/theme';

const ShortcutsPanel = memo(({ onClose }: { onClose: () => void }) => {
  const T = useTheme();
  const { shortcuts, t } = useI18n();
  return (
    <div style={{
      position: 'fixed', top: '50%', left: '50%',
      transform: 'translate(-50%,-50%)',
      zIndex: 100,
      background: T.bg1, border: `1px solid ${T.border2}`,
      borderRadius: 10, padding: '18px 24px',
      boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      width: 380,
      fontFamily: FONT_UI,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <span style={{ fontSize: FONT_SIZE.lg, fontWeight: 600, color: T.t0, fontFamily: FONT_UI }}>{t('shortcutsTitle')}</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: T.t1, cursor: 'pointer', fontSize: 18, fontFamily: FONT_UI }}>×</button>
      </div>
      {shortcuts.map(([key, desc]) => (
        <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: `1px solid ${T.border}` }}>
          <code style={{ background: T.bg3, color: T.acc2, padding: '1px 6px', borderRadius: 4, fontSize: FONT_SIZE.sm, fontFamily: FONT_CODE }}>
            {key}
          </code>
          <span style={{ fontSize: FONT_SIZE.md, color: T.t1, fontFamily: FONT_UI }}>{desc}</span>
        </div>
      ))}
    </div>
  );
});

export default ShortcutsPanel;
