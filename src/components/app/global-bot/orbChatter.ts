export interface OrbChatterRequest {
    lines: readonly string[];
    previousLine: string | null;
    signal: AbortSignal;
}

export interface OrbChatterProvider {
    next: (request: OrbChatterRequest) => Promise<string | null>;
}

type RandomSource = () => number;

export function normalizeOrbChatterLine(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const normalized = value.trim().replace(/\s+/g, ' ');
    return normalized || null;
}

function normalizeOrbChatterLines(value: unknown): string[] {
    if (!Array.isArray(value)) return [];

    const seen = new Set<string>();
    const lines: string[] = [];
    for (const candidate of value) {
        const line = normalizeOrbChatterLine(candidate);
        if (!line || seen.has(line)) continue;
        seen.add(line);
        lines.push(line);
    }
    return lines;
}

function randomIndex(length: number, random: RandomSource): number {
    const sample = Math.min(Math.max(random(), 0), 1 - Number.EPSILON);
    return Math.floor(sample * length);
}

function createLocalOrbChatterProvider(
    random: RandomSource = Math.random,
): OrbChatterProvider {
    return {
        async next({ lines, previousLine, signal }) {
            if (signal.aborted) return null;

            const normalizedLines = normalizeOrbChatterLines(lines);
            const normalizedPrevious = normalizeOrbChatterLine(previousLine);
            const candidates = normalizedPrevious
                ? normalizedLines.filter((line) => line !== normalizedPrevious)
                : normalizedLines;
            if (!candidates.length || signal.aborted) return null;

            return candidates[randomIndex(candidates.length, random)] ?? null;
        },
    };
}

export const localOrbChatterProvider = createLocalOrbChatterProvider();
