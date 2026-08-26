export interface ScheduledEmotionEngine {
    onAnimationFrame(now: number): void;
}

export const EMOTION_ENGINE_MAX_FPS = 60;

const FRAME_INTERVAL_MS = 1000 / EMOTION_ENGINE_MAX_FPS;
const FRAME_TIMESTAMP_TOLERANCE_MS = 0.5;
const activeEngines = new Set<ScheduledEmotionEngine>();
let animationFrame: number | null = null;
let lastRenderedAt: number | null = null;

function tick(now: number): void {
    animationFrame = null;
    const elapsed = lastRenderedAt === null ? Number.POSITIVE_INFINITY : now - lastRenderedAt;
    if (elapsed + FRAME_TIMESTAMP_TOLERANCE_MS >= FRAME_INTERVAL_MS) {
        activeEngines.forEach((engine) => engine.onAnimationFrame(now));
        lastRenderedAt = Number.isFinite(elapsed)
            ? now - (elapsed % FRAME_INTERVAL_MS)
            : now;
    }
    if (activeEngines.size) animationFrame = window.requestAnimationFrame(tick);
}

export function activateEngine(engine: ScheduledEmotionEngine): void {
    activeEngines.add(engine);
    if (animationFrame === null) animationFrame = window.requestAnimationFrame(tick);
}

export function deactivateEngine(engine: ScheduledEmotionEngine): void {
    activeEngines.delete(engine);
    if (!activeEngines.size && animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
        animationFrame = null;
    }
    if (!activeEngines.size) lastRenderedAt = null;
}
