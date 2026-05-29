// DGrid model catalog — verified against /v1/models (2026-05-29)
// All model strings follow provider/model-name convention (OpenRouter-compatible).
//
// Provider prefix gotchas (silent 404 sources):
//  - xAI is `x-ai/` (dashed), NOT `xai/`.
//  - ZAI is `z-ai/` (dashed), NOT `zai/`.
//  - Exacto variants use `:exacto` (colon), NOT `-exacto`.
//  - Llama provider is `meta-llama/`, free tier suffix is `:free`.
//  - tngtech/* (Chimera) and mistralai/mixtral-8x7b currently have no endpoints — avoid.
//
// Naming convention for keys:
//  - reasoner*  → flagship synthesis / aggregation
//  - analyst*   → balanced reasoning, prediction analyst pool
//  - classifier → cheap structured classification
//  - exacto*    → fine-tuned for generateObject (structured JSON)
//  - free_*     → zero-cost (rate-limited) — only for pre-filters/dedup

export const MODELS = {
  // ── Anthropic ──────────────────────────────────────────────────────────────
  reasoner:    'anthropic/claude-opus-4.7',       // synthesis, rug detection, Build Ideas, alpha calls
  balanced:    'anthropic/claude-sonnet-4.6',     // Dev Events, X summaries, Chat default — 1M ctx
  fast_claude: 'anthropic/claude-haiku-4.5',      // legacy — Llama free covers budget end

  // ── DeepSeek ───────────────────────────────────────────────────────────────
  analyst_pro: 'deepseek/deepseek-v4-pro',        // Prediction aggregator — 1M ctx + reasoning, $1.77/$3.53
  reasoner_ds: 'deepseek/deepseek-r1-0528',       // Market Microstructure analyst — pure reasoning
  fast:        'deepseek/deepseek-v4-flash',      // MiroFish boost LLM (parallel profile gen on VPS)
  // legacy DeepSeek keys — retire after agent rewire (step 4)
  analyst:     'deepseek/deepseek-v3.1-terminus',
  exacto:      'deepseek/deepseek-v3.1-terminus:exacto',
  classifier:  'deepseek/deepseek-v3.2',

  // ── xAI Grok ───────────────────────────────────────────────────────────────
  grok:        'x-ai/grok-4.20-non-reasoning',    // live X data — primary scanner source, cheapest Grok
  grok_think:  'x-ai/grok-4.20-reasoning',        // KOL credibility, Contrarian analyst
  grok_multi:  'x-ai/grok-4.20-multi-agent',      // Multi-Agent Consensus analyst — 2M ctx, parallel reasoning

  // ── Google ─────────────────────────────────────────────────────────────────
  gemini_pro:  'google/gemini-3.1-pro-preview',   // long-context analyst (30+ articles) — $2/$12, 1M ctx
  // legacy Google keys — retire after agent rewire
  vision:      'google/gemini-2.5-pro',
  flash:       'google/gemini-3.5-flash',

  // ── OpenAI ─────────────────────────────────────────────────────────────────
  macro:       'openai/gpt-5.5',                  // Macro Analyst — 1M ctx + frontier reasoning, $5/$30
  o3:          'openai/o3',                       // Quant analysts (Base Rate, Risk, NFT Floor, Gem) — $2/$8
  o3_pro:      'openai/o3-pro',                   // Trade Ideas synthesis (one call/scan) — $20/$80
  codex:       'openai/gpt-5.3-codex',            // Strategist build plans, VPS Helper — $1.75/$14
  // legacy OpenAI keys — retire after agent rewire
  search:      'openai/gpt-4o-search-preview',
  search_mini: 'openai/gpt-4o-mini-search-preview',

  // ── Qwen ───────────────────────────────────────────────────────────────────
  qwen_big:    'qwen/qwen3-235b-a22b-instruct-2507', // Crypto Fundamentals analyst (multilingual) — $0.287/$1.147
  embed:       'qwen/qwen3-embedding-8b',         // future — semantic news dedup, "similar past mints"
  vision_cheap:'qwen/qwen2.5-vl-72b-instruct',    // future — chart screenshot / NFT image scoring — $0.03/$0.13
  qwen_fast:   'qwen/qwen3.5-flash',              // legacy

  // ── Moonshot ───────────────────────────────────────────────────────────────
  kimi_think:  'moonshotai/kimi-k2-thinking',     // Crowd Calibrator analyst — cheapest serious reasoner, $0.4/$1.75

  // ── Meta (free tier) ───────────────────────────────────────────────────────
  free_filter: 'meta-llama/llama-3.3-70b-instruct:free', // pre-filters, dedup, free brief tier — $0

  // ── ZAI / GLM ──────────────────────────────────────────────────────────────
  exacto_glm:  'z-ai/glm-4.6:exacto',             // primary structured-JSON parser (Grok output → typed) — $0.43/$1.75

  // ── Chimera (TNG) — DEAD on DGrid as of 2026-05-27 ─────────────────────────
  chimera:     'tngtech/deepseek-r1t2-chimera',   // no endpoints — kept for catalog completeness only
} as const;

