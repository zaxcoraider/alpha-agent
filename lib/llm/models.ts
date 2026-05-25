// DGrid model catalog — verified against master list (May 20 2026, 139 models)
// All model strings follow provider/model-name convention (OpenRouter-compatible)

export const MODELS = {
  // ── Anthropic ──────────────────────────────────────────────────────────────
  reasoner:    'anthropic/claude-opus-4.7',       // synthesis, aggregation, ideas
  balanced:    'anthropic/claude-sonnet-4.6',     // chat default, analyst ensemble
  fast_claude: 'anthropic/claude-haiku-4.5',      // quick Claude tasks

  // ── DeepSeek ───────────────────────────────────────────────────────────────
  // "exacto" = fine-tuned for structured/exact output → best for generateObject
  analyst:     'deepseek/deepseek-v3.1-terminus', // prediction analysts (better than v3.2)
  exacto:      'deepseek/deepseek-v3.1-terminus-exacto', // generateObject calls (structured)
  classifier:  'deepseek/deepseek-v3.2',          // news/nft/meme classification
  fast:        'deepseek/deepseek-v4-flash',       // cheapest + fastest (MiroFish boost LLM)
  reasoner_ds: 'deepseek/deepseek-r1-0528',       // deep math + crypto reasoning

  // ── xAI Grok ───────────────────────────────────────────────────────────────
  grok:        'xai/grok-4.20-non-reasoning',     // live X/Twitter signal (social agent)
  grok_think:  'xai/grok-4.20-reasoning',         // Grok with extended thinking

  // ── Google ─────────────────────────────────────────────────────────────────
  vision:      'google/gemini-2.5-pro',           // vision + long-context tasks
  flash:       'google/gemini-3.5-flash',         // fastest Google model

  // ── OpenAI ─────────────────────────────────────────────────────────────────
  search:      'openai/gpt-4o-search-preview',    // web search grounding
  search_mini: 'openai/gpt-4o-mini-search-preview', // cheaper search

  // ── Qwen ───────────────────────────────────────────────────────────────────
  qwen_fast:   'qwen/qwen3.5-flash',              // fast Chinese LLM

  // ── Chimera (TNG) ──────────────────────────────────────────────────────────
  chimera:     'tng/deepseek-r1t2-chimera',       // R1 reasoning fused with instruction tuning
} as const;

export type ModelKey = keyof typeof MODELS;
export type ModelId  = (typeof MODELS)[ModelKey];

// ── Per-agent model assignments ─────────────────────────────────────────────
// Rule: use exacto variants for all generateObject calls (structured JSON output).
// Reasoning/synthesis tasks get Opus. Live social signals use Grok.
export const AGENT_MODELS: Record<string, string> = {
  // Prediction Tab
  prediction_analyst:    MODELS.exacto,      // 10 parallel generateObject — terminus-exacto optimized for structured JSON
  prediction_aggregator: MODELS.reasoner_ds, // Chief Analyst — r1-0528 deep reasoning for synthesis
  prediction_social:     MODELS.grok,        // live X/Twitter signal

  // Scanners (classification — fast + cheap)
  news:       MODELS.classifier,
  nft:        MODELS.classifier,
  memes:      MODELS.classifier,
  x_events:   MODELS.classifier,
  dev_events: MODELS.classifier,

  // Alpha Ideas (synthesis across all scanners — needs best reasoning)
  ideas:      MODELS.reasoner,

  // Chat default
  chat_default: MODELS.balanced,
};

// ── MiroFish VPS env recommendations ────────────────────────────────────────
// Set these in /tmp/mf.env on the VPS before starting the container.
// Main LLM = agent reasoning during simulation rounds.
// Boost LLM = parallel profile generation (needs speed, not quality).
export const MIROFISH_MODELS = {
  main:  MODELS.grok,          // grok-4.20-non-reasoning — trained on X/Twitter, ideal for social sim
  boost: MODELS.fast,         // deepseek-v4-flash — fastest for parallel profile gen
} as const;

// ── Provider-grouped catalog for the Chat UI ────────────────────────────────

export type ProviderModel = {
  id:    string;
  label: string;
  desc:  string;
};

export type ProviderGroup = {
  provider: string;
  key:      string;
  badge:    string;
  models:   ProviderModel[];
};

