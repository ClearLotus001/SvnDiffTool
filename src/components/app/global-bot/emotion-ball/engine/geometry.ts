import {
    PORTED_BODY_SHAPES,
    PORTED_HEAD_CENTER,
} from './portedReference';
import { clamp, lerp } from './motion';
import type { EngineShape, FaceProjection, Point } from './types';

export const CENTER = PORTED_HEAD_CENTER;
const BODY_POINT_COUNT = 96;

const GHOST_FACE: FaceProjection = {
    x: 0,
    y: -7,
    sx: 0.84,
    sy: 0.76,
    eye: 0.88,
};

const ARC_HEX_FACE: FaceProjection = {
    x: 0,
    y: -2,
    sx: 0.88,
    sy: 0.82,
    eye: 0.94,
};

const ARC_HEX_NODE_COUNT = 6;
const ARC_HEX_POINTS_PER_ARC = BODY_POINT_COUNT / ARC_HEX_NODE_COUNT;
const ARC_HEX_NODES: readonly Point[] = Array.from(
    { length: ARC_HEX_NODE_COUNT },
    (_, index): Point => {
        const angle = index / ARC_HEX_NODE_COUNT * Math.PI * 2;
        return [
            CENTER + 106 * Math.cos(angle),
            CENTER + 98 * Math.sin(angle),
        ];
    },
);

function smoothstep(edge0: number, edge1: number, value: number): number {
    const amount = clamp((value - edge0) / (edge1 - edge0), 0, 1);
    return amount * amount * (3 - 2 * amount);
}

/**
 * Clockwise 96-point ghost ring aligned with the ported morph topology:
 * right-middle -> bottom -> left-middle -> top -> right-middle.
 */
const GHOST_BODY_RING: readonly Point[] = Array.from(
    { length: BODY_POINT_COUNT },
    (_, index): Point => {
        const angle = index / BODY_POINT_COUNT * Math.PI * 2;
        const sine = Math.sin(angle);
        const lowerHalf = sine > 0;
        const radiusX = lowerHalf ? 108 - 12 * sine : 108;
        const x = CENTER + radiusX * Math.cos(angle);
        const ellipseY = CENTER + (lowerHalf ? 94 : 104) * sine;

        if (!lowerHalf) return [x, ellipseY];

        const hemBlend = smoothstep(0.42, 0.72, sine);
        const hemPosition = clamp((x - (CENTER - 99)) / 198, 0, 1);
        const wave = Math.sin(hemPosition * Math.PI * 3);
        const hemY = 190 + 21 * wave * wave;
        return [x, lerp(ellipseY, hemY, hemBlend)];
    },
);

function catmullRomPoint(
    before: Point,
    start: Point,
    end: Point,
    after: Point,
    amount: number,
): Point {
    const t2 = amount * amount;
    const t3 = t2 * amount;
    return [
        0.5 * (
            2 * start[0]
            + (-before[0] + end[0]) * amount
            + (2 * before[0] - 5 * start[0] + 4 * end[0] - after[0]) * t2
            + (-before[0] + 3 * start[0] - 3 * end[0] + after[0]) * t3
        ),
        0.5 * (
            2 * start[1]
            + (-before[1] + end[1]) * amount
            + (2 * before[1] - 5 * start[1] + 4 * end[1] - after[1]) * t2
            + (-before[1] + 3 * start[1] - 3 * end[1] + after[1]) * t3
        ),
    ];
}

/**
 * Clockwise 96-point rounded hexagon aligned with the ported morph topology.
 * Six cardinal nodes retain the hexagonal character while the closed spline
 * keeps both the sides and corners soft at small render sizes.
 */
const ARC_HEX_BODY_RING: readonly Point[] = Array.from(
    { length: BODY_POINT_COUNT },
    (_, index): Point => {
        const arcIndex = Math.floor(index / ARC_HEX_POINTS_PER_ARC);
        const amount = (index % ARC_HEX_POINTS_PER_ARC) / ARC_HEX_POINTS_PER_ARC;
        return catmullRomPoint(
            ARC_HEX_NODES[(arcIndex + ARC_HEX_NODE_COUNT - 1) % ARC_HEX_NODE_COUNT]!,
            ARC_HEX_NODES[arcIndex]!,
            ARC_HEX_NODES[(arcIndex + 1) % ARC_HEX_NODE_COUNT]!,
            ARC_HEX_NODES[(arcIndex + 2) % ARC_HEX_NODE_COUNT]!,
            amount,
        );
    },
);

const SHAPE_KEY = {
    bloom: 'blob',
    prism: 'gem',
    petal: 'wedge',
} as const satisfies Partial<Record<EngineShape, keyof typeof PORTED_BODY_SHAPES>>;

export function sampleBody(shape: EngineShape): Point[] {
    if (shape === 'ghost') return GHOST_BODY_RING.map(([x, y]) => [x, y]);
    if (shape === 'arcHex') return ARC_HEX_BODY_RING.map(([x, y]) => [x, y]);
    return PORTED_BODY_SHAPES[SHAPE_KEY[shape]].ring.map(([x, y]) => [x, y]);
}

export function shapeFace(shape: EngineShape): FaceProjection {
    if (shape === 'ghost') return { ...GHOST_FACE };
    if (shape === 'arcHex') return { ...ARC_HEX_FACE };
    return { ...PORTED_BODY_SHAPES[SHAPE_KEY[shape]].face };
}

export function interpolatePoints(
    from: readonly Point[],
    to: readonly Point[],
    amount: number,
): Point[] {
    const t = clamp(amount, 0, 1);
    return from.map((point, index) => [
        lerp(point[0], to[index]?.[0] ?? point[0], t),
        lerp(point[1], to[index]?.[1] ?? point[1], t),
    ]);
}

export function ringPath(points: readonly Point[]): string {
    if (!points.length) return '';
    return points.map((point, index) => (
        `${index ? 'L' : 'M'}${point[0].toFixed(2)} ${point[1].toFixed(2)}`
    )).join('') + 'Z';
}

export function centroid(points: readonly Point[]): Point {
    if (!points.length) return [CENTER, CENTER];
    let x = 0;
    let y = 0;
    points.forEach((point) => {
        x += point[0];
        y += point[1];
    });
    return [x / points.length, y / points.length];
}
