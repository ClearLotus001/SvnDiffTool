import {
    DEFAULT_EMOTION_ID,
    DEFAULT_SEMANTIC_EMOTION_ID,
    isSemanticEmotionId,
    type EmotionId,
    type HoverVariationEmotionId,
    type IdleVariationEmotionId,
    type SemanticEmotionId,
} from './emotionIds';

export type EmotionSource = 'host' | 'model';
export type EmotionPhase =
    | 'boot'
    | 'resting'
    | 'engaged'
    | 'working'
    | 'replying'
    | 'settling'
    | 'fault';

export interface EmotionState {
    currentId: EmotionId;
    source: EmotionSource;
    pendingSemanticId: SemanticEmotionId | null;
    phase: EmotionPhase;
    hovered: boolean;
    hoverEmotionId: HoverVariationEmotionId;
    composerFocused: boolean;
    idleStageActive: boolean;
    revision: number;
}

export type EmotionEvent =
    | { type: 'reset' }
    | { type: 'hover'; active: true; emotionId: HoverVariationEmotionId }
    | { type: 'hover'; active: false }
    | { type: 'hover_variation'; emotionId: HoverVariationEmotionId }
    | { type: 'focus'; active: boolean }
    | { type: 'loading' }
    | { type: 'recall' }
    | { type: 'submit' }
    | { type: 'thinking' }
    | { type: 'busy' }
    | { type: 'searching' }
    | { type: 'replying' }
    | { type: 'semantic'; emotionId: SemanticEmotionId }
    | { type: 'done' }
    | { type: 'reveal_semantic' }
    | { type: 'refusal' }
    | { type: 'error' }
    | { type: 'stop' }
    | { type: 'rest' }
    | { type: 'idle_stage'; emotionId: '04' | '06' | '00' }
    | { type: 'idle_variation'; emotionId: IdleVariationEmotionId }
    | { type: 'activity' };

export const INITIAL_EMOTION_STATE: EmotionState = {
    currentId: '05',
    source: 'host',
    pendingSemanticId: null,
    phase: 'boot',
    hovered: false,
    hoverEmotionId: '02',
    composerFocused: false,
    idleStageActive: false,
    revision: 0,
};

export function isAmbientAppearanceState(state: EmotionState): boolean {
    return state.phase === 'resting'
        && !state.composerFocused
        && !state.idleStageActive;
}

function update(
    state: EmotionState,
    patch: Partial<Omit<EmotionState, 'revision'>>,
): EmotionState {
    return { ...state, ...patch, revision: state.revision + 1 };
}

function updateContext(
    state: EmotionState,
    patch: Partial<Pick<EmotionState, 'hovered' | 'hoverEmotionId' | 'composerFocused' | 'pendingSemanticId'>>,
): EmotionState {
    return { ...state, ...patch };
}

function rest(state: EmotionState): EmotionState {
    const currentId: EmotionId = state.composerFocused
        ? '35'
        : state.hovered ? state.hoverEmotionId : DEFAULT_EMOTION_ID;
    return update(state, {
        currentId,
        source: 'host',
        pendingSemanticId: null,
        phase: state.composerFocused ? 'engaged' : 'resting',
        idleStageActive: false,
    });
}

export function emotionReducer(state: EmotionState, event: EmotionEvent): EmotionState {
    switch (event.type) {
        case 'reset':
            return { ...INITIAL_EMOTION_STATE, revision: state.revision + 1 };
        case 'hover': {
            if (event.active === state.hovered) return state;
            const next = event.active
                ? updateContext(state, { hovered: true, hoverEmotionId: event.emotionId })
                : updateContext(state, { hovered: false });
            if (state.phase !== 'resting') return next;
            return update(next, {
                currentId: event.active ? event.emotionId : DEFAULT_EMOTION_ID,
                source: 'host',
                idleStageActive: false,
            });
        }
        case 'hover_variation':
            if (state.phase !== 'resting' || !state.hovered || state.composerFocused) return state;
            return update(
                updateContext(state, { hoverEmotionId: event.emotionId }),
                { currentId: event.emotionId, source: 'host', idleStageActive: false },
            );
        case 'focus': {
            const next = updateContext(state, { composerFocused: event.active });
            if (event.active && ['resting', 'engaged'].includes(state.phase)) {
                return update(next, {
                    currentId: '35',
                    source: 'host',
                    phase: 'engaged',
                    idleStageActive: false,
                });
            }
            if (!event.active && state.phase === 'engaged') return rest(next);
            return next;
        }
        case 'loading':
            return update(state, { currentId: '36', source: 'host', phase: 'working' });
        case 'recall':
            return update(state, { currentId: '37', source: 'host', phase: 'working' });
        case 'submit':
            return update(state, {
                currentId: '31',
                source: 'host',
                pendingSemanticId: null,
                phase: 'working',
            });
        case 'thinking':
            return update(state, { currentId: '30', source: 'host', phase: 'working' });
        case 'busy':
            return update(state, { currentId: '32', source: 'host', phase: 'working' });
        case 'searching':
            return update(state, { currentId: '40', source: 'host', phase: 'working' });
        case 'replying':
            if (state.currentId === '39' && state.phase === 'replying') return state;
            return update(state, { currentId: '39', source: 'host', phase: 'replying' });
        case 'semantic':
            return isSemanticEmotionId(event.emotionId)
                ? updateContext(state, { pendingSemanticId: event.emotionId })
                : state;
        case 'done':
            return update(state, { currentId: '33', source: 'host', phase: 'settling' });
        case 'reveal_semantic': {
            const emotionId = state.pendingSemanticId ?? DEFAULT_SEMANTIC_EMOTION_ID;
            return update(state, {
                currentId: emotionId,
                source: state.pendingSemanticId ? 'model' : 'host',
                pendingSemanticId: null,
                phase: 'settling',
            });
        }
        case 'refusal':
            return update(state, {
                currentId: '38',
                source: 'host',
                pendingSemanticId: null,
                phase: 'fault',
            });
        case 'error':
            return update(state, {
                currentId: '34',
                source: 'host',
                pendingSemanticId: null,
                phase: 'fault',
            });
        case 'stop':
            return update(state, {
                currentId: '41',
                source: 'host',
                pendingSemanticId: null,
                phase: 'settling',
            });
        case 'rest':
            return rest(state);
        case 'idle_stage':
            if (state.phase !== 'resting' || state.hovered || state.composerFocused) return state;
            return update(state, {
                currentId: event.emotionId,
                source: 'host',
                idleStageActive: true,
            });
        case 'idle_variation':
            if (state.phase !== 'resting' || state.hovered || state.composerFocused) return state;
            return update(state, {
                currentId: event.emotionId,
                source: 'host',
                idleStageActive: false,
            });
        case 'activity':
            if (state.phase !== 'resting') return state;
            if (state.currentId === '00') {
                return update(state, {
                    currentId: '07',
                    source: 'host',
                    phase: 'settling',
                    idleStageActive: false,
                });
            }
            if (state.currentId === '06') {
                return update(state, {
                    currentId: '01',
                    source: 'host',
                    phase: 'settling',
                    idleStageActive: false,
                });
            }
            if (state.currentId === '04') return rest(state);
            return state;
        default: {
            const exhaustive: never = event;
            return exhaustive;
        }
    }
}

export interface EmotionCommand {
    id: EmotionId;
    source: EmotionSource;
    revision: number;
}
