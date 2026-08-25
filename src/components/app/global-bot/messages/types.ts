export type GlobalBotMessageSource = 'ambient' | 'diff-summary' | 'validation' | 'update' | 'ai';
export type GlobalBotMessageDelivery = 'ambient' | 'prompt';
export type GlobalBotMessageMood = 'attentive' | 'working' | 'celebrating';
export type GlobalBotMessageTagTone = 'positive' | 'negative' | 'warning' | 'info';

export interface GlobalBotMessageTag {
  label: string;
  value: string | number;
  tone: GlobalBotMessageTagTone;
}

export interface GlobalBotMessageAction {
  label: string;
  onClick: () => void;
}

export interface GlobalBotMessageProgress {
  label: string;
  value: number;
}

export interface GlobalBotMessage {
  id: string;
  source: GlobalBotMessageSource;
  delivery: GlobalBotMessageDelivery;
  priority: number;
  mood: GlobalBotMessageMood;
  text: string;
  tags?: readonly GlobalBotMessageTag[];
  action?: GlobalBotMessageAction;
  progress?: GlobalBotMessageProgress;
}
