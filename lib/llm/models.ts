// DGrid model catalog — full list at https://dgrid.ai/models
// All model strings follow provider/model-name convention (OpenRouter-compatible)

export const MODELS = {
  // ── Anthropic ──────────────────────────────────────────────────────────────
  reasoner:    'anthropic/claude-opus-4.7',
  balanced:    'anthropic/claude-sonnet-4.6',
  fast_claude: 'anthropic/claude-haiku-4.5',

  // ── DeepSeek ───────────────────────────────────────────────────────────────
  classifier:  'deepseek/deepseek-v3.2',
  fast:        'deepseek/deepseek-v4-flash',
  reasoner_ds: 'deepseek/deepseek-r1-0528',

  // ── xAI Grok ───────────────────────────────────────────────────────────────
  grok:        'xai/grok-4.20-non-reasoning',
  grok_think:  'xai/grok-4.20-reasoning',

  // ── Google ─────────────────────────────────────────────────────────────────
  vision:      'google/gemini-2.5-pro',

  // ── OpenAI ─────────────────────────────────────────────────────────────────
  search:      'openai/gpt-4o-search-preview',
} as const;

export type ModelKey = keyof typeof MODELS;
export type ModelId  = (typeof MODELS)[ModelKey];

// ── Per-agent model assignments ─────────────────────────────────────────────
export const AGENT_MODELS: Record<string, string> = {
  prediction_analyst:    MODELS.balanced,
  prediction_aggregator: MODELS.reasoner,
  prediction_social:     MODELS.grok,
  news:       MODELS.classifier,
  nft:        MODELS.classifier,
  ideas:      MODELS.reasoner,
  memes:      MODELS.classifier,
  x_events:   MODELS.classifier,
  dev_events: MODELS.classifier,
  chat_default: MODELS.balanced,
};

// ── Provider-grouped catalog for the Chat UI ────────────────────────────────

export type ProviderModel = {
  id: string;
  label: string;
  desc: string;
};

export type ProviderGroup = {
  provider: string;
  key: string;
  badge: string; // tailwind text color
  models: ProviderModel[];
};

export const PROVIDER_GROUPS: ProviderGroup[] = [
  {
    provider: 'OpenAI',
    key: 'openai',
    badge: 'text-emerald-400',
    models: [
      { id: 'openai/gpt-5-pro',    label: 'GPT-5 Pro',     desc: 'Most capable GPT-5' },
      { id: 'openai/gpt-5',        label: 'GPT-5',         desc: 'Latest GPT-5' },
      { id: 'openai/o3-pro',       label: 'o3 Pro',        desc: 'Best reasoning model' },
      { id: 'openai/o3',           label: 'o3',            desc: 'Strong reasoning' },
      { id: 'openai/o4-mini-high', label: 'o4 Mini High',  desc: 'Fast reasoning' },
      { id: 'openai/gpt-4o',       label: 'GPT-4o',        desc: 'Multimodal' },
      { id: 'openai/gpt-4.1',      label: 'GPT-4.1',       desc: 'Balanced' },
      { id: 'openai/gpt-4.1-mini', label: 'GPT-4.1 Mini',  desc: 'Fast + cheap' },
    ],
  },
  {
    provider: 'Anthropic',
    key: 'anthropic',
    badge: 'text-orange-400',
    models: [
      { id: 'anthropic/claude-opus-4.7',   label: 'Claude Opus 4.7',   desc: 'Best reasoning' },
      { id: 'anthropic/claude-opus-4.6',   label: 'Claude Opus 4.6',   desc: 'Previous Opus' },
      { id: 'anthropic/claude-sonnet-4.6', label: 'Claude Sonnet 4.6', desc: 'Balanced quality+speed' },
      { id: 'anthropic/claude-haiku-4.5',  label: 'Claude Haiku 4.5',  desc: 'Fastest Claude' },
    ],
  },
  {
    provider: 'Google',
    key: 'google',
    badge: 'text-blue-400',
    models: [
      { id: 'google/gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro',   desc: 'Latest, best context' },
      { id: 'google/gemini-2.5-pro',         label: 'Gemini 2.5 Pro',   desc: 'Vision + analysis' },
      { id: 'google/gemini-2.5-flash',       label: 'Gemini 2.5 Flash', desc: 'Fast Gemini' },
    ],
  },
  {
    provider: 'xAI',
    key: 'xai',
    badge: 'text-white',
    models: [
      { id: 'xai/grok-4.20-reasoning',      label: 'Grok 4.20 Reasoning',  desc: 'Deep reasoning + live X' },
      { id: 'xai/grok-4.20-non-reasoning',  label: 'Grok 4.20',            desc: 'Fast, live X/Twitter data' },
      { id: 'x-ai/grok-4.20-multi-agent',   label: 'Grok Multi-Agent',     desc: 'Multi-agent tasks' },
      { id: 'xai/grok-4.3',                label: 'Grok 4.3',             desc: 'Standard Grok' },
    ],
  },
  {
    provider: 'DeepSeek',
    key: 'deepseek',
    badge: 'text-cyan-400',
    models: [
      { id: 'deepseek/deepseek-r1-0528',  label: 'DeepSeek R1',       desc: 'Best quant + math' },
      { id: 'deepseek/deepseek-v4-pro',   label: 'DeepSeek V4 Pro',   desc: 'Latest DeepSeek' },
      { id: 'deepseek/deepseek-v3.2',     label: 'DeepSeek V3.2',     desc: 'Fast classifier' },
      { id: 'deepseek/deepseek-v4-flash', label: 'DeepSeek V4 Flash', desc: 'Cheapest/fastest' },
    ],
  },
  {
    provider: 'Others',
    key: 'others',
    badge: 'text-purple-400',
    models: [
      { id: 'qwen/qwen3-235b-a22b-instruct-2507', label: 'Qwen3 235B',        desc: '235B params, huge knowledge' },
      { id: 'qwen/qwen3-max',                     label: 'Qwen3 Max',         desc: 'Best Qwen' },
      { id: 'moonshotai/kimi-k2-thinking',        label: 'Kimi K2 Thinking',  desc: 'Moonshot thinking model' },
      { id: 'moonshotai/kimi-k2.6',              label: 'Kimi K2.6',          desc: 'Latest Kimi' },
      { id: 'minimax/minimax-m2.7',              label: 'MiniMax M2.7',       desc: 'Latest MiniMax' },
    ],
  },
];

// Flat list of all chat models (for type safety)
export const ALL_CHAT_MODELS = PROVIDER_GROUPS.flatMap((g) => g.models);

// Legacy list kept for backward compat
export const CHAT_MODEL_OPTIONS = [
  { id: MODELS.balanced,   label: 'Claude Sonnet 4.6' },
  { id: MODELS.reasoner,   label: 'Claude Opus 4.7' },
  { id: MODELS.grok,       label: 'Grok 4.20' },
  { id: MODELS.classifier, label: 'DeepSeek V3.2' },
];
