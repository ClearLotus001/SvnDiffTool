export function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

export function lerp(from: number, to: number, amount: number): number {
    return from + (to - from) * amount;
}

export function easeInOutCubic(value: number): number {
    const t = clamp(value, 0, 1);
    return t < 0.5
        ? 4 * t * t * t
        : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function parseHex(color: string): [number, number, number] {
    const normalized = color.replace('#', '');
    const expanded = normalized.length === 3
        ? normalized.split('').map((part) => part + part).join('')
        : normalized.padEnd(6, '0').slice(0, 6);
    const value = Number.parseInt(expanded, 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

export function mixColor(from: string, to: string, amount: number): string {
    const a = parseHex(from);
    const b = parseHex(to);
    const t = clamp(amount, 0, 1);
    return `#${a.map((channel, index) => (
        Math.round(lerp(channel, b[index]!, t)).toString(16).padStart(2, '0')
    )).join('')}`;
}