export type ModelKey = keyof typeof MODELS;
export type ModelId  = (typeof MODELS)[ModelKey];

// ── Per-task model assignments ──────────────────────────────────────────────
// Headline model per agent. Pipeline-stage detail (source/parse/analyze) lives
// in SCANNER_PIPELINE; the prediction analyst pool lives in PREDICTION_ANALYSTS.
// Step 3 rewires each agent file to consume these constants.
export const AGENT_MODELS: Record<string, string> = {
  // ── Prediction Tab ────────────────────────────────────
  // prediction_analyst is the legacy single-model fallback for the old 10-analyst
  // pool. The new tab dispatches across 12 specialist analysts — see PREDICTION_ANALYSTS.
  prediction_analyst:    MODELS.classifier,    // legacy fallback (kept until prediction.ts rewire)
  prediction_aggregator: MODELS.analyst_pro,   // V4 Pro — 1M ctx + reasoning, ~90% cost cut vs R1-0528
  prediction_social:     MODELS.grok,          // Grok NR — live X data (unchanged)

  // ── Scanners (headline analyzer — full pipeline in SCANNER_PIPELINE) ──────
  news:       MODELS.balanced,    // Sonnet — News summary + categorization
  nft:        MODELS.reasoner,    // Opus — rug detection on NFT mint contracts
  memes:      MODELS.reasoner,    // Opus — rug detection + gem scoring
  x_events:   MODELS.balanced,    // Sonnet — X event categorization
  dev_events: MODELS.balanced,    // Sonnet — release / protocol-update summaries

  // ── Synthesis ─────────────────────────────────────────
  ideas:        MODELS.reasoner,  // Opus — Build Ideas synthesis across all scanners
  trade_ideas:  MODELS.o3_pro,    // o3 Pro — Trade Ideas (one premium call per scan cycle)

  // ── Cross-cutting roles ───────────────────────────────
  pre_filter: MODELS.free_filter, // Llama 3.3 70B free — dedup + pre-classify before paid calls
  parser:     MODELS.exacto_glm,  // GLM 4.6 exacto — Grok text → typed JSON

  // ── Chat / Strategist ─────────────────────────────────
  chat_default: MODELS.balanced,  // Sonnet — Chat default
  strategist:   MODELS.codex,     // GPT-5.3 Codex — Strategist build plans + VPS Helper
};

// ── Prediction Tab: 12 specialist analysts ─────────────────────────────────
// One call per market per analyst, picked for the analytical frame the analyst
// represents. AGENT_MODELS.prediction_aggregator (V4 Pro) fuses the outputs.
//
// Budget Option B from the 18-pick plan: cheap 4-analyst pool runs on every
// market; full 12-analyst pool runs only on the top 5 markets. Step 3 wires
// this tiering in lib/agents/prediction.ts.
export type AnalystRole = {
  id:    string;
  label: string;
  model: string;
  focus: string;
};

export const PREDICTION_ANALYSTS: AnalystRole[] = [
  { id: 'macro',            label: 'Macro',                 model: MODELS.macro,       focus: 'Global econ, rates, DXY, BTC dominance — 1M ctx swallows full macro state' },
  { id: 'base_rate',        label: 'Base Rate',             model: MODELS.o3,          focus: 'Historical base rates for similar setups' },
  { id: 'risk_tail',        label: 'Risk & Tail',           model: MODELS.o3,          focus: 'Tail risk, max drawdown, liquidation cliffs' },
  { id: 'nft_floor',        label: 'NFT Floor',             model: MODELS.o3,          focus: 'NFT floor dynamics, mint pressure' },
  { id: 'memes_gem',        label: 'Memes / Gem',           model: MODELS.o3,          focus: 'Meme-coin early gem scoring' },
  { id: 'microstructure',   label: 'Market Microstructure', model: MODELS.reasoner_ds, focus: 'Order flow, CEX/DEX volume patterns — pure reasoning' },
  { id: 'fundamentals',     label: 'Crypto Fundamentals',   model: MODELS.qwen_big,    focus: 'On-chain metrics + multilingual coverage (Asian crypto)' },
  { id: 'crowd_calibrator', label: 'Crowd Calibrator',      model: MODELS.kimi_think,  focus: 'Calibrates crowd consensus vs contrarian read' },
  { id: 'consensus',        label: 'Multi-Agent Consensus', model: MODELS.grok_multi,  focus: 'Parallel reasoning across live X data (2M ctx)' },
  { id: 'kol',              label: 'KOL Credibility',       model: MODELS.grok_think,  focus: 'KOL track-record weighted signal from X' },
  { id: 'contrarian',       label: 'Contrarian',            model: MODELS.grok_think,  focus: 'Looks for over-extended consensus to fade' },
  { id: 'rug_red_flags',    label: 'Rug / Red Flags',       model: MODELS.reasoner,    focus: 'Subtle rug-risk signals — Opus only (Sonnet misses these)' },
];

