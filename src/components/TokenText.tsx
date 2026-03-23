// src/components/TokenText.tsx
import { memo, useMemo } from 'react';
import type { Token } from '../types';
import { makeTokenColors } from '../theme';
import { useTheme } from '../context/theme';

interface TokenTextProps {
  tokens: Token[];
  charSpans?: { highlight: boolean; text: string }[] | null;
  hlBg?: string;
}

const TokenText = memo(({ tokens, charSpans, hlBg }: TokenTextProps) => {
  const T = useTheme();
  const colors = useMemo(() => makeTokenColors(T), [T]);

  if (charSpans && charSpans.length > 0) {
    return (
      <>
        {charSpans.map((s, i) =>
          s.highlight ? (
            <mark key={i} style={{ background: hlBg, borderRadius: 2, color: 'inherit', padding: '0 1px' }}>
              {s.text}
            </mark>
          ) : (
            <span key={i}>{s.text}</span>
          )
        )}
      </>
    );
  }

  return (
    <>
      {tokens.map((tok, i) => (
        <span key={i} style={{ color: colors[tok.type] ?? T.t0 }}>{tok.text}</span>
      ))}
    </>
  );
});

export default TokenText;