export const PROVIDER_GROUPS: ProviderGroup[] = [
  {
    provider: 'OpenAI',
    key:      'openai',
    badge:    'text-emerald-400',
    models: [
      { id: 'openai/gpt-5-pro',              label: 'GPT-5 Pro',          desc: 'Most capable GPT-5' },
      { id: 'openai/gpt-5',                  label: 'GPT-5',              desc: 'Latest GPT-5' },
      { id: 'openai/gpt-5.1-chat',           label: 'GPT-5.1',            desc: 'Next GPT-5 generation' },
      { id: 'openai/gpt-5.2-pro',            label: 'GPT-5.2 Pro',        desc: 'Advanced GPT-5.2' },
      { id: 'openai/o3-pro',                 label: 'o3 Pro',             desc: 'Best reasoning model' },
      { id: 'openai/o3',                     label: 'o3',                 desc: 'Strong reasoning' },
      { id: 'openai/o3-deep-research',       label: 'o3 Deep Research',   desc: 'Extended research mode' },
      { id: 'openai/o4-mini-high',           label: 'o4 Mini High',       desc: 'Fast reasoning' },
      { id: 'openai/o4-mini',                label: 'o4 Mini',            desc: 'Cheap reasoning' },
      { id: 'openai/gpt-oss-120b',           label: 'GPT OSS 120B',       desc: 'Open weights 120B' },
      { id: 'openai/gpt-4o',                 label: 'GPT-4o',             desc: 'Multimodal' },
      { id: 'openai/gpt-4.1',                label: 'GPT-4.1',            desc: 'Balanced' },
      { id: 'openai/gpt-4.1-mini',           label: 'GPT-4.1 Mini',       desc: 'Fast + cheap' },
      { id: 'openai/gpt-4o-search-preview',  label: 'GPT-4o Search',      desc: 'Web search grounded' },
    ],
  },
  {
    provider: 'Anthropic',
    key:      'anthropic',
    badge:    'text-orange-400',
    models: [
      { id: 'anthropic/claude-opus-4.7',          label: 'Claude Opus 4.7',        desc: 'Best reasoning + synthesis' },
      { id: 'anthropic/claude-opus-4.5',          label: 'Claude Opus 4.5',        desc: 'Previous flagship Opus' },
      { id: 'anthropic/claude-opus-4',            label: 'Claude Opus 4',          desc: 'Base Opus 4' },
      { id: 'anthropic/claude-sonnet-4.6',        label: 'Claude Sonnet 4.6',      desc: 'Best balanced' },
      { id: 'anthropic/claude-sonnet-4.5',        label: 'Claude Sonnet 4.5',      desc: 'Previous Sonnet' },
      { id: 'anthropic/claude-sonnet-4',          label: 'Claude Sonnet 4',        desc: 'Base Sonnet 4' },
      { id: 'anthropic/claude-haiku-4.5',         label: 'Claude Haiku 4.5',       desc: 'Fastest Claude' },
      { id: 'anthropic/claude-3.7-sonnet-thinking', label: 'Claude 3.7 Thinking',  desc: 'Extended thinking mode' },
    ],
  },
  {
    provider: 'Google',
    key:      'google',
    badge:    'text-blue-400',
    models: [
      { id: 'google/gemini-3.1-pro-preview',      label: 'Gemini 3.1 Pro',         desc: 'Latest flagship, 2M context' },
      { id: 'google/gemini-3.5-flash',            label: 'Gemini 3.5 Flash',       desc: 'Fastest Gemini' },
      { id: 'google/gemini-3-flash-preview',      label: 'Gemini 3 Flash',         desc: 'Quick preview model' },
      { id: 'google/gemini-2.5-pro',              label: 'Gemini 2.5 Pro',         desc: 'Vision + long context' },
      { id: 'google/gemini-2.5-flash',            label: 'Gemini 2.5 Flash',       desc: 'Fast Gemini' },
      { id: 'google/gemini-2.5-flash-lite',       label: 'Gemini 2.5 Flash Lite',  desc: 'Ultra cheap' },
    ],
  },
  {
    provider: 'xAI',
    key:      'xai',
    badge:    'text-white',
    models: [
      { id: 'xai/grok-4.20-reasoning',      label: 'Grok 4.20 Thinking',   desc: 'Deep reasoning + live X data' },
      { id: 'xai/grok-4.20-non-reasoning',  label: 'Grok 4.20',            desc: 'Fast + live X/Twitter' },
      { id: 'x-ai/grok-4.20-multi-agent',   label: 'Grok Multi-Agent',     desc: 'Agentic tasks + X data' },
      { id: 'xai/grok-4.3',                 label: 'Grok 4.3',             desc: 'Previous Grok' },
    ],
  },
  {
    provider: 'DeepSeek',
    key:      'deepseek',
    badge:    'text-cyan-400',
    models: [
      { id: 'deepseek/deepseek-r1-0528',              label: 'DeepSeek R1',            desc: 'Best math + reasoning' },
      { id: 'deepseek/deepseek-r1',                   label: 'DeepSeek R1 Base',       desc: 'R1 base variant' },
      { id: 'tng/deepseek-r1t2-chimera',              label: 'R1T2 Chimera',           desc: 'R1 reasoning + instruction tuning' },
      { id: 'deepseek/deepseek-v4-pro',               label: 'DeepSeek V4 Pro',        desc: 'Top-tier instruction model' },
      { id: 'deepseek/deepseek-v3.1-terminus',        label: 'DeepSeek V3.1 Terminus', desc: 'Best V3 variant' },
      { id: 'deepseek/deepseek-v3.1-terminus-exacto', label: 'V3.1 Terminus Exacto',   desc: 'Structured output optimized' },
      { id: 'deepseek/deepseek-v3.2',                 label: 'DeepSeek V3.2',          desc: 'Fast + capable' },
      { id: 'deepseek/deepseek-v3.2-exp',             label: 'DeepSeek V3.2 Exp',      desc: 'Experimental V3.2' },
      { id: 'deepseek/deepseek-v4-flash',             label: 'DeepSeek V4 Flash',      desc: 'Fastest + cheapest' },
    ],
  },
  {
    provider: 'Qwen',
    key:      'qwen',
    badge:    'text-violet-400',
    models: [
      { id: 'qwen/qwen3-235b-a22b-instruct-2507', label: 'Qwen3 235B',    desc: '235B MoE, massive knowledge' },
      { id: 'qwen/qwen3-max',                     label: 'Qwen3 Max',     desc: 'Best Qwen 3' },
      { id: 'qwen/qwen3.6-plus',                  label: 'Qwen3.6 Plus',  desc: 'Latest Qwen generation' },
      { id: 'qwen/qwen3.5-plus',                  label: 'Qwen3.5 Plus',  desc: 'Balanced Qwen3.5' },
      { id: 'qwen/qwen3.5-flash',                 label: 'Qwen3.5 Flash', desc: 'Fast Qwen' },
      { id: 'qwen/qwen-max',                      label: 'Qwen Max',      desc: 'Classic Qwen Max' },
    ],
  },
  {
    provider: 'Moonshot',
    key:      'moonshot',
    badge:    'text-indigo-400',
    models: [
      { id: 'moonshotai/kimi-k2-thinking', label: 'Kimi K2 Thinking', desc: 'Extended thinking mode' },
      { id: 'moonshotai/kimi-k2.6',        label: 'Kimi K2.6',        desc: 'Latest Kimi' },
      { id: 'moonshotai/kimi-k2.5',        label: 'Kimi K2.5',        desc: 'Previous Kimi' },
      { id: 'moonshotai/kimi-k2-0905',     label: 'Kimi K2 0905',     desc: 'Sept 2025 snapshot' },
    ],
  },
  {
    provider: 'MiniMax',
    key:      'minimax',
    badge:    'text-pink-400',
    models: [
      { id: 'minimax/minimax-m2.7',   label: 'MiniMax M2.7',   desc: 'Latest flagship' },
      { id: 'minimax/minimax-m2.5',   label: 'MiniMax M2.5',   desc: 'Strong M2 variant' },
      { id: 'minimax/minimax-m2-her', label: 'MiniMax M2-Her', desc: 'Roleplay optimized' },
      { id: 'minimax/minimax-m1',     label: 'MiniMax M1',     desc: 'Previous generation' },
    ],
  },
  {
    provider: 'ZAI / GLM',
    key:      'zai',
    badge:    'text-teal-400',
    models: [
      { id: 'zai/glm-5.1',       label: 'GLM-5.1',       desc: 'Latest GLM flagship' },
      { id: 'zai/glm-5',         label: 'GLM-5',          desc: 'GLM-5 base' },
      { id: 'zai/glm-4.7',       label: 'GLM-4.7',        desc: 'Strong GLM-4 series' },
      { id: 'zai/glm-4.6-exacto', label: 'GLM-4.6 Exacto', desc: 'Structured output optimized' },
    ],
  },
  {
    provider: 'Xiaomi',
    key:      'xiaomi',
    badge:    'text-orange-300',
    models: [
      { id: 'xiaomi/mimo-v2.5-pro', label: 'MiMo V2.5 Pro', desc: 'Flagship MiMo' },
      { id: 'xiaomi/mimo-v2.5',     label: 'MiMo V2.5',     desc: 'Standard MiMo' },
      { id: 'xiaomi/mimo-v2-omni',  label: 'MiMo V2 Omni',  desc: 'Multimodal MiMo' },
    ],
  },
  {
    provider: 'Mistral',
    key:      'mistral',
    badge:    'text-yellow-400',
    models: [
      { id: 'mistral/mixtral-8x7b-instruct', label: 'Mixtral 8×7B', desc: 'Open MoE, fast + cheap' },
    ],
  },
];

// Flat list of all chat models (for type safety and model picker validation)
export const ALL_CHAT_MODELS = PROVIDER_GROUPS.flatMap((g) => g.models);

// Legacy list kept for backward compat
export const CHAT_MODEL_OPTIONS = [
  { id: MODELS.balanced,   label: 'Claude Sonnet 4.6' },
  { id: MODELS.reasoner,   label: 'Claude Opus 4.7' },
  { id: MODELS.grok,       label: 'Grok 4.20' },
  { id: MODELS.classifier, label: 'DeepSeek V3.2' },
];
