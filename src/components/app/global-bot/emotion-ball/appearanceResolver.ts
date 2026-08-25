export type EmotionBallTheme = 'light' | 'dark';

import type {
    AmbientAppearanceVariant,
    PigmentPaletteId,
} from './ambientAppearance';
import type { EmotionId } from './emotionIds';
import type {
    EngineAppearance,
    EngineShape,
    SurfaceColors,
} from './engine/types';

const GEM_EMOTIONS = new Set<EmotionId>([
    '03', '13', '16', '30', '32', '36', '37', '40',
]);
const WEDGE_EMOTIONS = new Set<EmotionId>([
    '11', '17', '18', '20', '21', '34', '38', '41',
]);
const DANGER_EMOTIONS = new Set<EmotionId>(['17', '21', '34', '38']);
const POSITIVE_EMOTIONS = new Set<EmotionId>(['10', '13', '19', '33']);
const BLUSH_EMOTIONS = new Set<EmotionId>(['14']);
const QUIET_EMOTIONS = new Set<EmotionId>(['00', '04', '06', '12', '15', '41']);

interface ThemeAppearance {
    tint: string;
    tintMix: number;
    eyeColor: string;
    surfaceColors: SurfaceColors;
    surfaceFlow: number;
}

type SemanticPaletteKey =
    | 'neutral'
    | 'cognitive'
    | 'positive'
    | 'danger'
    | 'blush'
    | 'quiet';

const THEME_APPEARANCE: Record<
    EmotionBallTheme,
    Record<SemanticPaletteKey, ThemeAppearance>
> = {
    light: {
        neutral: {
            tint: '#E9E3D8', tintMix: 0.2, eyeColor: '#17181B', surfaceFlow: 0,
            surfaceColors: ['#FFFDF8', '#E9E3D8', '#D8D0C4', '#F3EEE5'],
        },
        cognitive: {
            tint: '#007BA7', tintMix: 0.4, eyeColor: '#101820', surfaceFlow: 0,
            surfaceColors: ['#A6DCEB', '#49A9C6', '#007BA7', '#63BED5'],
        },
        positive: {
            tint: '#009B77', tintMix: 0.32, eyeColor: '#102019', surfaceFlow: 0,
            surfaceColors: ['#B5E8D7', '#55C5A5', '#009B77', '#74D1B8'],
        },
        danger: {
            tint: '#E34234', tintMix: 0.7, eyeColor: '#230906', surfaceFlow: 0,
            surfaceColors: ['#FFC2B8', '#F17865', '#E34234', '#F0967F'],
        },
        blush: {
            tint: '#E0115F', tintMix: 0.34, eyeColor: '#240A15', surfaceFlow: 0,
            surfaceColors: ['#FFC4D9', '#F26C9D', '#E0115F', '#F58BB1'],
        },
        quiet: {
            tint: '#8B80B6', tintMix: 0.28, eyeColor: '#181620', surfaceFlow: 0,
            surfaceColors: ['#DDD7EF', '#AAA0CD', '#8B80B6', '#C2B9DE'],
        },
    },
    dark: {
        neutral: {
            tint: '#002FA7', tintMix: 0.4, eyeColor: '#FFF9ED', surfaceFlow: 0,
            surfaceColors: ['#315AC5', '#002FA7', '#0A1D58', '#163C9C'],
        },
        cognitive: {
            tint: '#002FA7', tintMix: 0.68, eyeColor: '#FFF9ED', surfaceFlow: 0,
            surfaceColors: ['#2778B5', '#005E8A', '#002FA7', '#0B2D6F'],
        },
        positive: {
            tint: '#009B77', tintMix: 0.5, eyeColor: '#FFF9ED', surfaceFlow: 0,
            surfaceColors: ['#2DBB91', '#009B77', '#006B54', '#16483D'],
        },
        danger: {
            tint: '#E34234', tintMix: 0.74, eyeColor: '#FFF9ED', surfaceFlow: 0,
            surfaceColors: ['#E96355', '#E34234', '#A51F22', '#65161A'],
        },
        blush: {
            tint: '#960018', tintMix: 0.56, eyeColor: '#FFF9ED', surfaceFlow: 0,
            surfaceColors: ['#DB4775', '#B9154C', '#960018', '#620C29'],
        },
        quiet: {
            tint: '#630330', tintMix: 0.44, eyeColor: '#FFF9ED', surfaceFlow: 0,
            surfaceColors: ['#9562A6', '#70417E', '#630330', '#3E173B'],
        },
    },
};

