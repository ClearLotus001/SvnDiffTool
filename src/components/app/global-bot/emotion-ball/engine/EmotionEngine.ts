import { isEmotionId, type EmotionId } from '../emotionIds';
import {
    EYE_RING_PAIRS,
    clonePose,
    getExpression,
    lerpPose,
    type AnimatorSpec,
    type ExpressionDefinition,
    type ExpressionSequence,
    type RingPair,
} from './expressions';
import {
    interpolatePoints,
    sampleBody,
    shapeFace,
} from './geometry';
import { clamp, easeInOutCubic, lerp, mixColor } from './motion';
import { EmotionSvgRenderer } from './renderer';
import { activateEngine, deactivateEngine, type ScheduledEmotionEngine } from './scheduler';
import type {
    EmotionEngineApi,
    EmotionEngineOptions,
    EngineAppearance,
    EnginePose,
    EngineShape,
    EyePose,
    FaceProjection,
    Point,
    RenderFrame,
    SurfaceColors,
} from './types';

const TAU = Math.PI * 2;
// The ported eye rings already include their authored feature size. Scaling
// them above 1 makes most pooled pairs intersect once projected onto the
// compact prism and petal silhouettes.
const SMALL_INSTANCE_EYE_SCALE = 0.85;
const BOUNCE_SEGMENTS = [
    { height: 48, duration: 0.5 },
    { height: 28, duration: 0.382 },
    { height: 14, duration: 0.27 },
    { height: 6, duration: 0.177 },
] as const;
const BOUNCE_TOTAL = BOUNCE_SEGMENTS.reduce((sum, segment) => sum + segment.duration, 0);

interface SpringState {
    x: number;
    velocity: number;
    target: number;
}

interface AppearanceTween {
    from: EngineAppearance;
    to: EngineAppearance;
    startedAt: number;
    duration: number;
}

interface ShapeTween {
    fromShape: EngineShape;
    toShape: EngineShape;
    from: readonly Point[];
    to: readonly Point[];
    fromFace: FaceProjection;
    toFace: FaceProjection;
    startedAt: number;
    duration: number;
}

interface BlinkKeyframe {
    at: number;
    value: number;
}

interface ActiveSequence {
    frames: ExpressionSequence['frames'];
    settle: ExpressionSequence['settle'];
    done: boolean;
}

function spring(value: number): SpringState {
    return { x: value, velocity: 0, target: value };
}

function springStep(state: SpringState, frequency: number, damping: number, delta: number): void {
    state.velocity += (
        -2 * damping * frequency * state.velocity
        - frequency * frequency * (state.x - state.target)
    ) * delta;
    state.x += state.velocity * delta;
    if (!Number.isFinite(state.x) || !Number.isFinite(state.velocity)) {
        state.x = state.target;
        state.velocity = 0;
    }
}

function randomBetween(min: number, max: number): number {
    return min + Math.random() * (max - min);
}

function interpolateRing(from: readonly Point[], to: readonly Point[], amount: number): Point[] {
    return from.map((point, index) => [
        point[0] + ((to[index]?.[0] ?? point[0]) - point[0]) * amount,
        point[1] + ((to[index]?.[1] ?? point[1]) - point[1]) * amount,
    ]);
}

function mixSurfaceColors(
    from: SurfaceColors,
    to: SurfaceColors,
    amount: number,
): SurfaceColors {
    return [
        mixColor(from[0], to[0], amount),
        mixColor(from[1], to[1], amount),
        mixColor(from[2], to[2], amount),
        mixColor(from[3], to[3], amount),
    ];
}

function tintSurfaceColors(
    baseColor: string,
    colors: SurfaceColors,
    amount: number,
): SurfaceColors {
    return [
        mixColor(baseColor, colors[0], amount),
        mixColor(baseColor, colors[1], amount),
        mixColor(baseColor, colors[2], amount),
        mixColor(baseColor, colors[3], amount),
    ];
}

