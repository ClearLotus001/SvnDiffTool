import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, MouseEvent as ReactMouseEvent, RefObject } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

import { EmotionBallBot } from './emotion-ball/EmotionBallBot';
import type { AmbientAppearanceVariant } from './emotion-ball/ambientAppearance';
import { EMOTION_BALL_LAYOUT_ID, EMOTION_BALL_SIZE } from './emotion-ball/emotionBallLayout';
import type { EmotionCommand } from './emotion-ball/emotionMachine';
import { useDraggableOrb } from './useDraggableOrb';

interface GlobalBotOrbButtonProps {
  command: EmotionCommand;
  appearanceVariant?: AmbientAppearanceVariant | undefined;
  label: string;
  expanded?: boolean;
  onActivate: () => void;
  onHoverChange: (active: boolean) => void;
  anchorRef: RefObject<HTMLDivElement | null>;
}

const AURA_COLOR_FAMILIES = [
  ['#002FA7', '#120A8F', '#007BA7', '#159E9B', '#AFCFD3'],
  ['#009B77', '#0BDA51', '#40826D', '#73A48B'],
  ['#E34234', '#ED872D', '#960018', '#B86237', '#786E67'],
  ['#FDEE00', '#E0115F', '#630330', '#9569C4'],
] as const;

const AURA_SHIFT_MS = 5200;
const POINTER_SINGLE_CLICK_DELAY_MS = 300;

function randomAuraPalette(): [string, string, string, string] {
  const selected = AURA_COLOR_FAMILIES.map((family) => (
    family[Math.floor(Math.random() * family.length)]
  ));
  for (let index = selected.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [selected[index], selected[swap]] = [selected[swap], selected[index]];
  }
  return selected as [string, string, string, string];
}

function nextAuraPalette(current: readonly string[]): [string, string, string, string] {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const next = randomAuraPalette();
    if (!next.every((color, index) => color === current[index])) return next;
  }
  return [current[1], current[2], current[3], current[0]] as [string, string, string, string];
}

export default function GlobalBotOrbButton({
  command,
  appearanceVariant,
  label,
  expanded = false,
  onActivate,
  onHoverChange,
  anchorRef,
}: GlobalBotOrbButtonProps) {
  const reducedMotion = useReducedMotion();
  const [auraPalette, setAuraPalette] = useState(randomAuraPalette);
  const [pointerOpenPending, setPointerOpenPending] = useState(false);
  const [spinRibbonRevision, setSpinRibbonRevision] = useState(0);
  const pendingOpenTimerRef = useRef<number | null>(null);

  const clearPendingOpen = useCallback(() => {
    if (pendingOpenTimerRef.current !== null) {
      window.clearTimeout(pendingOpenTimerRef.current);
      pendingOpenTimerRef.current = null;
    }
    setPointerOpenPending(false);
  }, []);

  const handleActivate = useCallback((event: ReactMouseEvent<HTMLButtonElement>) => {
    clearPendingOpen();
    if (event.detail === 0) {
      onActivate();
      return;
    }
    if (event.detail > 1) return;
    setPointerOpenPending(true);
    pendingOpenTimerRef.current = window.setTimeout(() => {
      pendingOpenTimerRef.current = null;
      setPointerOpenPending(false);
      onActivate();
    }, POINTER_SINGLE_CLICK_DELAY_MS);
  }, [clearPendingOpen, onActivate]);

  const handleDoubleClick = useCallback((event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    clearPendingOpen();
    setSpinRibbonRevision((revision) => revision + 1);
  }, [clearPendingOpen]);

  const dragProps = useDraggableOrb({
    anchorRef,
    size: EMOTION_BALL_SIZE,
    onActivate: handleActivate,
    onPointerStart: clearPendingOpen,
  });

  useEffect(() => {
    if (expanded) clearPendingOpen();
  }, [clearPendingOpen, expanded]);

  useEffect(() => () => {
    if (pendingOpenTimerRef.current !== null) {
      window.clearTimeout(pendingOpenTimerRef.current);
      pendingOpenTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (expanded || reducedMotion) return;
    const timer = window.setInterval(
      () => setAuraPalette((current) => nextAuraPalette(current)),
      AURA_SHIFT_MS,
    );
    return () => window.clearInterval(timer);
  }, [expanded, reducedMotion]);

  const auraStyle = {
    '--cl-ai-glow-a': auraPalette[0],
    '--cl-ai-glow-b': auraPalette[1],
    '--cl-ai-glow-c': auraPalette[2],
    '--cl-ai-glow-d': auraPalette[3],
  } as CSSProperties;

  return (
    <button
      type="button"
      className="cl-ai-orb"
      data-emotion-id={command.id}
      data-open={expanded ? 'true' : 'false'}
      data-pointer-open-pending={pointerOpenPending ? 'true' : 'false'}
      data-spin-ribbon-revision={spinRibbonRevision}
      data-ambient-shape={appearanceVariant?.shape}
      data-pigment-palette={appearanceVariant?.paletteId}
      style={{ width: EMOTION_BALL_SIZE, height: EMOTION_BALL_SIZE }}
      aria-label={label}
      aria-expanded={expanded}
      {...dragProps}
      onDoubleClick={handleDoubleClick}
      onPointerEnter={() => onHoverChange(true)}
      onPointerLeave={() => onHoverChange(false)}
      onFocus={() => onHoverChange(true)}
      onBlur={() => onHoverChange(false)}>
      {!expanded && <span className="cl-ai-orb__glow" style={auraStyle} aria-hidden="true" />}
      <span className="cl-ai-orb__bot" aria-hidden="true">
        {!expanded && (
          <motion.span
            className="cl-ai-orb__shared-bot"
            layoutId={EMOTION_BALL_LAYOUT_ID}
            transition={{ duration: reducedMotion ? 0 : 0.42, ease: [0.2, 0.8, 0.2, 1] }}>
            <EmotionBallBot
              command={command}
              appearanceVariant={appearanceVariant}
              active
              mode="orb"
              spinRibbonRevision={spinRibbonRevision}
            />
          </motion.span>
        )}
      </span>
      <span className="cl-visually-hidden">{label}</span>
    </button>
  );
}
