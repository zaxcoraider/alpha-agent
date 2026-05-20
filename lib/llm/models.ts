// DGrid model catalog — full list at https://dgrid.ai/models
// All model strings follow provider/model-name convention (OpenRouter-compatible)

export const MODELS = {
  // ── Anthropic ──────────────────────────────────────────────────────────────
  reasoner:   'anthropic/claude-opus-4.7',    // best synthesis, complex reasoning
  balanced:   'anthropic/claude-sonnet-4.6',  // quality + speed balance
  fast_claude:'anthropic/claude-haiku-4.5',   // lightweight Claude tasks

  // ── DeepSeek ───────────────────────────────────────────────────────────────
  classifier: 'deepseek/deepseek-v3.2',       // fast classification & scoring
  fast:       'deepseek/deepseek-v4-flash',   // cheapest/fastest tier
  reasoner_ds:'deepseek/deepseek-r1-0528',    // DeepSeek reasoning chain

  // ── xAI Grok ───────────────────────────────────────────────────────────────
  grok:       'xai/grok-4.20-non-reasoning',  // native X/Twitter real-time access
  grok_think: 'xai/grok-4.20-reasoning',      // Grok with extended reasoning

  // ── Google ─────────────────────────────────────────────────────────────────
  vision:     'google/gemini-2.5-pro',        // multimodal (images, charts)

  // ── OpenAI ─────────────────────────────────────────────────────────────────
  search:     'openai/gpt-4o-search-preview', // OpenAI web-search grounded
} as const;

export type ModelKey = keyof typeof MODELS;
export type ModelId = (typeof MODELS)[ModelKey];

// ── Per-agent model assignments ─────────────────────────────────────────────
export const AGENT_MODELS: Record<string, ModelId> = {
  // Prediction: Sonnet analysts → Opus 4.7 aggregator
  prediction_analyst:    MODELS.balanced,    // claude-sonnet-4.6
  prediction_aggregator: MODELS.reasoner,    // claude-opus-4.7
  prediction_social:     MODELS.grok,        // grok-4.20 for X sentiment

  // Other agents
  news:       MODELS.classifier,   // deepseek-v3.2
  nft:        MODELS.classifier,
  ideas:      MODELS.reasoner,     // claude-opus-4.7 for alpha ideas
  memes:      MODELS.classifier,
  x_events:   MODELS.classifier,
  dev_events: MODELS.classifier,

  // Chat
  chat_default: MODELS.balanced,
};

export const CHAT_MODEL_OPTIONS: { id: ModelId; label: string }[] = [
  { id: MODELS.balanced,    label: 'Claude Sonnet 4.6 (balanced)' },
  { id: MODELS.reasoner,    label: 'Claude Opus 4.7 (best)' },
  { id: MODELS.grok,        label: 'Grok 4.20 (live X data)' },
  { id: MODELS.classifier,  label: 'DeepSeek V3.2 (fast)' },
  { id: MODELS.fast,        label: 'DeepSeek V4 Flash (cheapest)' },
  { id: MODELS.vision,      label: 'Gemini 2.5 Pro (vision)' },
];