function interpolateFace(
    from: FaceProjection,
    to: FaceProjection,
    amount: number,
): FaceProjection {
    return {
        x: lerp(from.x, to.x, amount),
        y: lerp(from.y, to.y, amount),
        sx: lerp(from.sx, to.sx, amount),
        sy: lerp(from.sy, to.sy, amount),
        eye: lerp(from.eye, to.eye, amount),
    };
}

function animatorValue(
    animator: AnimatorSpec,
    elapsed: number,
    seed: number,
): number {
    const amplitude = animator.amp ?? 0;
    switch (animator.type) {
        case 'sine':
            return amplitude * Math.sin(
                TAU * elapsed / (animator.period ?? 2000) + (animator.phase ?? 0),
            );
        case 'pulse':
            return amplitude * 0.5 * (1 - Math.cos(
                TAU * elapsed / (animator.period ?? 1000) + (animator.phase ?? 0),
            ));
        case 'jitter': {
            const sample = elapsed / 1000 * (animator.speed ?? 8);
            let value = (
                Math.sin(sample * 3.1 + seed)
                + Math.sin(sample * 5.7 + seed * 2.3)
                + Math.sin(sample * 9.3 + seed * 4.1)
            ) / 3 * amplitude;
            if (animator.decay) value *= clamp(1 - elapsed / animator.decay, 0, 1);
            return value;
        }
        case 'scan': {
            const period = animator.period ?? 800;
            const progress = ((elapsed + (animator.phaseMs ?? 0)) % period) / period;
            return amplitude * (progress < 0.5 ? progress * 4 - 1 : 3 - progress * 4);
        }
        case 'glance': {
            const period = animator.period ?? 3600;
            const phase = TAU * (
                ((elapsed + (animator.phaseMs ?? 0)) % period) / period
            ) + (animator.phase ?? 0);
            return amplitude * Math.tanh(2.8 * Math.sin(phase));
        }
        case 'blink': {
            const interval = animator.interval ?? 3800;
            const duration = animator.dur ?? 200;
            const progress = (
                elapsed + (animator.phaseMs ?? 0) + seed * 97
            ) % interval;
            if (progress >= duration) return 0;
            return -(animator.depth ?? 1) * Math.sin(Math.PI * progress / duration);
        }
        default:
            return 0;
    }
}

function applyAnimator(
    pose: EnginePose,
    animator: AnimatorSpec,
    elapsed: number,
    seed: number,
): void {
    const value = animatorValue(animator, elapsed, seed);
    const targets = animator.target === 'eyes'
        ? [pose.left, pose.right]
        : animator.target === 'body' ? [pose.body]
            : animator.target === 'left' ? [pose.left] : [pose.right];
    targets.forEach((target) => {
        if (animator.prop === 'scale') {
            if ('scale' in target) target.scale += value;
            else {
                target.scaleX += value;
                target.scaleY += value;
            }
            return;
        }
        switch (animator.prop) {
            case 'x':
                target.x += value;
                break;
            case 'y':
                target.y += value;
                break;
            case 'rotate':
                target.rotate += value;
                break;
            case 'lookX':
            case 'lookY':
            case 'open':
                if (!('lookX' in target)) break;
                target[animator.prop] += value;
                break;
            default:
                break;
        }
    });
}

class VersoraEmotionEngine implements EmotionEngineApi, ScheduledEmotionEngine {
    readonly svg: SVGSVGElement;
    private readonly renderer: EmotionSvgRenderer;
    private readonly seed = Math.random() * 100;
    private currentEmotion: EmotionId;
    private definition: ExpressionDefinition;
    private lastPose: EnginePose | null = null;
    private previousPose: EnginePose | null = null;
    private transitionStartedAt = 0;
    private transitionDuration = 0;
    private emotionStartedAt = 0;
    private sequence: ActiveSequence | null = null;
    private ringSource: RingPair;
    private ringTarget: RingPair;
    private ringCurrent: RingPair;
    private readonly ringSpring = spring(1);
    private ringSpeed = 7;
    private expressionIndex = 0;
    private poolPosition = 0;
    private poolNextAt = 0;
    private readonly openSpring = spring(1);
    private blinkQueue: BlinkKeyframe[] = [];
    private blinkNextAt = Number.POSITIVE_INFINITY;
    private anticNextAt = 0;
    private bounceStartedAt = -1;
    private spinState: SpringState | null = null;
    private gaze = { x: 0, y: 0, targetX: 0, targetY: 0 };
    private appearance: EngineAppearance;
    private appearanceTween: AppearanceTween | null = null;
    private shape: EngineShape;
    private shapePoints: readonly Point[];
    private shapeTween: ShapeTween | null = null;
    private lastFrameAt = 0;
    private active = false;
    private destroyed = false;