// 4-analyst cheap pool that runs on every market (Option B from cost plan).
// Picked for coverage across frames: macro + quant + microstructure + crowd.
export const PREDICTION_CHEAP_POOL: AnalystRole[] = PREDICTION_ANALYSTS.filter((a) =>
  ['base_rate', 'risk_tail', 'microstructure', 'crowd_calibrator'].includes(a.id),
);

// ── Per-scanner pipeline models ────────────────────────────────────────────
// Each scanner is a 4-stage pipeline:
//   source    → live data fetch from external API (usually via Grok-NR for X data)
//   prefilter → free dedup / pre-classify to drop garbage before paid calls
//   parse     → Grok text → structured JSON (GLM 4.6 exacto)
//   analyze   → per-item reasoning (Opus / Sonnet / o3 depending on scanner)
// Step 3 rewires each lib/agents/*.ts to read from this map.
export type ScannerPipeline = {
  source:    string;
  prefilter: string;
  parse:     string;
  analyze:   string;
};

export const SCANNER_PIPELINE: Record<string, ScannerPipeline> = {
  memes: {
    source:    MODELS.grok,         // live X chatter + DexScreener (DexScreener call is HTTP, not LLM)
    prefilter: MODELS.free_filter,
    parse:     MODELS.exacto_glm,
    analyze:   MODELS.reasoner,     // Opus — Sonnet misses subtle rug red flags
  },
  nft: {
    source:    MODELS.grok,
    prefilter: MODELS.free_filter,
    parse:     MODELS.exacto_glm,
    analyze:   MODELS.reasoner,     // Opus — rug detection on mint contracts
  },
  x_events: {
    source:    MODELS.grok,
    prefilter: MODELS.free_filter,
    parse:     MODELS.exacto_glm,
    analyze:   MODELS.balanced,     // Sonnet — categorization workload
  },
  news: {
    source:    MODELS.grok,
    prefilter: MODELS.free_filter,
    parse:     MODELS.exacto_glm,
    analyze:   MODELS.balanced,
  },
  dev_events: {
    source:    MODELS.grok,
    prefilter: MODELS.free_filter,
    parse:     MODELS.exacto_glm,
    analyze:   MODELS.balanced,
  },
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
      { id: 'openai/gpt-oss-120b:free',      label: 'GPT OSS 120B',       desc: 'Open weights 120B (free tier)' },
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
      { id: 'x-ai/grok-4.20-reasoning',     label: 'Grok 4.20 Thinking',   desc: 'Deep reasoning + live X data' },
      { id: 'x-ai/grok-4.20-non-reasoning', label: 'Grok 4.20',            desc: 'Fast + live X/Twitter' },
      { id: 'x-ai/grok-4.20-multi-agent',   label: 'Grok Multi-Agent',     desc: 'Agentic tasks + X data' },
      { id: 'x-ai/grok-4.3',                label: 'Grok 4.3',             desc: 'Previous Grok' },
    ],
  },
  {
    provider: 'DeepSeek',
    key:      'deepseek',
    badge:    'text-cyan-400',
    models: [
      { id: 'deepseek/deepseek-r1-0528',              label: 'DeepSeek R1',            desc: 'Best math + reasoning' },
      { id: 'deepseek/deepseek-r1',                   label: 'DeepSeek R1 Base',       desc: 'R1 base variant' },
      { id: 'deepseek/deepseek-v4-pro',               label: 'DeepSeek V4 Pro',        desc: 'Top-tier instruction model' },
      { id: 'deepseek/deepseek-v3.1-terminus',        label: 'DeepSeek V3.1 Terminus', desc: 'Best V3 variant' },
      { id: 'deepseek/deepseek-v3.1-terminus:exacto', label: 'V3.1 Terminus Exacto',   desc: 'Structured output optimized' },
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
      { id: 'z-ai/glm-5.1',        label: 'GLM-5.1',        desc: 'Latest GLM flagship' },
      { id: 'z-ai/glm-5',          label: 'GLM-5',          desc: 'GLM-5 base' },
      { id: 'z-ai/glm-4.7',        label: 'GLM-4.7',        desc: 'Strong GLM-4 series' },
      { id: 'z-ai/glm-4.6:exacto', label: 'GLM-4.6 Exacto', desc: 'Structured output optimized' },
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
