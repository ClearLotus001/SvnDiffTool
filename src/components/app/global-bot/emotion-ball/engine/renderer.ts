import {
    CENTER,
    centroid,
    ringPath,
} from './geometry';
import { clamp } from './motion';
import { PORTED_EYE_HALF } from './portedReference';
import type {
    EyePose,
    Point,
    RenderFrame,
    SurfaceColors,
} from './types';

const SVG_NS = 'http://www.w3.org/2000/svg';
const TAU = Math.PI * 2;
const SILHOUETTE_STEP = 2;
const CONFETTI_COLORS = ['#f9705c', '#5b95f0', '#3fbe86', '#f5b13f', '#9a72ee', '#35c3bd'];
const STAR_GOLD = '#f4c34e';
const INITIAL_SURFACE_COLORS: SurfaceColors = ['#FFFDF8', '#E9E3D8', '#D8D0C4', '#F3EEE5'];
let uniqueId = 0;

function svgElement<K extends keyof SVGElementTagNameMap>(
    tag: K,
    attributes: Record<string, string> = {},
): SVGElementTagNameMap[K] {
    const node = document.createElementNS(SVG_NS, tag);
    Object.entries(attributes).forEach(([name, value]) => node.setAttribute(name, value));
    return node;
}

function randomBetween(min: number, max: number): number {
    return min + Math.random() * (max - min);
}

function round2(value: number): number {
    return Math.round(value * 100) / 100;
}

function starPath(): string {
    const points = Array.from({ length: 10 }, (_, index) => {
        const angle = -Math.PI / 2 + index * Math.PI / 5;
        const radius = index % 2 === 0 ? 1 : 0.42;
        return `${(Math.cos(angle) * radius).toFixed(3)} ${(Math.sin(angle) * radius).toFixed(3)}`;
    });
    return `M${points.join('L')}Z`;
}

interface EyeRenderState {
    node: SVGPathElement;
    ring: readonly Point[];
    center: Point;
    lastFill: string;
}

interface TrailPoint {
    x: number;
    y: number;
    z: number;
    l: number;
}

interface TrailOrbit {
    lam: number;
    lamVel: number;
    tilt: number;
    roll: number;
    rad: number;
    radVel: number;
    follow: number;
    carry: number;
    arc: number;
}

interface TrailState {
    orbit: TrailOrbit;
    radius: number;
    life: number;
    retraction: number;
    history: TrailPoint[];
    orbitMode: boolean;
    hue: number;
    hueSpan: number;
    hueVelocity: number;
    gradient: SVGLinearGradientElement;
    stops: SVGStopElement[];
    back: SVGPathElement;
    front: SVGPathElement;
}

interface TrailPlane {
    tilt: number;
    roll: number;
}

interface ConfettiPiece {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    maxLife: number;
    radius: number;
    rotation: number;
    rotationVelocity: number;
    stretch: number;
    node: SVGGraphicsElement;
}

export class EmotionSvgRenderer {
    readonly svg: SVGSVGElement;
    private readonly defs: SVGDefsElement;
    private readonly bodyGradient: SVGRadialGradientElement;
    private readonly bodyStops: readonly SVGStopElement[];
    private readonly effectsBack: SVGGElement;
    private readonly effectsFront: SVGGElement;
    private readonly bodyGroup: SVGGElement;
    private readonly body: SVGPathElement;
    private readonly leftEye: EyeRenderState;
    private readonly rightEye: EyeRenderState;
    private readonly baseEyeCenters: readonly [Point, Point];
    private readonly sleepNodes: SVGTextElement[];
    private bodyPoints: readonly Point[] = [];
    private silhouetteMinY = 0;
    private silhouetteMaxY = 229;
    private silhouetteRows: Array<readonly [number, number]> = [];
    private lastSurfaceKey = '';
    private surfacePhase = 0;
    private surfacePhaseAt = 0;
    private surfacePhaseInitialized = false;
    private trails: TrailState[] = [];
    private planes: TrailPlane[] = [];
    private planeCount = 4;
    private baseHue = 0;
    private spawnTimes: number[] = [];
    private spawnIndex = 0;
    private wasFast = false;
    private previousYaw = 0;
    private previousNow = 0;
    private orbitNextAt = 0;
    private confetti: ConfettiPiece[] = [];

