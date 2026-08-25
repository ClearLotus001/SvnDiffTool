import { useEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

import { useTheme } from '@/context/theme';

import type { AmbientAppearanceVariant } from './ambientAppearance';
import { resolveEmotionBallAppearance } from './appearanceResolver';
import type { EmotionCommand } from './emotionMachine';
import { createEmotionEngine } from './engine/EmotionEngine';
import type { EmotionEngineApi } from './engine/types';

interface EmotionBallBotProps {
    command: EmotionCommand;
    appearanceVariant?: AmbientAppearanceVariant | undefined;
    active: boolean;
    mode: 'orb' | 'panel';
    spinRibbonRevision?: number;
    className?: string;
}

const GAZE_ACTIVATION_DISTANCE = 14;
const GAZE_SAMPLE_WINDOW_MS = 600;
const GAZE_DEBOUNCE_MS = 140;
const GAZE_HOLD_MS = 1100;
const GAZE_MIN_DISTANCE_FROM_BOT = 80;

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

export function EmotionBallBot({
    command,
    appearanceVariant,
    active,
    mode,
    spinRibbonRevision = 0,
    className = '',
}: EmotionBallBotProps) {
    const containerRef = useRef<HTMLSpanElement>(null);
    const instanceRef = useRef<EmotionEngineApi | null>(null);
    const latestCommandRef = useRef(command);
    const latestActiveRef = useRef(active);
    const latestSpinRibbonRevisionRef = useRef(spinRibbonRevision);
    const reducedMotionRef = useRef(false);
    const appliedRevisionRef = useRef(-1);
    const appliedSpinRibbonRevisionRef = useRef(spinRibbonRevision);
    const appliedAppearanceKeyRef = useRef('');
    const themeKey = useTheme();
    const resolvedTheme = themeKey === 'light' ? 'light' : 'dark';
    const reducedMotion = useReducedMotion() === true;
    const [runtimeReady, setRuntimeReady] = useState(false);

    latestCommandRef.current = command;
    latestActiveRef.current = active;
    latestSpinRibbonRevisionRef.current = spinRibbonRevision;
    reducedMotionRef.current = reducedMotion;
    const appearance = useMemo(
        () => resolveEmotionBallAppearance(command.id, resolvedTheme, appearanceVariant),
        [appearanceVariant, command.id, resolvedTheme],
    );
    const latestAppearanceRef = useRef(appearance);
    latestAppearanceRef.current = appearance;

    useEffect(() => {
        let cancelled = false;
        const container = containerRef.current;
        if (!container) return;

        const latest = latestCommandRef.current;
        const initialAppearance = latestAppearanceRef.current;
        const instance = createEmotionEngine(container, {
            emotion: latest.id,
            appearance: {
                shape: initialAppearance.shape,
                tint: initialAppearance.tint,
                tintMix: initialAppearance.tintMix,
                eyeColor: initialAppearance.eyeColor,
                surfaceColors: initialAppearance.surfaceColors,
                surfaceFlow: initialAppearance.surfaceFlow,
                surfaceSeed: initialAppearance.surfaceSeed,
                duration: 0,
            },
            active: latestActiveRef.current && !reducedMotionRef.current,
        });
        if (cancelled) {
            instance.destroy();
            return;
        }
        if (reducedMotionRef.current) instance.renderStatic();
        instanceRef.current = instance;
        appliedRevisionRef.current = latest.revision;
        appliedSpinRibbonRevisionRef.current = latestSpinRibbonRevisionRef.current;
        appliedAppearanceKeyRef.current = initialAppearance.key;
        setRuntimeReady(true);

        return () => {
            cancelled = true;
            const instance = instanceRef.current;
            if (instance) {
                instance.destroy();
                instanceRef.current = null;
            }
        };
    }, [mode]);

    useEffect(() => {
        const instance = instanceRef.current;
        if (!instance || appliedSpinRibbonRevisionRef.current === spinRibbonRevision) return;
        appliedSpinRibbonRevisionRef.current = spinRibbonRevision;
        if (reducedMotion) instance.renderStatic();
        else instance.replaySpinRibbon();
    }, [reducedMotion, runtimeReady, spinRibbonRevision]);

    useEffect(() => {
        const instance = instanceRef.current;
        if (!instance) return;
        if (appliedRevisionRef.current !== command.revision) {
            instance.setEmotion(command.id);
            appliedRevisionRef.current = command.revision;
        }
        if (appliedAppearanceKeyRef.current !== appearance.key) {
            instance.setAppearance({
                shape: appearance.shape,
                tint: appearance.tint,
                tintMix: appearance.tintMix,
                eyeColor: appearance.eyeColor,
                surfaceColors: appearance.surfaceColors,
                surfaceFlow: appearance.surfaceFlow,
                surfaceSeed: appearance.surfaceSeed,
                duration: reducedMotion ? 0 : appearance.duration,
            });
            appliedAppearanceKeyRef.current = appearance.key;
        }
        if (reducedMotion) instance.renderStatic();
    }, [appearance, command, reducedMotion, runtimeReady]);

    useEffect(() => {
        const instance = instanceRef.current;
        if (!instance) return;
        const syncActive = () => {
            const shouldAnimate = active && !reducedMotion && !document.hidden;
            instance.setActive(shouldAnimate);
            if (!shouldAnimate) instance.renderStatic();
        };
        syncActive();
        document.addEventListener('visibilitychange', syncActive);
        return () => document.removeEventListener('visibilitychange', syncActive);
    }, [active, reducedMotion, runtimeReady]);

    useEffect(() => {
        if (!active || reducedMotion || !runtimeReady) return;
        const effectContainer = containerRef.current;
        if (effectContainer) effectContainer.dataset.gazeActive = 'false';
        let debounceTimer: number | null = null;
        let holdTimer: number | null = null;
        let sampleStartedAt = 0;
        let accumulatedDistance = 0;
        let lastPoint: { x: number; y: number } | null = null;
        let targetPoint = { x: 0, y: 0 };

        const applyGaze = () => {
            debounceTimer = null;
            const instance = instanceRef.current;
            const container = containerRef.current;
            if (!instance || !container) return;
            const bounds = container.getBoundingClientRect();
            const centerX = bounds.left + bounds.width / 2;
            const centerY = bounds.top + bounds.height / 2;
            const dx = targetPoint.x - centerX;
            const dy = targetPoint.y - centerY;
            const pointerDistance = Math.hypot(dx, dy);
            if (pointerDistance < GAZE_MIN_DISTANCE_FROM_BOT) return;
            const reach = Math.max(window.innerWidth, window.innerHeight) * 0.42;
            instance.setGaze(
                clamp(dx / reach, -1, 1),
                clamp(dy / reach, -1, 1),
            );
            container.dataset.gazeActive = 'true';
            accumulatedDistance = 0;
            sampleStartedAt = performance.now();
            if (holdTimer !== null) window.clearTimeout(holdTimer);
            holdTimer = window.setTimeout(() => {
                instanceRef.current?.clearGaze();
                if (containerRef.current) containerRef.current.dataset.gazeActive = 'false';
                holdTimer = null;
            }, GAZE_HOLD_MS);
        };
        const onPointerMove = (event: PointerEvent) => {
            if (event.pointerType === 'touch') return;
            const now = performance.now();
            if (!lastPoint) {
                accumulatedDistance = 0;
                sampleStartedAt = now;
            } else {
                const segment = Math.hypot(
                    event.clientX - lastPoint.x,
                    event.clientY - lastPoint.y,
                );
                if (now - sampleStartedAt > GAZE_SAMPLE_WINDOW_MS) {
                    accumulatedDistance = segment;
                    sampleStartedAt = now;
                } else {
                    accumulatedDistance += segment;
                }
            }
            lastPoint = { x: event.clientX, y: event.clientY };
            targetPoint = lastPoint;
            if (accumulatedDistance < GAZE_ACTIVATION_DISTANCE) return;
            if (debounceTimer !== null) window.clearTimeout(debounceTimer);
            debounceTimer = window.setTimeout(applyGaze, GAZE_DEBOUNCE_MS);
        };

        window.addEventListener('pointermove', onPointerMove, { passive: true });
        return () => {
            window.removeEventListener('pointermove', onPointerMove);
            if (debounceTimer !== null) window.clearTimeout(debounceTimer);
            if (holdTimer !== null) window.clearTimeout(holdTimer);
            instanceRef.current?.clearGaze();
            if (effectContainer) effectContainer.dataset.gazeActive = 'false';
        };
    }, [active, reducedMotion, runtimeReady]);

    return (
        <span
            ref={containerRef}
            className={`cl-ai-emotion-ball cl-ai-emotion-ball--${mode} ${className}`.trim()}
            data-emotion-id={command.id}
            data-ambient-shape={appearanceVariant?.shape}
            data-pigment-palette={appearanceVariant?.paletteId}
            data-spin-ribbon-revision={spinRibbonRevision}
            aria-hidden="true"
        >
        </span>
    );
}
