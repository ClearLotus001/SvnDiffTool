import { useCallback, useEffect, useReducer, useRef, useState } from 'react';

type AiAssistantErrorCode = string;

import {
    HOVER_VARIATION_EMOTION_IDS,
    IDLE_VARIATION_EMOTION_IDS,
    type EmotionId,
    type SemanticEmotionId,
} from './emotionIds';
import {
    createAmbientAppearanceBagState,
    takeAmbientAppearanceVariant,
    type AmbientAppearanceBagState,
    type AmbientAppearanceVariant,
} from './ambientAppearance';
import { resolveEmotionBallShape } from './appearanceResolver';
import type { EngineShape } from './engine/types';
import {
    emotionReducer,
    INITIAL_EMOTION_STATE,
    isAmbientAppearanceState,
    type EmotionCommand,
    type EmotionEvent,
} from './emotionMachine';

const RESTRICTED_ERRORS = new Set<AiAssistantErrorCode>([
    'content_filtered',
    'guest_quota',
    'user_quota',
    'feature_disabled',
    'login_required',
]);

const SHAPES: readonly EngineShape[] = ['bloom', 'prism', 'petal'];

function refillShapeBag(bag: EngineShape[]): void {
    const next = [...SHAPES];
    for (let index = next.length - 1; index > 0; index -= 1) {
        const swap = Math.floor(Math.random() * (index + 1));
        const current = next[index]!;
        next[index] = next[swap]!;
        next[swap] = current;
    }
    bag.push(...next);
}

function takeBalancedVariation<T extends EmotionId>(
    pool: readonly [T, ...T[]],
    shapeBag: EngineShape[],
    currentId: EmotionId,
): T {
    if (!shapeBag.length) refillShapeBag(shapeBag);
    const shape = shapeBag.shift() ?? 'bloom';
    const shapeCandidates = pool.filter((emotionId) => (
        resolveEmotionBallShape(emotionId) === shape
    ));
    const scopedPool = shapeCandidates.length ? shapeCandidates : pool;
    const candidates = scopedPool.filter((emotionId) => emotionId !== currentId);
    const source = candidates.length ? candidates : scopedPool;
    return source[Math.floor(Math.random() * source.length)] ?? pool[0];
}

export interface EmotionController {
    command: EmotionCommand;
    ambientAppearanceVariant: AmbientAppearanceVariant;
    ambientAppearanceActive: boolean;
    setHovered: (active: boolean) => void;
    setComposerFocused: (active: boolean) => void;
    loading: () => void;
    recall: () => void;
    submit: () => void;
    replying: () => void;
    semantic: (emotionId: SemanticEmotionId) => void;
    done: () => void;
    fail: (code: AiAssistantErrorCode) => void;
    stop: () => void;
    rest: () => void;
}