    constructor(container: HTMLElement, options: EmotionEngineOptions) {
        const now = performance.now();
        this.currentEmotion = options.emotion;
        this.definition = getExpression(options.emotion);
        this.expressionIndex = this.definition.pool[0] ?? 0;
        this.ringSource = EYE_RING_PAIRS[this.expressionIndex] ?? EYE_RING_PAIRS[0]!;
        this.ringTarget = this.ringSource;
        this.ringCurrent = this.ringTarget;
        this.openSpring.x = this.definition.openness;
        this.openSpring.target = this.definition.openness;
        this.emotionStartedAt = now;
        this.poolNextAt = now + randomBetween(...this.definition.poolMs);
        this.blinkNextAt = this.definition.blinkMs
            ? now + randomBetween(...this.definition.blinkMs)
            : Number.POSITIVE_INFINITY;
        this.anticNextAt = now + randomBetween(2500, 5000);
        this.sequence = this.createSequence(this.definition.sequence);
        this.appearance = { ...options.appearance };
        this.shape = options.appearance.shape;
        this.shapePoints = sampleBody(this.shape);
        this.renderer = new EmotionSvgRenderer(container, EYE_RING_PAIRS[0]!);
        this.svg = this.renderer.svg;
        this.renderStatic();
        this.setActive(options.active);
    }

    get emotionId(): EmotionId {
        return this.currentEmotion;
    }

    setEmotion(id: EmotionId, options: { replay?: boolean } = {}): boolean {
        if (!isEmotionId(id)) return false;
        if (id === this.currentEmotion && !options.replay) return true;
        const now = performance.now();
        const previousId = this.currentEmotion;
        this.previousPose = this.lastPose ? clonePose(this.lastPose) : null;
        this.currentEmotion = id;
        this.definition = getExpression(id);
        this.emotionStartedAt = now;
        this.transitionStartedAt = now;
        this.transitionDuration = this.previousPose ? this.definition.transition : 0;
        this.sequence = this.createSequence(this.definition.sequence);
        this.poolPosition = 0;
        this.setExpression(this.definition.pool[0] ?? 0, this.definition.poolSpeed >= 10 ? 10 : 8);
        this.poolNextAt = now + randomBetween(...this.definition.poolMs);
        if (previousId !== id && this.definition.blinkMs) this.blinkNow(now);
        this.blinkNextAt = this.definition.blinkMs
            ? now + randomBetween(...this.definition.blinkMs)
            : Number.POSITIVE_INFINITY;
        this.anticNextAt = now + randomBetween(2500, 5000);
        if (this.active) {
            if (this.definition.base.body.ribbons > 0) {
                this.startSpin(this.definition.base.body.ribbons >= 1 ? 2 : 1);
            }
            if (this.definition.base.body.confetti > 0) this.renderer.burst(20);
        }
        if (!this.active) this.renderStatic();
        return true;
    }

    replaySpinRibbon(): boolean {
        if (this.destroyed || !this.active || this.spinState) return false;
        this.startSpin(1);
        return true;
    }

    setAppearance(next: EngineAppearance): void {
        const now = performance.now();
        const current = this.sampleAppearance(now);
        const duration = Math.max(0, next.duration);
        this.appearanceTween = duration
            ? { from: current, to: { ...next }, startedAt: now, duration }
            : null;
        this.appearance = duration ? current : { ...next };
        const currentShape = this.sampleShape(now);
        this.shapeTween = duration
            ? {
                fromShape: currentShape.shape,
                toShape: next.shape,
                from: currentShape.points,
                to: sampleBody(next.shape),
                fromFace: currentShape.face,
                toFace: shapeFace(next.shape),
                startedAt: now,
                duration,
            }
            : null;
        if (!duration) {
            this.shape = next.shape;
            this.shapePoints = sampleBody(next.shape);
        }
        this.svg.dataset.shapeTarget = next.shape;
        if (!this.active) this.renderStatic();
    }