    constructor(container: HTMLElement, initialEyeRings: readonly [readonly Point[], readonly Point[]]) {
        const instanceId = `cl-ported-emotion-${uniqueId++}`;
        const gradientId = `${instanceId}-body`;
        this.svg = svgElement('svg', {
            viewBox: '-15 -15 259 259',
            width: '100%',
            height: '100%',
            'aria-hidden': 'true',
            'data-engine': 'versora-emotion',
            'data-reference-port': 'emotion-ball-local',
        });
        this.svg.style.display = 'block';
        this.svg.style.overflow = 'visible';

        this.defs = svgElement('defs');
        this.bodyGradient = svgElement('radialGradient', {
            id: gradientId,
            gradientUnits: 'userSpaceOnUse',
            cx: '104',
            cy: '94',
            fx: '88',
            fy: '76',
            r: '158',
        });
        const offsets = ['0%', '36%', '70%', '100%'];
        this.bodyStops = INITIAL_SURFACE_COLORS.map((color, index) => svgElement('stop', {
            offset: offsets[index]!,
            'stop-color': color,
        }));
        this.bodyGradient.append(...this.bodyStops);
        this.defs.appendChild(this.bodyGradient);
        this.svg.appendChild(this.defs);

        this.effectsBack = svgElement('g', {
            'pointer-events': 'none',
            'data-part': 'effects-back',
        });
        this.svg.appendChild(this.effectsBack);

        this.bodyGroup = svgElement('g');
        this.body = svgElement('path', {
            fill: `url(#${gradientId})`,
            stroke: 'none',
            'stroke-width': '2',
            'data-part': 'head',
        });
        this.bodyGroup.appendChild(this.body);
        const buildEye = (ring: readonly Point[], part: string): EyeRenderState => {
            const node = svgElement('path', {
                d: ringPath(ring),
                fill: '#1A1A1A',
                stroke: 'none',
                'stroke-width': '1.6',
                'data-part': part,
            });
            this.bodyGroup.appendChild(node);
            return { node, ring, center: centroid(ring), lastFill: '#1A1A1A' };
        };
        this.leftEye = buildEye(initialEyeRings[0], 'left-eye');
        this.rightEye = buildEye(initialEyeRings[1], 'right-eye');
        this.baseEyeCenters = [
            centroid(initialEyeRings[0]),
            centroid(initialEyeRings[1]),
        ];
        this.svg.appendChild(this.bodyGroup);

        this.effectsFront = svgElement('g', {
            'pointer-events': 'none',
            'data-part': 'effects-front',
        });
        this.svg.appendChild(this.effectsFront);
        this.sleepNodes = Array.from({ length: 3 }, () => {
            const node = svgElement('text', {
                x: '0',
                y: '0',
                fill: '#A8A296',
                opacity: '0',
                'font-family': "'Manrope Variable', 'Noto Sans SC Variable', sans-serif",
                'font-weight': '700',
                'font-style': 'italic',
                'text-anchor': 'middle',
            });
            node.textContent = 'z';
            this.effectsFront.appendChild(node);
            return node;
        });
        container.appendChild(this.svg);
    }

    render(frame: RenderFrame): void {
        this.svg.dataset.shape = frame.shape;
        this.svg.dataset.shapeTarget = frame.shapeTarget;
        if (frame.bodyPoints !== this.bodyPoints) {
            this.bodyPoints = frame.bodyPoints;
            this.body.setAttribute('d', ringPath(frame.bodyPoints));
            this.buildSilhouette(frame.bodyPoints);
        }

        const body = frame.body;
        this.bodyGroup.setAttribute(
            'transform',
            `translate(${round2(CENTER + body.x)} ${round2(CENTER + body.y)}) `
            + `rotate(${round2(body.rotate)}) scale(${round2(body.scale)}) `
            + `translate(${round2(-CENTER)} ${round2(-CENTER)})`,
        );
        this.updateBodySurface(
            frame.now,
            frame.surfaceColors,
            frame.surfaceFlow,
            frame.surfaceSeed,
            frame.staticFrame,
        );
        this.setEye(this.leftEye, frame.leftEye, 0, frame.face, body.yaw);
        this.setEye(this.rightEye, frame.rightEye, 1, frame.face, body.yaw);
        this.updateSleep(frame.now, body.zzz, frame.staticFrame);
        if (frame.staticFrame) {
            this.clearDynamicEffects();
            return;
        }
        const deltaSeconds = this.previousNow
            ? clamp((frame.now - this.previousNow) / 1000, 0.001, 0.05)
            : 1 / 60;
        this.previousNow = frame.now;
        this.updateTrails(frame.now, body.yaw, body.orbit > 0, deltaSeconds);
        this.updateConfetti(deltaSeconds);
    }

