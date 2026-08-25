import { useEffect, useRef, useState } from 'react';

import {
    localOrbChatterProvider,
    normalizeOrbChatterLine,
    type OrbChatterProvider,
} from './orbChatter';

const FIRST_DELAY_MIN_MS = 8_000;
const FIRST_DELAY_MAX_MS = 14_000;
const LATER_DELAY_MIN_MS = 24_000;
const LATER_DELAY_MAX_MS = 42_000;
const VISIBLE_DURATION_MS = 6_000;

type RandomSource = () => number;

interface UseOrbChatterOptions {
    enabled: boolean;
    lines: readonly string[];
    provider?: OrbChatterProvider;
    random?: RandomSource;
}

function randomDelay(minimum: number, maximum: number, random: RandomSource): number {
    const sample = Math.min(Math.max(random(), 0), 1 - Number.EPSILON);
    return minimum + sample * (maximum - minimum);
}

/**
 * Schedules non-essential local chatter while the orb is in a safe ambient state.
 * A generation guard complements AbortSignal so even providers that cannot abort
 * immediately cannot reveal a stale line after the gate closes.
 */
export function useOrbChatter({
    enabled,
    lines,
    provider = localOrbChatterProvider,
    random = Math.random,
}: UseOrbChatterOptions): string | null {
    const [currentLine, setCurrentLine] = useState<string | null>(null);
    const previousLineRef = useRef<string | null>(null);
    const generationRef = useRef(0);
    const linesRef = useRef(lines);
    // Resting appearance changes re-render the root every few seconds. Key the
    // effect by pool content so an equivalent translated array cannot starve
    // the longer first-line timer by continually restarting it.
    const linesKey = lines.join('\u001f');
    linesRef.current = lines;

    useEffect(() => {
        const generation = ++generationRef.current;
        let showTimer: number | null = null;
        let hideTimer: number | null = null;
        let requestController: AbortController | null = null;
        let disposed = false;

        const isCurrent = () => !disposed && generationRef.current === generation;
        const clearTimers = () => {
            if (showTimer !== null) window.clearTimeout(showTimer);
            if (hideTimer !== null) window.clearTimeout(hideTimer);
            showTimer = null;
            hideTimer = null;
        };

        const scheduleAttempt = (first: boolean) => {
            if (!isCurrent()) return;
            const minimum = first ? FIRST_DELAY_MIN_MS : LATER_DELAY_MIN_MS;
            const maximum = first ? FIRST_DELAY_MAX_MS : LATER_DELAY_MAX_MS;
            showTimer = window.setTimeout(async () => {
                showTimer = null;
                const controller = new AbortController();
                requestController = controller;

                try {
                    const candidate = await provider.next({
                        lines: linesRef.current,
                        previousLine: previousLineRef.current,
                        signal: controller.signal,
                    });
                    if (!isCurrent() || controller.signal.aborted) return;

                    const line = normalizeOrbChatterLine(candidate);
                    if (!line || line === previousLineRef.current) {
                        scheduleAttempt(false);
                        return;
                    }

                    previousLineRef.current = line;
                    setCurrentLine(line);
                    hideTimer = window.setTimeout(() => {
                        hideTimer = null;
                        if (!isCurrent()) return;
                        setCurrentLine(null);
                        scheduleAttempt(false);
                    }, VISIBLE_DURATION_MS);
                } catch {
                    if (isCurrent() && !controller.signal.aborted) {
                        scheduleAttempt(false);
                    }
                } finally {
                    if (requestController === controller) requestController = null;
                }
            }, randomDelay(minimum, maximum, random));
        };

        setCurrentLine(null);
        if (enabled && linesRef.current.length > 0) scheduleAttempt(true);

        return () => {
            disposed = true;
            generationRef.current += 1;
            clearTimers();
            requestController?.abort();
        };
    }, [enabled, linesKey, provider, random]);

    return enabled ? currentLine : null;
}
