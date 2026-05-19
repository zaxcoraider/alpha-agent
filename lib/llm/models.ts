// Update model strings against DGrid's live catalog at https://dgrid.ai/models
// Convention follows OpenRouter (provider/model) since DGrid's SDK is forked from theirs
export const MODELS = {
  classifier: 'deepseek/deepseek-chat',
  reasoner: 'anthropic/claude-opus-4',
  balanced: 'anthropic/claude-sonnet-4',
  vision: 'openai/gpt-4o',
} as const;

export type ModelKey = keyof typeof MODELS;
export type ModelId = (typeof MODELS)[ModelKey];

export const AGENT_MODELS: Record<string, ModelId> = {
  news: MODELS.classifier,
  nft: MODELS.classifier,
  ideas: MODELS.reasoner,
  memes: MODELS.classifier,
  x_events: MODELS.classifier,
  dev_events: MODELS.classifier,
  prediction: MODELS.reasoner,
  chat_default: MODELS.balanced,
};

export const CHAT_MODEL_OPTIONS: { id: ModelId; label: string }[] = [
  { id: MODELS.balanced, label: 'Claude Sonnet 4 (balanced)' },
  { id: MODELS.reasoner, label: 'Claude Opus 4 (reasoner)' },
  { id: MODELS.classifier, label: 'DeepSeek Chat (fast)' },
  { id: MODELS.vision, label: 'GPT-4o (vision)' },
];