const PIGMENT_APPEARANCE: Record<
    EmotionBallTheme,
    Record<PigmentPaletteId, ThemeAppearance>
> = {
    light: {
        klein: {
            tint: '#002FA7', tintMix: 0.78, eyeColor: '#FFF9ED', surfaceFlow: 0.82,
            surfaceColors: ['#4D7CFF', '#002FA7', '#120A8F', '#007BA7'],
        },
        malachite: {
            tint: '#009B77', tintMix: 0.64, eyeColor: '#071A14', surfaceFlow: 0.74,
            surfaceColors: ['#75E6B4', '#0BDA51', '#009B77', '#40826D'],
        },
        carmine: {
            tint: '#E34234', tintMix: 0.7, eyeColor: '#230906', surfaceFlow: 0.72,
            surfaceColors: ['#FFB0A2', '#F26A55', '#E34234', '#D32955'],
        },
        aureolin: {
            tint: '#F4C34E', tintMix: 0.66, eyeColor: '#211A04', surfaceFlow: 0.68,
            surfaceColors: ['#FFF4A3', '#FDEE00', '#F4C34E', '#ED872D'],
        },
        ruby: {
            tint: '#E0115F', tintMix: 0.66, eyeColor: '#240A15', surfaceFlow: 0.74,
            surfaceColors: ['#FFB0CA', '#EE5B8B', '#E0115F', '#B81952'],
        },
        tyrian: {
            tint: '#630330', tintMix: 0.72, eyeColor: '#FFF9ED', surfaceFlow: 0.78,
            surfaceColors: ['#B384D7', '#8B4EB0', '#76206E', '#630330'],
        },
        moonstone: {
            tint: '#AFCFD3', tintMix: 0.58, eyeColor: '#18212B', surfaceFlow: 0.66,
            surfaceColors: ['#F7F1E8', '#D7D0E6', '#AFCFD3', '#8795AD'],
        },
        turquoise: {
            tint: '#078B8B', tintMix: 0.62, eyeColor: '#082425', surfaceFlow: 0.78,
            surfaceColors: ['#B5F1E8', '#58D5C7', '#159E9B', '#0C5662'],
        },
        kunzite: {
            tint: '#9569C4', tintMix: 0.6, eyeColor: '#251431', surfaceFlow: 0.72,
            surfaceColors: ['#F0D9FF', '#C89BE8', '#9569C4', '#5C3B7A'],
        },
        copper: {
            tint: '#B86237', tintMix: 0.66, eyeColor: '#2A130D', surfaceFlow: 0.64,
            surfaceColors: ['#F4C099', '#D48452', '#A45134', '#5A2D2C'],
        },
        smoky: {
            tint: '#786E67', tintMix: 0.58, eyeColor: '#191719', surfaceFlow: 0.5,
            surfaceColors: ['#E3DDD7', '#B7ADA4', '#81766F', '#4A4547'],
        },
        celadon: {
            tint: '#6D9D82', tintMix: 0.58, eyeColor: '#102018', surfaceFlow: 0.6,
            surfaceColors: ['#DCE9DC', '#ABC9B2', '#73A48B', '#3E6654'],
        },
    },
    dark: {
        klein: {
            tint: '#002FA7', tintMix: 0.82, eyeColor: '#FFF9ED', surfaceFlow: 0.78,
            surfaceColors: ['#3564E8', '#002FA7', '#120A8F', '#0B5F83'],
        },
        malachite: {
            tint: '#009B77', tintMix: 0.7, eyeColor: '#FFF9ED', surfaceFlow: 0.7,
            surfaceColors: ['#34C990', '#009B77', '#006B54', '#163F35'],
        },
        carmine: {
            tint: '#E34234', tintMix: 0.76, eyeColor: '#FFF9ED', surfaceFlow: 0.68,
            surfaceColors: ['#E96355', '#E34234', '#B21F3D', '#720C27'],
        },
        aureolin: {
            tint: '#E6B83E', tintMix: 0.7, eyeColor: '#211A04', surfaceFlow: 0.64,
            surfaceColors: ['#F9E887', '#F4D44D', '#E6B83E', '#D47A25'],
        },
        ruby: {
            tint: '#C80E55', tintMix: 0.72, eyeColor: '#FFF9ED', surfaceFlow: 0.7,
            surfaceColors: ['#D94F7F', '#C80E55', '#960018', '#620C29'],
        },
        tyrian: {
            tint: '#630330', tintMix: 0.74, eyeColor: '#FFF9ED', surfaceFlow: 0.74,
            surfaceColors: ['#9362BA', '#743991', '#630330', '#3E173B'],
        },
        moonstone: {
            tint: '#8795AD', tintMix: 0.68, eyeColor: '#101820', surfaceFlow: 0.62,
            surfaceColors: ['#E2E7EA', '#BBC5D2', '#8D9DB3', '#66758E'],
        },
        turquoise: {
            tint: '#087B7C', tintMix: 0.7, eyeColor: '#0B2022', surfaceFlow: 0.74,
            surfaceColors: ['#48C8BD', '#139C93', '#087477', '#143F4C'],
        },
        kunzite: {
            tint: '#7751A6', tintMix: 0.68, eyeColor: '#21152C', surfaceFlow: 0.68,
            surfaceColors: ['#D4B7EE', '#A67BD2', '#7751A6', '#46315F'],
        },
        copper: {
            tint: '#9A5436', tintMix: 0.7, eyeColor: '#190C09', surfaceFlow: 0.6,
            surfaceColors: ['#D79A6A', '#B5683F', '#82472F', '#4B2928'],
        },
        smoky: {
            tint: '#6C6460', tintMix: 0.66, eyeColor: '#0D0D0F', surfaceFlow: 0.46,
            surfaceColors: ['#AFA8A2', '#827973', '#575256', '#302E34'],
        },
        celadon: {
            tint: '#5E8773', tintMix: 0.66, eyeColor: '#102019', surfaceFlow: 0.58,
            surfaceColors: ['#BBD1C0', '#89AD99', '#5E8773', '#365346'],
        },
    },
};

