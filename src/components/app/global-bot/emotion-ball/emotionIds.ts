const LIFECYCLE_EMOTION_IDS = [
    '00', '01', '02', '03', '04', '05', '06', '07',
] as const;

const SEMANTIC_EMOTION_IDS = [
    '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21',
] as const;

const AGENT_EMOTION_IDS = [
    '30', '31', '32', '33', '34', '35', '36', '37', '38', '39', '40', '41',
] as const;

export const HOVER_VARIATION_EMOTION_IDS = [
    '02', '03', '10', '11', '13', '14', '19', '20',
] as const;

export const EMOTION_IDS = [
    ...LIFECYCLE_EMOTION_IDS,
    ...SEMANTIC_EMOTION_IDS,
    ...AGENT_EMOTION_IDS,
] as const;

export const IDLE_VARIATION_EMOTION_IDS = EMOTION_IDS;

export type LifecycleEmotionId = (typeof LIFECYCLE_EMOTION_IDS)[number];
export type SemanticEmotionId = (typeof SEMANTIC_EMOTION_IDS)[number];
export type AgentEmotionId = (typeof AGENT_EMOTION_IDS)[number];
export type IdleVariationEmotionId = (typeof IDLE_VARIATION_EMOTION_IDS)[number];
export type HoverVariationEmotionId = (typeof HOVER_VARIATION_EMOTION_IDS)[number];
export type EmotionId = (typeof EMOTION_IDS)[number];

const EMOTION_ID_SET = new Set<string>(EMOTION_IDS);
const SEMANTIC_EMOTION_ID_SET = new Set<string>(SEMANTIC_EMOTION_IDS);

export function isEmotionId(value: unknown): value is EmotionId {
    return typeof value === 'string' && EMOTION_ID_SET.has(value);
}

export function isSemanticEmotionId(value: unknown): value is SemanticEmotionId {
    return typeof value === 'string' && SEMANTIC_EMOTION_ID_SET.has(value);
}

export const DEFAULT_EMOTION_ID: EmotionId = '02';
export const DEFAULT_SEMANTIC_EMOTION_ID: SemanticEmotionId = '19';
