import type { EmotionId } from '../emotionIds';

export type EngineShape = 'bloom' | 'prism' | 'petal' | 'ghost' | 'arcHex';
export type Point = readonly [number, number];
export type SurfaceColors = readonly [string, string, string, string];

export interface EngineAppearance {
    shape: EngineShape;
    tint: string;
    tintMix: number;
    eyeColor: string;
    surfaceColors: SurfaceColors;
    surfaceFlow: number;
    surfaceSeed: number;
    duration: number;
}

export interface BodyPose {
    x: number;
    y: number;
    scale: number;
    rotate: number;
    color: string;
    breathe: number;
    ribbons: number;
    confetti: number;
    sketch: number;
    zzz: number;
    orbit: number;
    yaw: number;
}

export interface EyePose {
    x: number;
    y: number;
    scaleX: number;
    scaleY: number;
    rotate: number;
    open: number;
    color: string;
    lookX: number;
    lookY: number;
    ring: readonly Point[];
}

export interface EnginePose {
    body: BodyPose;
    left: EyePose;
    right: EyePose;
}

export interface FaceProjection {
    x: number;
    y: number;
    sx: number;
    sy: number;
    eye: number;
}

export interface RenderFrame {
    now: number;
    staticFrame: boolean;
    shape: EngineShape;
    shapeTarget: EngineShape;
    bodyPoints: readonly Point[];
    face: FaceProjection;
    body: BodyPose;
    surfaceColors: SurfaceColors;
    surfaceFlow: number;
    surfaceSeed: number;
    leftEye: EyePose;
    rightEye: EyePose;
}

export interface EmotionEngineOptions {
    emotion: EmotionId;
    appearance: EngineAppearance;
    active: boolean;
}

export interface EmotionEngineApi {
    readonly svg: SVGSVGElement;
    readonly emotionId: EmotionId;
    setEmotion(id: EmotionId, options?: { replay?: boolean }): boolean;
    replaySpinRibbon(): boolean;
    setAppearance(appearance: EngineAppearance): void;
    setGaze(x: number, y: number): void;
    clearGaze(): void;
    setActive(active: boolean): void;
    renderStatic(): void;
    destroy(): void;
}
