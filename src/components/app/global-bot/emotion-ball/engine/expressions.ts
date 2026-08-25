import { EMOTION_IDS, type EmotionId } from '../emotionIds';
import { lerp, mixColor } from './motion';
import {
    PORTED_EMOTIONS,
    PORTED_EYE_RINGS,
} from './portedReference';
import type {
    BodyPose,
    EnginePose,
    EyePose,
    Point,
} from './types';

export type AnimatorTarget = 'eyes' | 'body' | 'left' | 'right';
export type AnimatorType = 'sine' | 'pulse' | 'jitter' | 'scan' | 'glance' | 'blink';
export type AnimatorProperty = 'x' | 'y' | 'lookX' | 'lookY' | 'open' | 'scale' | 'rotate';

export interface AnimatorSpec {
    target: AnimatorTarget;
    prop: AnimatorProperty;
    type: AnimatorType;
    amp?: number;
    period?: number;
    phase?: number;
    phaseMs?: number;
    speed?: number;
    decay?: number;
    interval?: number;
    dur?: number;
    depth?: number;
}

type BodySpec = Partial<Omit<BodyPose, 'yaw'>>;
type EyeSpec = Partial<Omit<EyePose, 'ring'>>;

interface PoseSpec {
    body?: BodySpec;
    eyes?: {
        both?: EyeSpec;
        left?: EyeSpec;
        right?: EyeSpec;
    };
}

interface SequenceFrameSpec extends PoseSpec {
    at?: number;
}

type SequenceSettle = 'base' | 'hold' | { next: EmotionId };

interface PortedEmotionConfig extends PoseSpec {
    id: EmotionId;
    name: string;
    group: string;
    desc?: string;
    en?: { name: string; desc: string };
    transition?: number;
    gaze?: boolean;
    pool?: readonly number[];
    poolMs?: readonly [number, number];
    poolSpeed?: number;
    blinkMs?: readonly [number, number] | null;
    openness?: number;
    antics?: boolean;
    anims?: readonly AnimatorSpec[];
    sequence?: {
        settle?: SequenceSettle;
        frames: readonly SequenceFrameSpec[];
    };
}

export type RingPair = readonly [readonly Point[], readonly Point[]];

export interface ExpressionSequence {
    frames: readonly { at: number; pose: EnginePose }[];
    settle: SequenceSettle;
}

export interface ExpressionDefinition {
    id: EmotionId;
    transition: number;
    gaze: boolean;
    pool: readonly number[];
    poolMs: readonly [number, number];
    poolSpeed: number;
    blinkMs: readonly [number, number] | null;
    openness: number;
    antics: boolean;
    base: EnginePose;
    anims: readonly AnimatorSpec[];
    sequence: ExpressionSequence | null;
}

export const EYE_RING_PAIRS: readonly RingPair[] = PORTED_EYE_RINGS;

const DEFAULT_BODY: BodyPose = {
    x: 0,
    y: 0,
    scale: 1,
    rotate: 0,
    color: '#F3F0EA',
    breathe: 0.01,
    ribbons: 0,
    confetti: 0,
    sketch: 0,
    zzz: 0,
    orbit: 0,
    yaw: 0,
};

const DEFAULT_EYE: Omit<EyePose, 'ring'> = {
    x: 0,
    y: 0,
    scaleX: 1,
    scaleY: 1,
    rotate: 0,
    open: 1,
    color: '#1A1A1A',
    lookX: 0,
    lookY: 0,
};

function defaultPose(): EnginePose {
    return {
        body: { ...DEFAULT_BODY },
        left: { ...DEFAULT_EYE, ring: EYE_RING_PAIRS[0]![0] },
        right: { ...DEFAULT_EYE, ring: EYE_RING_PAIRS[0]![1] },
    };
}

export function clonePose(pose: EnginePose): EnginePose {
    return {
        body: { ...pose.body },
        left: { ...pose.left },
        right: { ...pose.right },
    };
}