    setGaze(x: number, y: number): void {
        this.gaze.targetX = clamp(x, -1, 1) * 24;
        this.gaze.targetY = clamp(y, -1, 1) * 15;
    }

    clearGaze(): void {
        this.gaze.targetX = 0;
        this.gaze.targetY = 0;
    }

    setActive(active: boolean): void {
        if (this.destroyed || this.active === active) return;
        this.active = active;
        if (active) {
            this.lastFrameAt = 0;
            activateEngine(this);
        } else {
            deactivateEngine(this);
            this.spinState = null;
            this.bounceStartedAt = -1;
            this.svg.dataset.antic = 'none';
            this.renderStatic();
        }
    }

    onAnimationFrame(now: number): void {
        if (!this.active || this.destroyed) return;
        this.render(now, false);
    }

    renderStatic(): void {
        if (this.destroyed) return;
        const now = performance.now();
        this.spinState = null;
        this.bounceStartedAt = -1;
        this.blinkQueue = [];
        this.ringSpring.x = 1;
        this.ringSpring.velocity = 0;
        this.ringCurrent = this.ringTarget;
        this.openSpring.x = this.definition.openness;
        this.openSpring.velocity = 0;
        this.openSpring.target = this.definition.openness;
        if (this.appearanceTween) {
            this.appearance = { ...this.appearanceTween.to };
            this.appearanceTween = null;
        }
        if (this.shapeTween) {
            this.shape = this.shapeTween.toShape;
            this.shapePoints = [...this.shapeTween.to];
            this.shapeTween = null;
        }
        this.svg.dataset.antic = 'none';
        this.render(now, true);
    }

    destroy(): void {
        if (this.destroyed) return;
        this.destroyed = true;
        deactivateEngine(this);
        this.renderer.destroy();
    }

    private createSequence(sequence: ExpressionSequence | null): ActiveSequence | null {
        return sequence
            ? { frames: sequence.frames, settle: sequence.settle, done: false }
            : null;
    }

    private startSpin(turns: number, direction?: number): void {
        if (this.spinState) return;
        const spinDirection = direction ?? (Math.random() < 0.5 ? -1 : 1);
        this.spinState = {
            x: 0,
            velocity: 0,
            target: Math.max(1, Math.round(turns)) * TAU * spinDirection,
        };
        this.svg.dataset.antic = 'spin';
    }

    private startBounce(now: number): void {
        if (this.bounceStartedAt < 0) {
            this.bounceStartedAt = now;
            this.svg.dataset.antic = 'bounce';
        }
    }

    private setExpression(index: number, speed?: number): void {
        if (index === this.expressionIndex && this.ringSpring.x >= 0.999) return;
        const amount = clamp(this.ringSpring.x, 0, 1);
        this.ringSource = [
            interpolateRing(this.ringSource[0], this.ringTarget[0], amount),
            interpolateRing(this.ringSource[1], this.ringTarget[1], amount),
        ];
        this.ringTarget = EYE_RING_PAIRS[index] ?? EYE_RING_PAIRS[0]!;
        this.ringSpring.x = 0;
        this.ringSpring.velocity = 0;
        this.ringSpring.target = 1;
        this.ringSpeed = speed ?? 7;
        this.expressionIndex = index;
    }

    private blinkNow(now: number): void {
        this.blinkQueue.push(
            { at: now, value: 0.05 },
            { at: now + 70, value: 0.05 },
            { at: now + 150, value: 1.08 },
            { at: now + 300, value: 1 },
        );
        if (Math.random() < 0.14) {
            this.blinkQueue.push(
                { at: now + 370, value: 0.05 },
                { at: now + 480, value: 1 },
            );
        }
    }