export function resolveEmotionBallShape(emotionId: EmotionId): EngineShape {
    if (GEM_EMOTIONS.has(emotionId)) return 'prism';
    if (WEDGE_EMOTIONS.has(emotionId)) return 'petal';
    return 'bloom';
}

function paletteKey(emotionId: EmotionId): SemanticPaletteKey {
    if (DANGER_EMOTIONS.has(emotionId)) return 'danger';
    if (POSITIVE_EMOTIONS.has(emotionId)) return 'positive';
    if (BLUSH_EMOTIONS.has(emotionId)) return 'blush';
    if (QUIET_EMOTIONS.has(emotionId)) return 'quiet';
    if (GEM_EMOTIONS.has(emotionId)) return 'cognitive';
    return 'neutral';
}

export interface ResolvedEmotionBallAppearance extends EngineAppearance {
    key: string;
}

export function resolveEmotionBallAppearance(
    emotionId: EmotionId,
    theme: EmotionBallTheme,
    ambientVariant?: AmbientAppearanceVariant,
): ResolvedEmotionBallAppearance {
    const semanticPalette = paletteKey(emotionId);
    const shape = ambientVariant?.shape ?? resolveEmotionBallShape(emotionId);
    const palette = ambientVariant
        ? PIGMENT_APPEARANCE[theme][ambientVariant.paletteId]
        : THEME_APPEARANCE[theme][semanticPalette];
    const surfaceSeed = ambientVariant?.flowSeed ?? 0;
    const identity = ambientVariant
        ? `ambient:${ambientVariant.paletteId}:${ambientVariant.revision}`
        : `semantic:${semanticPalette}`;
    return {
        ...palette,
        shape,
        surfaceSeed,
        duration: 440,
        key: [
            theme,
            identity,
            shape,
            palette.tint,
            palette.tintMix,
            palette.eyeColor,
            palette.surfaceColors.join(','),
            palette.surfaceFlow,
            surfaceSeed.toFixed(6),
        ].join(':'),
    };
}