function applySpec(pose: EnginePose, spec?: PoseSpec): EnginePose {
    if (!spec) return pose;
    if (spec.body) Object.assign(pose.body, spec.body);
    if (spec.eyes?.both) {
        Object.assign(pose.left, spec.eyes.both);
        Object.assign(pose.right, spec.eyes.both);
    }
    if (spec.eyes?.left) Object.assign(pose.left, spec.eyes.left);
    if (spec.eyes?.right) Object.assign(pose.right, spec.eyes.right);
    return pose;
}

function lerpEye(from: EyePose, to: EyePose, amount: number): EyePose {
    return {
        x: lerp(from.x, to.x, amount),
        y: lerp(from.y, to.y, amount),
        scaleX: lerp(from.scaleX, to.scaleX, amount),
        scaleY: lerp(from.scaleY, to.scaleY, amount),
        rotate: lerp(from.rotate, to.rotate, amount),
        open: lerp(from.open, to.open, amount),
        color: mixColor(from.color, to.color, amount),
        lookX: lerp(from.lookX, to.lookX, amount),
        lookY: lerp(from.lookY, to.lookY, amount),
        ring: to.ring,
    };
}

export function lerpPose(from: EnginePose, to: EnginePose, amount: number): EnginePose {
    return {
        body: {
            x: lerp(from.body.x, to.body.x, amount),
            y: lerp(from.body.y, to.body.y, amount),
            scale: lerp(from.body.scale, to.body.scale, amount),
            rotate: lerp(from.body.rotate, to.body.rotate, amount),
            color: mixColor(from.body.color, to.body.color, amount),
            breathe: lerp(from.body.breathe, to.body.breathe, amount),
            ribbons: lerp(from.body.ribbons, to.body.ribbons, amount),
            confetti: lerp(from.body.confetti, to.body.confetti, amount),
            sketch: lerp(from.body.sketch, to.body.sketch, amount),
            zzz: lerp(from.body.zzz, to.body.zzz, amount),
            orbit: lerp(from.body.orbit, to.body.orbit, amount),
            yaw: lerp(from.body.yaw, to.body.yaw, amount),
        },
        left: lerpEye(from.left, to.left, amount),
        right: lerpEye(from.right, to.right, amount),
    };
}

function normalize(raw: PortedEmotionConfig): ExpressionDefinition {
    const base = applySpec(defaultPose(), raw);
    const pool = (raw.pool ?? [0, 8]).filter((index) => (
        index >= 0 && index < EYE_RING_PAIRS.length
    ));
    const normalizedPool = pool.length ? pool : [0];
    const sequence = raw.sequence
        ? {
            frames: raw.sequence.frames
                .map((frame) => ({
                    at: frame.at ?? 0,
                    pose: applySpec(clonePose(base), frame),
                }))
                .sort((left, right) => left.at - right.at),
            settle: raw.sequence.settle ?? 'base',
        }
        : null;
    return {
        id: raw.id,
        transition: raw.transition ?? 500,
        gaze: raw.gaze !== false,
        pool: normalizedPool,
        poolMs: raw.poolMs ?? [9000, 16000],
        poolSpeed: raw.poolSpeed ?? 6,
        blinkMs: raw.blinkMs === undefined ? [6000, 14000] : raw.blinkMs,
        openness: raw.openness ?? 1,
        antics: raw.antics === true,
        base,
        anims: raw.anims ? raw.anims.map((animator) => ({ ...animator })) : [],
        sequence,
    };
}

const PORTED_CONFIGS: readonly PortedEmotionConfig[] = PORTED_EMOTIONS;
const definitionsById = new Map<EmotionId, ExpressionDefinition>();

PORTED_CONFIGS.forEach((config) => {
    if (definitionsById.has(config.id)) {
        throw new Error(`Duplicate ported emotion ID: ${config.id}`);
    }
    definitionsById.set(config.id, normalize(config));
});

const DEFINITIONS = Object.fromEntries(EMOTION_IDS.map((id) => {
    const definition = definitionsById.get(id);
    if (!definition) throw new Error(`Missing ported emotion ID: ${id}`);
    return [id, definition] as const;
})) as Record<EmotionId, ExpressionDefinition>;

export function getExpression(id: EmotionId): ExpressionDefinition {
    return DEFINITIONS[id] ?? DEFINITIONS['02'];
}