    private sampleAppearance(now: number): EngineAppearance {
        const tween = this.appearanceTween;
        if (!tween) return { ...this.appearance };
        const raw = clamp((now - tween.startedAt) / tween.duration, 0, 1);
        const amount = easeInOutCubic(raw);
        const sampled: EngineAppearance = {
            shape: tween.to.shape,
            tint: mixColor(tween.from.tint, tween.to.tint, amount),
            tintMix: lerp(tween.from.tintMix, tween.to.tintMix, amount),
            eyeColor: mixColor(tween.from.eyeColor, tween.to.eyeColor, amount),
            surfaceColors: mixSurfaceColors(
                tween.from.surfaceColors,
                tween.to.surfaceColors,
                amount,
            ),
            surfaceFlow: lerp(tween.from.surfaceFlow, tween.to.surfaceFlow, amount),
            surfaceSeed: lerp(tween.from.surfaceSeed, tween.to.surfaceSeed, amount),
            duration: tween.to.duration,
        };
        if (raw >= 1) {
            this.appearance = { ...tween.to };
            this.appearanceTween = null;
            return { ...this.appearance };
        }
        return sampled;
    }

    private sampleShape(now: number): {
        points: readonly Point[];
        face: FaceProjection;
        shape: EngineShape;
        target: EngineShape;
    } {
        const tween = this.shapeTween;
        if (!tween) {
            return {
                points: this.shapePoints,
                face: shapeFace(this.shape),
                shape: this.shape,
                target: this.shape,
            };
        }
        const raw = clamp((now - tween.startedAt) / tween.duration, 0, 1);
        const amount = easeInOutCubic(raw);
        const points = interpolatePoints(tween.from, tween.to, amount);
        const face = interpolateFace(tween.fromFace, tween.toFace, amount);
        if (raw >= 1) {
            this.shape = tween.toShape;
            this.shapePoints = [...tween.to];
            this.shapeTween = null;
            return {
                points: this.shapePoints,
                face: tween.toFace,
                shape: this.shape,
                target: this.shape,
            };
        }
        return { points, face, shape: tween.fromShape, target: tween.toShape };
    }

    private sequencePose(elapsed: number, now: number): EnginePose | 'switch' | null {
        const sequence = this.sequence;
        if (!sequence) return null;
        const frames = sequence.frames;
        const last = frames[frames.length - 1];
        if (!last) return null;
        if (elapsed >= last.at) {
            if (!sequence.done) {
                sequence.done = true;
                if (sequence.settle === 'base') {
                    this.previousPose = this.lastPose
                        ? clonePose(this.lastPose)
                        : clonePose(last.pose);
                    this.transitionStartedAt = now;
                    this.transitionDuration = this.definition.transition;
                    this.sequence = null;
                    return null;
                }
                if (typeof sequence.settle === 'object') {
                    this.setEmotion(sequence.settle.next, { replay: true });
                    return 'switch';
                }
            }
            return clonePose(last.pose);
        }
        if (elapsed <= frames[0]!.at) return clonePose(frames[0]!.pose);
        for (let index = 0; index < frames.length - 1; index += 1) {
            const from = frames[index]!;
            const to = frames[index + 1]!;
            if (elapsed >= from.at && elapsed < to.at) {
                return lerpPose(
                    from.pose,
                    to.pose,
                    easeInOutCubic((elapsed - from.at) / (to.at - from.at)),
                );
            }
        }
        return clonePose(last.pose);
    }

