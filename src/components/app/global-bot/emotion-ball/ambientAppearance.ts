import type { EngineShape } from './engine/types';

const AMBIENT_SHAPES: readonly EngineShape[] = [
    'bloom', 'prism', 'petal', 'ghost', 'arcHex',
];

const PIGMENT_PALETTE_IDS = [
    'klein',
    'malachite',
    'carmine',
    'aureolin',
    'ruby',
    'tyrian',
    'moonstone',
    'turquoise',
    'kunzite',
    'copper',
    'smoky',
    'celadon',
] as const;

export type PigmentPaletteId = (typeof PIGMENT_PALETTE_IDS)[number];

export interface AmbientAppearanceVariant {
    shape: EngineShape;
    paletteId: PigmentPaletteId;
    flowSeed: number;
    revision: number;
}

export interface AmbientAppearanceBagState {
    shapeBag: EngineShape[];
    paletteBag: PigmentPaletteId[];
    lastShape: EngineShape | null;
    lastPaletteId: PigmentPaletteId | null;
    revision: number;
}

export function createAmbientAppearanceBagState(): AmbientAppearanceBagState {
    return {
        shapeBag: [],
        paletteBag: [],
        lastShape: null,
        lastPaletteId: null,
        revision: 0,
    };
}

function shuffledBag<T>(
    values: readonly T[],
    previous: T | null,
    random: () => number,
): T[] {
    const bag = [...values];
    for (let index = bag.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.min(index, Math.floor(random() * (index + 1)));
        const current = bag[index]!;
        bag[index] = bag[swapIndex]!;
        bag[swapIndex] = current;
    }
    if (previous !== null && bag.length > 1 && bag[0] === previous) {
        const replacement = bag.findIndex((value) => value !== previous);
        const first = bag[0]!;
        bag[0] = bag[replacement]!;
        bag[replacement] = first;
    }
    return bag;
}

export function takeAmbientAppearanceVariant(
    state: AmbientAppearanceBagState,
    random: () => number = Math.random,
    avoid?: Pick<AmbientAppearanceVariant, 'shape' | 'paletteId'>,
): AmbientAppearanceVariant {
    if (!state.shapeBag.length) {
        state.shapeBag.push(...shuffledBag(AMBIENT_SHAPES, state.lastShape, random));
    }
    if (!state.paletteBag.length) {
        state.paletteBag.push(...shuffledBag(
            PIGMENT_PALETTE_IDS,
            state.lastPaletteId,
            random,
        ));
    }

    if (avoid && state.shapeBag.length > 1 && state.shapeBag[0] === avoid.shape) {
        const replacement = state.shapeBag.findIndex((shape) => shape !== avoid.shape);
        const first = state.shapeBag[0]!;
        state.shapeBag[0] = state.shapeBag[replacement]!;
        state.shapeBag[replacement] = first;
    }
    if (
        avoid
        && state.paletteBag.length > 1
        && state.paletteBag[0] === avoid.paletteId
    ) {
        const replacement = state.paletteBag.findIndex((paletteId) => (
            paletteId !== avoid.paletteId
        ));
        const first = state.paletteBag[0]!;
        state.paletteBag[0] = state.paletteBag[replacement]!;
        state.paletteBag[replacement] = first;
    }

    const shape = state.shapeBag.shift() ?? AMBIENT_SHAPES[0]!;
    const paletteId = state.paletteBag.shift() ?? PIGMENT_PALETTE_IDS[0]!;
    state.lastShape = shape;
    state.lastPaletteId = paletteId;
    state.revision += 1;

    return {
        shape,
        paletteId,
        flowSeed: Math.min(0.999999, Math.max(0, random())),
        revision: state.revision,
    };
}