    burst(count = 20): void {
        for (let index = 0; index < count && this.confetti.length < 60; index += 1) {
            const angle = (index / count) * TAU + randomBetween(-0.35, 0.35);
            const speed = randomBetween(170, 360);
            const isStar = Math.random() < 0.18;
            const isRound = !isStar && Math.random() < 0.3;
            let node: SVGGraphicsElement;
            if (isStar) {
                node = svgElement('path', { d: starPath(), fill: STAR_GOLD });
            } else if (isRound) {
                node = svgElement('circle', {
                    r: '1',
                    fill: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)]!,
                });
            } else {
                node = svgElement('rect', {
                    x: '-0.5',
                    y: '-0.5',
                    width: '1',
                    height: '1',
                    rx: '0.24',
                    fill: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)]!,
                });
            }
            this.effectsFront.appendChild(node);
            this.confetti.push({
                x: CENTER + Math.cos(angle) * randomBetween(96, 116),
                y: CENTER + Math.sin(angle) * randomBetween(96, 116),
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - randomBetween(20, 75),
                life: 0,
                maxLife: randomBetween(0.45, 0.85),
                radius: isStar ? randomBetween(4, 7) : randomBetween(3.5, 8),
                rotation: randomBetween(0, 360),
                rotationVelocity: randomBetween(-260, 260),
                stretch: !isStar && !isRound ? 1.9 : 1,
                node,
            });
        }
    }

    clearDynamicEffects(): void {
        while (this.trails.length) this.removeTrail(this.trails.length - 1);
        this.confetti.forEach((piece) => piece.node.remove());
        this.confetti = [];
        this.spawnTimes = [];
        this.wasFast = false;
        this.previousYaw = 0;
        this.previousNow = 0;
        this.orbitNextAt = 0;
        this.svg.dataset.trailCount = '0';
        this.svg.dataset.ribbonActive = 'false';
    }

    destroy(): void {
        this.clearDynamicEffects();
        this.svg.remove();
    }

    private buildSilhouette(points: readonly Point[]): void {
        this.silhouetteMinY = Math.min(...points.map((point) => point[1]));
        this.silhouetteMaxY = Math.max(...points.map((point) => point[1]));
        const rowCount = Math.ceil(
            (this.silhouetteMaxY - this.silhouetteMinY) / SILHOUETTE_STEP,
        ) + 1;
        this.silhouetteRows = Array.from({ length: rowCount }, (_, rowIndex) => {
            const y = this.silhouetteMinY + rowIndex * SILHOUETTE_STEP;
            let low = Number.POSITIVE_INFINITY;
            let high = Number.NEGATIVE_INFINITY;
            points.forEach((point, index) => {
                const next = points[(index + 1) % points.length]!;
                if ((point[1] <= y && next[1] >= y) || (next[1] <= y && point[1] >= y)) {
                    const amount = next[1] === point[1] ? 0 : (y - point[1]) / (next[1] - point[1]);
                    const x = point[0] + (next[0] - point[0]) * amount;
                    low = Math.min(low, x);
                    high = Math.max(high, x);
                }
            });
            return low <= high ? [low, high] : [CENTER - 4, CENTER + 4];
        });
    }

    private silhouetteAt(y: number): readonly [number, number] {
        const row = Math.round(
            (clamp(y, this.silhouetteMinY, this.silhouetteMaxY) - this.silhouetteMinY)
            / SILHOUETTE_STEP,
        );
        return this.silhouetteRows[clamp(row, 0, this.silhouetteRows.length - 1)]
            ?? [CENTER - 4, CENTER + 4];
    }

    private updateBodySurface(
        now: number,
        colors: SurfaceColors,
        flow: number,
        seed: number,
        staticFrame: boolean,
    ): void {
        const surfaceKey = colors.join(':');
        if (surfaceKey !== this.lastSurfaceKey) {
            colors.forEach((color, index) => {
                this.bodyStops[index]?.setAttribute('stop-color', color);
            });
            this.lastSurfaceKey = surfaceKey;
        }

        const strength = clamp(flow, 0, 1);
        const seedPhase = ((seed % 1) + 1) % 1;
        const targetPhase = (seedPhase + (
            staticFrame || strength <= 0 ? 0 : now / 52_000
        )) % 1;
        if (staticFrame || strength <= 0 || !this.surfacePhaseInitialized) {
            this.surfacePhase = targetPhase;
            this.surfacePhaseInitialized = true;
        } else {
            const elapsed = clamp((now - this.surfacePhaseAt) / 1000, 0, 0.05);
            const delta = ((targetPhase - this.surfacePhase + 1.5) % 1) - 0.5;
            const maxStep = elapsed / 26;
            this.surfacePhase = (
                this.surfacePhase + clamp(delta, -maxStep, maxStep) + 1
            ) % 1;
        }
        this.surfacePhaseAt = now;
        const phase = this.surfacePhase * TAU;
        const centerX = CENTER + strength * 16 * Math.sin(phase);
        const centerY = CENTER - 14 + strength * 13 * Math.cos(phase * 0.83 + 0.4);
        const focusX = centerX - 18 + strength * 12 * Math.cos(phase * 1.17 + 0.7);
        const focusY = centerY - 16 + strength * 10 * Math.sin(phase * 0.91);
        const radius = 154 + strength * 8 * Math.sin(phase * 0.63 + 1.2);
        const rotation = strength * 9 * Math.sin(phase * 0.72);

        this.bodyGradient.setAttribute('cx', round2(centerX).toString());
        this.bodyGradient.setAttribute('cy', round2(centerY).toString());
        this.bodyGradient.setAttribute('fx', round2(focusX).toString());
        this.bodyGradient.setAttribute('fy', round2(focusY).toString());
        this.bodyGradient.setAttribute('r', round2(radius).toString());
        this.bodyGradient.setAttribute(
            'gradientTransform',
            `translate(${CENTER} ${CENTER}) rotate(${round2(rotation)}) `
            + `scale(1.06 0.96) translate(${-CENTER} ${-CENTER})`,
        );
        this.svg.dataset.surfaceFlow = strength.toFixed(2);
        this.svg.dataset.surfaceStatic = staticFrame ? 'true' : 'false';
    }

    private setEye(
        eye: EyeRenderState,
        pose: EyePose,
        index: 0 | 1,
        face: RenderFrame['face'],
        yaw: number,
    ): void {
        if (pose.ring !== eye.ring) {
            eye.ring = pose.ring;
            eye.node.setAttribute('d', ringPath(pose.ring));
            eye.center = centroid(pose.ring);
        }
        const base = eye.center ?? this.baseEyeCenters[index];
        const open = clamp(pose.open, 0.02, 2.4);
        const scaleY = clamp(pose.scaleY * open * face.eye, 0.02, 2.4);
        const scaleX = pose.scaleX * face.eye;
        const halfHeight = PORTED_EYE_HALF * scaleY + 2;
        let eyeY = CENTER + face.y + (base[1] - CENTER) * face.sy + pose.y + pose.lookY;
        eyeY = clamp(eyeY, this.silhouetteMinY + halfHeight, this.silhouetteMaxY - halfHeight);
        const silhouette = this.silhouetteAt(eyeY);
        const centerX = (silhouette[0] + silhouette[1]) / 2;
        const halfWidth = Math.max((silhouette[1] - silhouette[0]) / 2, 12);
        const offsetX = face.x + (base[0] - CENTER) * face.sx + pose.x + pose.lookX;
        const theta = clamp(offsetX / halfWidth, -1.15, 1.15);
        const longitude = theta + yaw;
        const cosine = Math.cos(longitude);
        if (cosine <= 0.02) {
            eye.node.style.display = 'none';
            return;
        }
        eye.node.style.display = '';
        const eyeX = centerX + halfWidth * Math.sin(longitude) * 0.985;
        const normalizedY = (eyeY - CENTER) / 130;
        const latitudeScale = Math.sqrt(1 - normalizedY * normalizedY * 0.22);
        eye.node.setAttribute(
            'transform',
            `translate(${round2(eyeX)} ${round2(eyeY)}) `
            + `${pose.rotate ? `rotate(${round2(pose.rotate)}) ` : ''}`
            + `scale(${round2(scaleX * cosine)} ${round2(scaleY * latitudeScale)}) `
            + `translate(${round2(-base[0])} ${round2(-base[1])})`,
        );
        if (pose.color !== eye.lastFill) {
            eye.node.setAttribute('fill', pose.color);
            eye.lastFill = pose.color;
        }
    }

    private updateSleep(now: number, strength: number, staticFrame: boolean): void {
        this.sleepNodes.forEach((node, index) => {
            if (strength <= 0 || staticFrame) {
                node.setAttribute('opacity', staticFrame && strength > 0 && index === 0 ? '0.62' : '0');
                if (staticFrame && strength > 0 && index === 0) {
                    node.setAttribute('font-size', '16');
                    node.setAttribute('transform', 'translate(190 35) rotate(-10)');
                }
                return;
            }
            const progress = (now * 0.00033 + index / 3) % 1;
            const opacity = (progress < 0.18
                ? progress / 0.18
                : 1 - (progress - 0.18) / 0.82) * 0.8 * strength;
            node.setAttribute('opacity', opacity.toFixed(3));
            node.setAttribute('font-size', (12 + progress * 11).toFixed(1));
            node.setAttribute(
                'transform',
                `translate(${round2(180 + progress * 34 + 4 * Math.sin(progress * 9))} `
                + `${round2(48 - progress * 42)}) rotate(${round2(-10 + progress * 14)})`,
            );
        });
    }

    private makePlanes(): void {
        const count = Math.random() < 0.45 ? 2 : 3;
        const baseRoll = randomBetween(-0.9, 0.9);
        this.planes = Array.from({ length: count }, (_, index) => ({
            tilt: randomBetween(0.16, 0.72),
            roll: baseRoll + index * (Math.PI / count) + randomBetween(-0.15, 0.15),
        }));
        this.planeCount = Math.round(randomBetween(4, 6));
        this.baseHue = randomBetween(0, 360);
        this.spawnIndex = 0;
    }

    private orbitPoint(orbit: TrailOrbit, longitude: number): TrailPoint {
        const horizontal = orbit.rad * Math.sin(longitude);
        const vertical = -orbit.rad * Math.cos(longitude) * Math.sin(orbit.tilt);
        const cosine = Math.cos(orbit.roll);
        const sine = Math.sin(orbit.roll);
        return {
            x: CENTER + horizontal * cosine - vertical * sine,
            y: CENTER + horizontal * sine + vertical * cosine,
            z: Math.cos(longitude) * Math.cos(orbit.tilt),
            l: longitude,
        };
    }

    private createTrail(config: { orbit: TrailOrbit; radius: number; hue: number; orbitMode?: boolean }): void {
        if (this.trails.length > 8) return;
        const gradientId = `cl-emotion-trail-${uniqueId++}`;
        const gradient = svgElement('linearGradient', {
            id: gradientId,
            gradientUnits: 'userSpaceOnUse',
        });
        const stops = Array.from({ length: 5 }, (_, index) => {
            const stop = svgElement('stop', { offset: (index / 4).toFixed(3) });
            gradient.appendChild(stop);
            return stop;
        });
        this.defs.appendChild(gradient);
        const fill = `url(#${gradientId})`;
        const back = svgElement('path', {
            stroke: 'none', fill, opacity: '0', 'data-part': 'trail-back',
        });
        const front = svgElement('path', {
            stroke: 'none', fill, opacity: '0', 'data-part': 'trail-front',
        });
        this.effectsBack.appendChild(back);
        this.effectsFront.appendChild(front);
        this.trails.push({
            orbit: config.orbit,
            radius: config.radius,
            life: 0,
            retraction: 0,
            history: [],
            orbitMode: config.orbitMode === true,
            hue: config.hue,
            hueSpan: randomBetween(45, 95) * (Math.random() < 0.5 ? 1 : -1),
            hueVelocity: randomBetween(18, 42) * (Math.random() < 0.5 ? 1 : -1),
            gradient,
            stops,
            back,
            front,
        });
    }

    private spawnTrail(longitude: number, direction: number): void {
        const plane = this.planes[this.spawnIndex % this.planes.length];
        if (!plane) return;
        const tierStep = 38 / Math.max(this.planeCount - 1, 1);
        const radius = this.planeCount <= 3
            ? randomBetween(8, 10.5)
            : this.planeCount === 4 ? randomBetween(6.6, 8.6) : randomBetween(5.6, 7.4);
        this.createTrail({
            orbit: {
                lam: longitude,
                lamVel: direction * randomBetween(0.5, 1.1),
                tilt: plane.tilt + randomBetween(-0.04, 0.04),
                roll: plane.roll + randomBetween(-0.05, 0.05),
                rad: 116 + this.spawnIndex * tierStep + randomBetween(-1.5, 1.5),
                radVel: randomBetween(0, 2.5),
                follow: randomBetween(0.74, 0.94),
                carry: 0,
                arc: randomBetween(2.2, 3.4),
            },
            radius,
            hue: this.baseHue + 360 * this.spawnIndex / Math.max(this.planeCount, 1)
                + randomBetween(-14, 14),
        });
        this.spawnIndex += 1;
    }

    private spawnOrbit(index: number): void {
        this.createTrail({
            orbitMode: true,
            orbit: {
                lam: randomBetween(0, TAU),
                lamVel: (Math.random() < 0.5 ? -1 : 1) * randomBetween(1.7, 2.3),
                tilt: randomBetween(0.1, 0.22),
                roll: randomBetween(-0.12, 0.12),
                rad: 124 + index * 16,
                radVel: 0,
                follow: 0.8,
                carry: 0,
                arc: randomBetween(2.4, 3.2),
            },
            radius: randomBetween(5.5, 7),
            hue: randomBetween(0, 360),
        });
    }

    private buildTrail(points: readonly TrailPoint[], width: number): { front: string; back: string } {
        const normalX: number[] = [];
        const normalY: number[] = [];
        points.forEach((_point, index) => {
            const previous = points[index > 0 ? index - 1 : 0]!;
            const next = points[index < points.length - 1 ? index + 1 : points.length - 1]!;
            let dx = next.x - previous.x;
            let dy = next.y - previous.y;
            const magnitude = Math.hypot(dx, dy) || 1;
            dx /= magnitude;
            dy /= magnitude;
            const halfWidth = width * (0.5 + (index / (points.length - 1)) * 0.5) / 2;
            normalX.push(-dy * halfWidth);
            normalY.push(dx * halfWidth);
        });
        const cap = (index: number): string => {
            const halfWidth = Math.max(Math.hypot(normalX[index]!, normalY[index]!), 0.2);
            return `A${round2(halfWidth)} ${round2(halfWidth)} 0 0 0 `;
        };
        const segment = (start: number, end: number): string => {
            let path = '';
            for (let index = start; index <= end; index += 1) {
                path += `${index === start ? 'M' : 'L'}${round2(points[index]!.x + normalX[index]!)} `
                    + `${round2(points[index]!.y + normalY[index]!)}`;
            }
            path += end === points.length - 1 ? cap(end) : 'L';
            for (let index = end; index >= start; index -= 1) {
                path += `${index === end ? '' : 'L'}${round2(points[index]!.x - normalX[index]!)} `
                    + `${round2(points[index]!.y - normalY[index]!)}`;
            }
            if (start === 0) {
                path += `${cap(0)}${round2(points[0]!.x + normalX[0]!)} `
                    + `${round2(points[0]!.y + normalY[0]!)}`;
            }
            return `${path}Z`;
        };
        let front = '';
        let back = '';
        let cursor = 0;
        while (cursor < points.length) {
            const isFront = points[cursor]!.z >= 0;
            let end = cursor;
            while (end + 1 < points.length && (points[end + 1]!.z >= 0) === isFront) end += 1;
            const segmentStart = Math.max(cursor - 1, 0);
            const segmentEnd = Math.min(end + 1, points.length - 1);
            if (segmentEnd > segmentStart) {
                const path = segment(segmentStart, segmentEnd);
                if (isFront) front += path;
                else back += path;
            }
            cursor = end + 1;
        }
        return { front, back };
    }

    private removeTrail(index: number): void {
        const trail = this.trails[index];
        if (!trail) return;
        trail.back.remove();
        trail.front.remove();
        trail.gradient.remove();
        this.trails.splice(index, 1);
    }

    private updateTrails(
        now: number,
        yaw: number,
        orbitWanted: boolean,
        deltaSeconds: number,
    ): void {
        let deltaYaw = yaw - this.previousYaw;
        if (!Number.isFinite(deltaYaw) || Math.abs(deltaYaw) > 1.2) deltaYaw = 0;
        this.previousYaw = yaw;
        const velocity = deltaYaw / deltaSeconds;
        const fast = Math.abs(velocity) >= 0.9;
        const direction = velocity >= 0 ? 1 : -1;
        if (fast && !this.wasFast) {
            this.makePlanes();
            this.spawnTimes = Array.from(
                { length: this.planeCount },
                (_, index) => now + index * randomBetween(55, 105),
            );
        }
        if (!fast) this.spawnTimes = [];
        this.wasFast = fast;
        if (Math.abs(velocity) >= 5) {
            while (this.spawnTimes.length && now >= this.spawnTimes[0]!) {
                this.spawnTimes.shift();
                this.spawnTrail(yaw - randomBetween(0, 0.18) * direction, direction);
            }
        }
        if (orbitWanted && now >= this.orbitNextAt) {
            const orbitCount = this.trails.filter((trail) => trail.orbitMode).length;
            if (orbitCount < 2) this.spawnOrbit(orbitCount);
            this.orbitNextAt = now + 700;
        }

        for (let index = this.trails.length - 1; index >= 0; index -= 1) {
            const trail = this.trails[index]!;
            trail.life += deltaSeconds;
            const retract = trail.orbitMode ? !orbitWanted : (!fast || trail.life > 5);
            trail.retraction = clamp(
                trail.retraction + (retract ? deltaSeconds / 0.5 : -deltaSeconds / 0.35),
                0,
                1,
            );
            if (retract && trail.retraction >= 1) {
                this.removeTrail(index);
                continue;
            }
            const orbit = trail.orbit;
            if (trail.orbitMode) {
                orbit.lam += orbit.lamVel * deltaSeconds + deltaYaw * orbit.follow;
            } else if (fast) {
                orbit.carry = velocity * orbit.follow;
                orbit.lam += deltaYaw * orbit.follow + orbit.lamVel * deltaSeconds;
            } else {
                orbit.lam += (orbit.carry + orbit.lamVel) * deltaSeconds;
                orbit.carry *= Math.exp(-2.6 * deltaSeconds);
                orbit.lamVel *= Math.exp(-2.6 * deltaSeconds);
            }
            orbit.rad += orbit.radVel * deltaSeconds;
            const history = trail.history;
            const lastLongitude = history.length
                ? history[history.length - 1]!.l
                : orbit.lam - 0.001 * direction;
            const deltaLongitude = orbit.lam - lastLongitude;
            const steps = Math.min(Math.ceil(Math.abs(deltaLongitude) / 0.09), 24);
            for (let step = 1; step <= steps; step += 1) {
                history.push(this.orbitPoint(
                    orbit,
                    lastLongitude + deltaLongitude * step / steps,
                ));
            }
            if (!history.length) history.push(this.orbitPoint(orbit, orbit.lam));
            const smooth = trail.retraction * trail.retraction * (3 - 2 * trail.retraction);
            const span = orbit.arc * (1 - smooth);
            while (history.length > 2 && Math.abs(orbit.lam - history[0]!.l) > span) history.shift();
            const excess = Math.abs(orbit.lam - history[0]!.l) - span;
            if (history.length >= 2 && excess > 0) {
                const longitude = history[0]!.l
                    + (orbit.lam - history[0]!.l >= 0 ? 1 : -1) * excess;
                history[0] = this.orbitPoint(orbit, longitude);
            }
            if (history.length > 48) history.splice(0, history.length - 48);
            const headDepth = Math.cos(orbit.lam) * Math.cos(orbit.tilt);
            const perspective = 0.72 + 0.28 * clamp(headDepth, 0, 1);
            let growth = Math.min(trail.life / 0.34, 1);
            growth = growth * growth * (3 - 2 * growth);
            const width = trail.radius * perspective * 1.7 * growth
                * (1 - 0.72 * trail.retraction * trail.retraction);
            const opacity = Math.min(trail.life / 0.26, 1).toFixed(3);
            if (history.length < 2 || width < 0.5) {
                trail.back.setAttribute('opacity', '0');
                trail.front.setAttribute('opacity', '0');
                continue;
            }
            const paths = this.buildTrail(history, width);
            trail.back.setAttribute('d', paths.back);
            trail.front.setAttribute('d', paths.front);
            trail.back.setAttribute('opacity', opacity);
            trail.front.setAttribute('opacity', opacity);
            const hue = trail.hue + trail.hueVelocity * trail.life;
            trail.stops.forEach((stop, stopIndex) => {
                const fraction = stopIndex / (trail.stops.length - 1);
                const stopHue = hue + fraction * trail.hueSpan;
                stop.setAttribute(
                    'stop-color',
                    `hsl(${(((stopHue % 360) + 360) % 360).toFixed(0)} 56% `
                    + `${(56 + 11 * fraction).toFixed(0)}%)`,
                );
            });
            const tail = history[0]!;
            const head = history[history.length - 1]!;
            trail.gradient.setAttribute('x1', tail.x.toFixed(1));
            trail.gradient.setAttribute('y1', tail.y.toFixed(1));
            trail.gradient.setAttribute('x2', head.x.toFixed(1));
            trail.gradient.setAttribute('y2', head.y.toFixed(1));
        }
        this.svg.dataset.trailCount = String(this.trails.length);
        this.svg.dataset.ribbonActive = this.trails.some((trail) => (
            Number(trail.back.getAttribute('opacity')) > 0
            || Number(trail.front.getAttribute('opacity')) > 0
        )) ? 'true' : 'false';
    }

    private updateConfetti(deltaSeconds: number): void {
        for (let index = this.confetti.length - 1; index >= 0; index -= 1) {
            const piece = this.confetti[index]!;
            piece.life += deltaSeconds;
            if (piece.life >= piece.maxLife) {
                piece.node.remove();
                this.confetti.splice(index, 1);
                continue;
            }
            piece.x += piece.vx * deltaSeconds;
            piece.y += piece.vy * deltaSeconds;
            const drag = Math.pow(0.94, 60 * deltaSeconds);
            piece.vx *= drag;
            piece.vy = piece.vy * drag + 40 * deltaSeconds;
            piece.rotation += piece.rotationVelocity * deltaSeconds;
            const progress = piece.life / piece.maxLife;
            const opacity = progress < 0.1
                ? progress / 0.1
                : Math.pow(1 - (progress - 0.1) / 0.9, 1.7);
            const size = Math.max(piece.radius * (1 - 0.4 * progress), 0.5);
            piece.node.setAttribute('opacity', opacity.toFixed(3));
            piece.node.setAttribute(
                'transform',
                `translate(${round2(piece.x)} ${round2(piece.y)}) `
                + `rotate(${round2(piece.rotation)}) `
                + `scale(${round2(size)} ${round2(size * piece.stretch)})`,
            );
        }
    }
}