    private compose(now: number, deltaSeconds: number, depth = 0): EnginePose {
        const elapsed = now - this.emotionStartedAt;
        const sequencePose = this.sequencePose(elapsed, now);
        if (sequencePose === 'switch') {
            return depth < 4
                ? this.compose(now, deltaSeconds, depth + 1)
                : clonePose(this.definition.base);
        }
        const pose = sequencePose ?? clonePose(this.definition.base);
        const breathe = pose.body.breathe;
        if (breathe) {
            const phase = TAU * now / 3600;
            pose.body.scale += breathe * Math.sin(phase);
            pose.body.y += breathe * 55 * Math.sin(phase + 0.6);
        }
        this.definition.anims.forEach((animator) => (
            applyAnimator(pose, animator, elapsed, this.seed)
        ));

        if (this.active && now >= this.poolNextAt) {
            if (this.definition.pool.length > 1) {
                this.poolPosition = (
                    this.poolPosition + 1
                    + Math.floor(randomBetween(0, this.definition.pool.length - 1))
                ) % this.definition.pool.length;
                this.setExpression(
                    this.definition.pool[this.poolPosition]!,
                    this.definition.poolSpeed,
                );
            }
            this.poolNextAt = now + randomBetween(...this.definition.poolMs);
        }

        if (this.active && this.definition.blinkMs && now >= this.blinkNextAt) {
            this.blinkNow(now);
            this.blinkNextAt = now + randomBetween(...this.definition.blinkMs);
        }
        let openKey: number | null = null;
        while (this.blinkQueue.length && now >= this.blinkQueue[0]!.at) {
            openKey = this.blinkQueue[0]!.value;
            this.blinkQueue.shift();
        }
        this.openSpring.target = openKey ?? (
            this.blinkQueue.length ? this.openSpring.target : this.definition.openness
        );

        if (this.active && this.definition.antics && now >= this.anticNextAt) {
            if (!this.spinState && this.bounceStartedAt < 0) {
                const choice = Math.random();
                if (choice < 0.45) this.startSpin(1);
                else if (choice < 0.8) this.startBounce(now);
                else this.blinkNow(now);
            }
            this.anticNextAt = now + randomBetween(9000, 18000);
        }

        const stepCount = Math.max(1, Math.ceil(deltaSeconds / (1 / 120)));
        const substep = deltaSeconds / stepCount;
        for (let index = 0; index < stepCount; index += 1) {
            springStep(this.ringSpring, this.ringSpeed, 1, substep);
            springStep(this.openSpring, 26, 1, substep);
            if (this.spinState) {
                springStep(this.spinState, 6.2, 1, substep);
                if (
                    Math.abs(this.spinState.target - this.spinState.x) < 0.01
                    && Math.abs(this.spinState.velocity) < 0.05
                ) {
                    this.spinState = null;
                }
            }
        }
        pose.body.yaw = this.spinState?.x ?? 0;

        if (this.bounceStartedAt >= 0) {
            const bounceElapsed = (now - this.bounceStartedAt) / 1000;
            if (bounceElapsed >= BOUNCE_TOTAL) {
                this.bounceStartedAt = -1;
            } else {
                let accumulated = 0;
                let index = 0;
                while (
                    index < BOUNCE_SEGMENTS.length
                    && bounceElapsed >= accumulated + BOUNCE_SEGMENTS[index]!.duration
                ) {
                    accumulated += BOUNCE_SEGMENTS[index]!.duration;
                    index += 1;
                }
                const segment = BOUNCE_SEGMENTS[Math.min(index, BOUNCE_SEGMENTS.length - 1)]!;
                const progress = (bounceElapsed - accumulated) / segment.duration;
                pose.body.y += -4 * segment.height * progress * (1 - progress);
            }
        }

        if (
            this.ringSpring.x < 0.999
            || Math.abs(this.ringSpring.velocity) > 0.001
        ) {
            const amount = clamp(this.ringSpring.x, 0, 1.35);
            this.ringCurrent = [
                interpolateRing(this.ringSource[0], this.ringTarget[0], amount),
                interpolateRing(this.ringSource[1], this.ringTarget[1], amount),
            ];
        } else if (this.ringCurrent !== this.ringTarget) {
            this.ringCurrent = this.ringTarget;
        }
        pose.left.ring = this.ringCurrent[0];
        pose.right.ring = this.ringCurrent[1];

        const gazeAmount = 1 - Math.exp(-5.66 * deltaSeconds);
        const gazeX = this.definition.gaze ? this.gaze.targetX : 0;
        const gazeY = this.definition.gaze ? this.gaze.targetY : 0;
        this.gaze.x += (gazeX - this.gaze.x) * gazeAmount;
        this.gaze.y += (gazeY - this.gaze.y) * gazeAmount;
        pose.left.lookX += this.gaze.x;
        pose.right.lookX += this.gaze.x;
        pose.left.lookY += this.gaze.y;
        pose.right.lookY += this.gaze.y;
        if (this.definition.gaze) {
            const seconds = now / 1000;
            pose.left.lookX += 1.4 * Math.sin(0.42 * seconds) + 0.5 * Math.sin(seconds);
            pose.right.lookX += 1.4 * Math.sin(0.42 * seconds + 1) + 0.5 * Math.sin(seconds + 2);
            pose.left.lookY += 0.9 * Math.sin(0.58 * seconds);
            pose.right.lookY += 0.9 * Math.sin(0.58 * seconds + 1);
        }
        this.scaleEye(pose.left, SMALL_INSTANCE_EYE_SCALE);
        this.scaleEye(pose.right, SMALL_INSTANCE_EYE_SCALE);
        const open = clamp(this.openSpring.x, 0.02, 1.5);
        pose.left.open = clamp(pose.left.open, 0, 1.3) * open;
        pose.right.open = clamp(pose.right.open, 0, 1.3) * open;
        pose.left.scaleX = Math.max(pose.left.scaleX, 0.05);
        pose.left.scaleY = Math.max(pose.left.scaleY, 0.05);
        pose.right.scaleX = Math.max(pose.right.scaleX, 0.05);
        pose.right.scaleY = Math.max(pose.right.scaleY, 0.05);

        const transitionElapsed = now - this.transitionStartedAt;
        if (
            this.transitionDuration > 0
            && transitionElapsed < this.transitionDuration
            && this.previousPose
        ) {
            return lerpPose(
                this.previousPose,
                pose,
                easeInOutCubic(transitionElapsed / this.transitionDuration),
            );
        }
        return pose;
    }

