export interface ScheduledEmotionEngine {
    onAnimationFrame(now: number): void;
}

const activeEngines = new Set<ScheduledEmotionEngine>();
let animationFrame: number | null = null;

function tick(now: number): void {
    animationFrame = null;
    activeEngines.forEach((engine) => engine.onAnimationFrame(now));
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
}