export function useEmotionController(enabled: boolean): EmotionController {
    const [state, dispatch] = useReducer(emotionReducer, INITIAL_EMOTION_STATE);
    const currentEmotionRef = useRef<EmotionId>(state.currentId);
    const hoveredRef = useRef(state.hovered);
    const hoverShapeBagRef = useRef<EngineShape[]>([]);
    const ambientBagStateRef = useRef<AmbientAppearanceBagState | null>(null);
    const hoverAppearanceBagStateRef = useRef<AmbientAppearanceBagState | null>(null);
    if (!ambientBagStateRef.current) {
        ambientBagStateRef.current = createAmbientAppearanceBagState();
    }
    if (!hoverAppearanceBagStateRef.current) {
        hoverAppearanceBagStateRef.current = createAmbientAppearanceBagState();
    }
    const [ambientAppearanceVariant, setAmbientAppearanceVariant] = useState(() => (
        takeAmbientAppearanceVariant(ambientBagStateRef.current!)
    ));
    const [hoverAppearanceVariant, setHoverAppearanceVariant] = useState<
        AmbientAppearanceVariant | null
    >(null);

    currentEmotionRef.current = state.currentId;
    hoveredRef.current = state.hovered;

    const send = useCallback((event: EmotionEvent) => dispatch(event), []);
    const takeIdleVariation = useCallback(() => {
        const candidates = IDLE_VARIATION_EMOTION_IDS.filter((emotionId) => (
            emotionId !== currentEmotionRef.current
        ));
        const source = candidates.length ? candidates : IDLE_VARIATION_EMOTION_IDS;
        return source[Math.floor(Math.random() * source.length)]
            ?? IDLE_VARIATION_EMOTION_IDS[0];
    }, []);
    const takeHoverVariation = useCallback(() => takeBalancedVariation(
        HOVER_VARIATION_EMOTION_IDS,
        hoverShapeBagRef.current,
        currentEmotionRef.current,
    ), []);
    const advanceIdleVariation = useCallback(() => {
        const bagState = ambientBagStateRef.current;
        if (!bagState) return;
        setAmbientAppearanceVariant(takeAmbientAppearanceVariant(bagState));
        send({
            type: 'idle_variation',
            emotionId: takeIdleVariation(),
        });
    }, [send, takeIdleVariation]);
    const advanceHoverAppearance = useCallback((
        avoid?: Pick<AmbientAppearanceVariant, 'shape' | 'paletteId'>,
    ) => {
        const bagState = hoverAppearanceBagStateRef.current;
        if (!bagState) return;
        setHoverAppearanceVariant(takeAmbientAppearanceVariant(
            bagState,
            Math.random,
            avoid,
        ));
    }, []);

    useEffect(() => {
        if (!enabled) send({ type: 'reset' });
    }, [enabled, send]);

    useEffect(() => {
        if (!enabled) return;
        let timeout: number | undefined;

        switch (state.currentId) {
            case '05':
                if (state.phase === 'boot') {
                    timeout = window.setTimeout(() => send({ type: 'rest' }), 1400);
                }
                break;
            case '31':
                if (state.phase === 'working') {
                    timeout = window.setTimeout(() => send({ type: 'thinking' }), 520);
                }
                break;
            case '33':
                if (state.phase === 'settling') {
                    timeout = window.setTimeout(() => send({ type: 'reveal_semantic' }), 1200);
                }
                break;
            case '41':
            case '01':
            case '07':
                if (state.phase === 'settling') {
                    timeout = window.setTimeout(() => send({ type: 'rest' }), 1600);
                }
                break;
            default:
                if (state.phase === 'settling' && Number(state.currentId) >= 10 && Number(state.currentId) <= 21) {
                    timeout = window.setTimeout(() => send({ type: 'rest' }), 4200);
                }
                break;
        }

        return () => {
            if (timeout !== undefined) window.clearTimeout(timeout);
        };
    }, [enabled, send, state.currentId, state.phase, state.revision]);

    useEffect(() => {
        if (!enabled) return;
        let timers: number[] = [];

        const clearTimers = () => {
            timers.forEach((timer) => window.clearTimeout(timer));
            timers = [];
        };
        const schedule = () => {
            clearTimers();
            timers = [
                window.setTimeout(() => send({ type: 'idle_stage', emotionId: '04' }), 60_000),
                window.setTimeout(() => send({ type: 'idle_stage', emotionId: '06' }), 180_000),
                window.setTimeout(() => send({ type: 'idle_stage', emotionId: '00' }), 300_000),
            ];
        };
        const onActivity = () => {
            send({ type: 'activity' });
            schedule();
        };

        schedule();
        window.addEventListener('pointerdown', onActivity, { passive: true });
        window.addEventListener('keydown', onActivity);
        return () => {
            clearTimers();
            window.removeEventListener('pointerdown', onActivity);
            window.removeEventListener('keydown', onActivity);
        };
    }, [enabled, send, state.phase]);

    useEffect(() => {
        if (
            !enabled
            || state.phase !== 'resting'
            || state.hovered
            || state.composerFocused
            || state.idleStageActive
        ) return;

        const delay = 3200 + Math.random() * 3200;
        const timer = window.setTimeout(advanceIdleVariation, delay);
        return () => window.clearTimeout(timer);
    }, [
        advanceIdleVariation,
        enabled,
        state.composerFocused,
        state.currentId,
        state.hovered,
        state.idleStageActive,
        state.phase,
    ]);

    useEffect(() => {
        if (
            !enabled
            || state.phase !== 'resting'
            || !state.hovered
            || state.composerFocused
        ) return;
        const delay = 2600 + Math.random() * 1800;
        const timer = window.setTimeout(() => {
            advanceHoverAppearance();
            send({
                type: 'hover_variation',
                emotionId: takeHoverVariation(),
            });
        }, delay);
        return () => window.clearTimeout(timer);
    }, [
        advanceHoverAppearance,
        enabled,
        send,
        state.composerFocused,
        state.currentId,
        state.hovered,
        state.phase,
        takeHoverVariation,
    ]);

    const setHovered = useCallback((active: boolean) => {
        if (active === hoveredRef.current) return;
        hoveredRef.current = active;
        if (active) {
            advanceHoverAppearance(ambientAppearanceVariant);
            send({ type: 'hover', active: true, emotionId: takeHoverVariation() });
        } else {
            send({ type: 'hover', active: false });
        }
    }, [
        advanceHoverAppearance,
        ambientAppearanceVariant,
        send,
        takeHoverVariation,
    ]);
    const setComposerFocused = useCallback((active: boolean) => send({ type: 'focus', active }), [send]);
    const loading = useCallback(() => send({ type: 'loading' }), [send]);
    const recall = useCallback(() => send({ type: 'recall' }), [send]);
    const submit = useCallback(() => send({ type: 'submit' }), [send]);
    const replying = useCallback(() => send({ type: 'replying' }), [send]);
    const semantic = useCallback(
        (emotionId: SemanticEmotionId) => send({ type: 'semantic', emotionId }),
        [send],
    );
    const done = useCallback(() => send({ type: 'done' }), [send]);
    const fail = useCallback((code: AiAssistantErrorCode) => send({
        type: RESTRICTED_ERRORS.has(code) ? 'refusal' : 'error',
    }), [send]);
    const stop = useCallback(() => send({ type: 'stop' }), [send]);
    const rest = useCallback(() => send({ type: 'rest' }), [send]);

    return {
        command: { id: state.currentId, source: state.source, revision: state.revision },
        ambientAppearanceVariant: state.hovered
            ? hoverAppearanceVariant ?? ambientAppearanceVariant
            : ambientAppearanceVariant,
        ambientAppearanceActive: isAmbientAppearanceState(state),
        setHovered,
        setComposerFocused,
        loading,
        recall,
        submit,
        replying,
        semantic,
        done,
        fail,
        stop,
        rest,
    };
}