    private scaleEye(eye: EyePose, amount: number): void {
        eye.scaleX *= amount;
        eye.scaleY *= amount;
    }

    private staticPose(): EnginePose {
        const pose = clonePose(this.definition.base);
        pose.left.ring = this.ringTarget[0];
        pose.right.ring = this.ringTarget[1];
        this.scaleEye(pose.left, SMALL_INSTANCE_EYE_SCALE);
        this.scaleEye(pose.right, SMALL_INSTANCE_EYE_SCALE);
        pose.left.open *= this.definition.openness;
        pose.right.open *= this.definition.openness;
        pose.body.yaw = 0;
        return pose;
    }

    private render(now: number, staticFrame: boolean): void {
        const deltaSeconds = this.lastFrameAt
            ? clamp((now - this.lastFrameAt) / 1000, 0.001, 0.05)
            : 1 / 60;
        this.lastFrameAt = now;
        const pose = staticFrame ? this.staticPose() : this.compose(now, deltaSeconds);
        const appearance = this.sampleAppearance(now);
        const surfaceColors = tintSurfaceColors(
            pose.body.color,
            appearance.surfaceColors,
            appearance.tintMix,
        );
        pose.body.color = mixColor(pose.body.color, appearance.tint, appearance.tintMix);
        pose.left.color = appearance.eyeColor;
        pose.right.color = appearance.eyeColor;
        const shape = this.sampleShape(now);
        const frame: RenderFrame = {
            now,
            staticFrame,
            shape: shape.shape,
            shapeTarget: shape.target,
            bodyPoints: shape.points,
            face: shape.face,
            body: pose.body,
            surfaceColors,
            surfaceFlow: appearance.surfaceFlow,
            surfaceSeed: appearance.surfaceSeed,
            leftEye: pose.left,
            rightEye: pose.right,
        };
        this.renderer.render(frame);
        this.lastPose = clonePose(pose);
        if (
            !this.spinState
            && this.bounceStartedAt < 0
            && this.svg.dataset.ribbonActive !== 'true'
        ) {
            this.svg.dataset.antic = 'none';
        }
    }
}

export function createEmotionEngine(
    container: HTMLElement,
    options: EmotionEngineOptions,
): EmotionEngineApi {
    return new VersoraEmotionEngine(container, options);
}
