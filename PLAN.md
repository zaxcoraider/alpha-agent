# Alpha Agent Dashboard — Build Plan

A personal 24/7 crypto intelligence dashboard powered by DGrid's decentralized LLM gateway. Seven scanner agents + multi-model chat, in one Next.js app, deployable as a single Docker container.

---

## TL;DR

You're building a single-user web app with eight tabs (seven scanners + chat). Each scanner is an LLM-powered agent that pulls from chain-specific data sources, scores results, and writes them to a Postgres database. A scheduler runs a "morning scan" before you wake up; one click rescans any tab on demand. The chat tab lets you swap between DGrid's 200+ models per thread.

The whole thing is one Next.js 15 monolith. Don't split into a Python backend + Vue frontend like MiroFish — that doubles deploy complexity, and you're solo.

---

## Why these specific choices

### Why Next.js monolith (not MiroFish-style split)
MiroFish runs Vue + Python because it has a team. You don't. One Next.js repo gives you UI, API routes, server actions, and (via Inngest) background jobs. One deploy, one log stream, one bug surface.

### Why DGrid via OpenAI-compatible SDK
DGrid's TypeScript SDK is a fork of OpenRouter's, meaning the API is OpenAI-compatible. The Vercel AI SDK has an OpenAI provider where you can override `baseURL` — point it at DGrid and you can use any of their 200+ models by changing a single string. Same code path for the chat tab and every agent worker.

### Why Inngest (not raw cron + Redis workers)
You'll want retries, replay, and a dashboard showing scan history. Inngest gives all three for free, runs on Vercel, and lets you trigger functions from API routes (perfect for the "Rescan" button).

### Why Postgres (not Mongo)
Scanner results are highly relational (results belong to runs, runs belong to agents, you'll want full-text search on news titles, and you'll want to JOIN bookmark state across tabs). Use JSONB for the polymorphic `raw` payload per result.

---

## Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 15 (App Router) + TypeScript strict | RSC for reads, server actions for mutations |
| UI | shadcn/ui + Tremor + Tailwind | Tables and charts for free |
| DB | Postgres (Supabase, Neon, or local) | Drizzle ORM, full-text search on titles |
| Cache + rate limit | Upstash Redis (or local) | Token bucket per source |
| Background jobs | Inngest | Cron + manual triggers + retries |
| LLM gateway | DGrid via Vercel AI SDK (`@ai-sdk/openai` with custom baseURL) | Swap models per agent |
| Twitter/X | twitterapi.io or Apify | Cheaper than official X API |
| EVM data | Alchemy, Reservoir (NFTs), DexScreener (DEX) | Free tiers OK for personal use |
| Solana data | Helius (RPC + webhooks), Birdeye, Magic Eden | Helius free tier is generous |
| Auth | Clerk (free tier) or basic email/password | Single user — don't overthink |
| Alerts | Telegram bot via telegraf | Free, fast, on your phone |
| Deployment | Vercel + Railway, or single Docker on a VPS | $5-20/month |

---

## Project structure

```
alpha-agent/
├── app/
│   ├── (dashboard)/
│   │   ├── layout.tsx              # Sidebar + tab nav
│   │   ├── page.tsx                # Morning brief (home)
│   │   ├── news/page.tsx
│   │   ├── nft-mints/page.tsx
│   │   ├── ideas/page.tsx
│   │   ├── memes/page.tsx
│   │   ├── x-events/page.tsx
│   │   ├── dev-events/page.tsx
│   │   ├── prediction/page.tsx
│   │   └── chat/page.tsx
│   ├── api/
│   │   ├── chat/route.ts           # Streaming chat endpoint
│   │   ├── rescan/route.ts         # POST { agent } → trigger Inngest
│   │   └── inngest/route.ts        # Inngest webhook
│   └── layout.tsx
├── lib/
│   ├── llm/
│   │   ├── client.ts               # DGrid OpenAI-compat client
│   │   ├── models.ts               # Per-agent model defaults
│   │   └── tools.ts                # Shared AI SDK tool definitions
│   ├── agents/
│   │   ├── base.ts                 # Agent interface
│   │   ├── registry.ts             # Map agent name → impl
│   │   ├── news.ts
│   │   ├── nft.ts
│   │   ├── ideas.ts
│   │   ├── memes.ts
│   │   ├── x-events.ts
│   │   ├── dev-events.ts
│   │   └── prediction.ts
│   ├── sources/                    # ONE file per external API
│   │   ├── twitter.ts
│   │   ├── cryptopanic.ts
│   │   ├── dexscreener.ts
│   │   ├── birdeye.ts              # Solana
│   │   ├── reservoir.ts            # EVM NFTs
│   │   ├── magiceden.ts            # Solana NFTs
│   │   ├── polymarket.ts
│   │   ├── manifold.ts
│   │   ├── github.ts
│   │   ├── ethglobal.ts
│   │   ├── devfolio.ts
│   │   ├── helius.ts               # Solana KOL wallets
│   │   ├── alchemy.ts              # EVM KOL wallets
│   │   └── rss.ts
│   ├── chains.ts                   # Chain enum + helpers
│   ├── db/
│   │   ├── schema.ts               # Drizzle schemas
│   │   └── client.ts
│   └── utils/
│       ├── rate-limit.ts
│       ├── dedupe.ts
│       └── alerts.ts               # Telegram push
├── inngest/
│   ├── client.ts
│   └── functions/
│       ├── morning-scan.ts         # 06:00 daily — runs all enabled agents
│       ├── hourly-scan.ts          # 30m/1h — fast-moving agents only
│       └── on-demand.ts            # Triggered by /api/rescan
├── drizzle/                        # SQL migrations
├── .env.example
├── CLAUDE.md                       # Claude Code project instructions
├── docker-compose.yml              # Postgres + Redis for local dev
└── package.json
```

---

## Database schema (Drizzle)

```ts
// lib/db/schema.ts
import { pgTable, uuid, text, timestamp, jsonb, numeric, boolean, pgEnum } from 'drizzle-orm/pg-core';

export const agentEnum = pgEnum('agent', [
  'news', 'nft', 'ideas', 'memes', 'x_events', 'dev_events', 'prediction'
]);
export const chainEnum = pgEnum('chain', [
  'sol', 'eth', 'polygon', 'arbitrum', 'base', 'optimism', 'bsc', 'sui', 'aptos', 'unknown'
]);

export const scanRuns = pgTable('scan_runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  agent: agentEnum('agent').notNull(),
  trigger: text('trigger').notNull(), // 'cron' | 'manual'
  startedAt: timestamp('started_at').defaultNow(),
  finishedAt: timestamp('finished_at'),
  status: text('status').notNull(), // 'running' | 'ok' | 'error'
  error: text('error'),
  modelUsed: text('model_used'),
  costUsd: numeric('cost_usd', { precision: 10, scale: 6 }),
  itemsFound: numeric('items_found'),
});

export const scanResults = pgTable('scan_results', {
  id: uuid('id').defaultRandom().primaryKey(),
  runId: uuid('run_id').references(() => scanRuns.id),
  agent: agentEnum('agent').notNull(),
  externalId: text('external_id').notNull(), // dedup key per agent
  title: text('title').notNull(),
  summary: text('summary'),
  url: text('url'),
  score: numeric('score', { precision: 4, scale: 2 }), // 0-10 relevance
  chains: chainEnum('chains').array(),
  raw: jsonb('raw'), // full enriched payload
  createdAt: timestamp('created_at').defaultNow(),
  bookmarked: boolean('bookmarked').default(false),
  dismissed: boolean('dismissed').default(false),
  notes: text('notes'),
});
// add unique index on (agent, external_id)

export const chatThreads = pgTable('chat_threads', { /* id, title, systemPrompt, model, createdAt */ });
export const chatMessages = pgTable('chat_messages', { /* id, threadId, role, content, model, tokensIn, tokensOut, costUsd */ });

export const agentConfigs = pgTable('agent_configs', {
  agent: agentEnum('agent').primaryKey(),
  enabled: boolean('enabled').default(true),
  cronExpression: text('cron_expression'),
  model: text('model'), // override default model
  promptOverrides: jsonb('prompt_overrides'),
  filters: jsonb('filters'), // chain allowlist, min_score, etc.
  dailyBudgetUsd: numeric('daily_budget_usd'),
});

export const watchlists = pgTable('watchlists', {
  id: uuid('id').defaultRandom().primaryKey(),
  kind: text('kind').notNull(), // 'kol_handles' | 'kol_wallets_evm' | 'kol_wallets_sol' | 'dev_repos' | 'contract_addresses' | 'rss_feeds'
  items: text('items').array(),
});
```

---

## DGrid client (single source of truth for models)

```ts
// lib/llm/client.ts
import { createOpenAI } from '@ai-sdk/openai';

export const dgrid = createOpenAI({
  apiKey: process.env.DGRID_API_KEY!,
  baseURL: process.env.DGRID_BASE_URL!, // check https://docs.dgrid.ai for exact URL
  compatibility: 'compatible',
});
```

```ts
// lib/llm/models.ts
// Update model strings against DGrid's live catalog at https://dgrid.ai/models
// Convention follows OpenRouter (provider/model) since DGrid's SDK is forked from theirs
export const MODELS = {
  // Fast + cheap classification
  classifier: 'deepseek/deepseek-chat',
  // Reasoning-heavy (predictions, idea synthesis)
  reasoner: 'anthropic/claude-opus-4',
  // Balanced default for chat + most agents
  balanced: 'anthropic/claude-sonnet-4',
  // Vision (if you scrape images later)
  vision: 'openai/gpt-4o',
} as const;

export const AGENT_MODELS = {
  news: MODELS.classifier,
  nft: MODELS.classifier,
  ideas: MODELS.reasoner,
  memes: MODELS.classifier,
  x_events: MODELS.classifier,
  dev_events: MODELS.classifier,
  prediction: MODELS.reasoner,
  chat_default: MODELS.balanced,
};
```

```ts
// Example agent call using structured output
import { generateObject } from 'ai';
import { z } from 'zod';
import { dgrid } from '@/lib/llm/client';
import { AGENT_MODELS } from '@/lib/llm/models';

const NewsItem = z.object({
  chains: z.array(z.enum(['sol','eth','polygon','arbitrum','base','optimism','bsc','unknown'])),
  category: z.enum(['protocol','hack','funding','regulation','meme','infra','tooling','other']),
  score: z.number().min(0).max(10),
  whyRelevant: z.string().max(180),
});

export async function classifyNews(title: string, body: string) {
  const { object } = await generateObject({
    model: dgrid(AGENT_MODELS.news),
    schema: NewsItem,
    prompt: `Classify this crypto news for a multi-chain dev who builds on Solana, Ethereum, Polygon, Arbitrum, Base.\n\nTitle: ${title}\nBody: ${body}`,
  });
  return object;
}
```

---

## Scanner specs

### Tab 1 — News
- **Sources**: CryptoPanic free API, CoinDesk/Decrypt/TheBlock RSS, your curated X analyst list (via twitterapi.io)
- **Schedule**: every 30 min
- **Agent job**: classify (chains, category) + score 0-10 + 1-line summary
- **Output schema**: `{ title, url, source, chains: string[], category, score, whyRelevant }`
- **Multi-chain note**: tag each item with affected chains so the UI can filter by your active focus

### Tab 2 — Free NFT Mints
- **Sources by chain**:
  - EVM (ETH/Polygon/Arb/Base/OP): Reservoir API — single endpoint covers all majors
  - Solana: Magic Eden launchpad + Helius webhooks for `MintToCollection` instructions
  - Base: alphabot.app calendar feed
- **Filter**: mint price ≤ 0.005 ETH equivalent or free, started <24h ago, minter count growth velocity
- **Chain difference to surface in UI**: EVM "free" mints can cost $20+ in gas during spikes; Solana mints have predictable ~0.000005 SOL fees. Always show estimated total cost including current gas.
- **Output**: `{ collection, chain, mintPriceNative, estTotalUsd, mintsLastHour, holdersGrowth, contract, rugCheck }`

### Tab 3 — Build Ideas
- **Inputs**: today's News results, GitHub trending (topics: solana, ethereum, defi, etc.), ProductHunt crypto launches, ETH Research new threads, Solana ecosystem grants page
- **Schedule**: daily 06:00 (after News, NFT, Memes have run so it can consume them)
- **Prompt template** (in `lib/agents/ideas.ts`):
  > Given today's signals (attached), surface 5 buildable ideas where (a) the problem is real and recent, (b) no clear leader exists yet, (c) a solo developer using Claude Code can ship an MVP in 2 weeks, (d) at least one of: Solana, Ethereum L2 (Arbitrum/Base/Optimism), or Polygon is a natural target. For each idea provide: target chain(s), one-paragraph problem statement, suggested stack, why now, biggest risk, MVP scope.
- **Output**: ranked list with chain tag

### Tab 4 — Meme Radar
- **Sources**:
  - Solana: DexScreener trending, Birdeye new tokens, pump.fun graduates, GMGN.ai
  - Base/Eth: DexScreener trending, GeckoTerminal new pools
- **Signals combined into a composite score**:
  - 5m and 1h volume spike
  - Holder growth rate
  - Twitter mention velocity (search ticker via twitterapi.io, normalize per hour)
  - KOL wallet activity (from `watchlists.kol_wallets_*`)
  - Liquidity locked check, mint authority renounced check
- **Safety**: SIGNALS ONLY. Never auto-execute. No wallet integration on this app.
- **Output**: `{ symbol, name, chain, mintAddress, mcUsd, fdvUsd, volSpike5m, volSpike1h, mentionVelocity, kolBuysCount, liqLocked, mintRevoked, suggestedAction: 'watch' | 'research' | 'skip' }`

### Tab 5 — X Creator Events (Crypto Twitter content opportunities)
- **Sources**: Kaito Yaps leaderboard, Cookie.fun snapshots, Galxe creator quests, X Spaces upcoming (twitterapi.io)
- **Filter**: events where you can earn (yap rewards, content quests, raids on launches you'd post about anyway), exclude pure paid shilling
- **Output**: `{ project, type, deadline, expectedPayoutUsd, effortMinutes, link }`

### Tab 6 — Dev Events (hackathons / buildathons)
- **Sources**: ETHGlobal API, DoraHacks API, Devfolio scrape, Solana Foundation events page, Arbitrum/Base/Polygon grants pages, Lu.ma `crypto` tag
- **Filter**: open registration, prize ≥ $5k, deadline ≥ 3 days, your chain (from `watchlists.target_chains`)
- **Bonus join**: cross-reference Build Ideas — "this idea you have fits ETHGlobal X track"
- **Output**: `{ name, host, chains, prizePoolUsd, registrationCloses, demoDay, tracks, link, ideaMatch }`

### Tab 7 — Prediction Markets (your 60% edge)
This is where you adopt MiroFish's seed → analysis → report pattern.
- **Sources**: Polymarket gamma-api (public, no auth), Manifold API, Kalshi
- **Pipeline per market**:
  1. Pull markets with volume > $50k and ending in 1-30 days
  2. For each: web search last 7 days of news about the topic
  3. Pull X sentiment on the underlying entities
  4. Run analyst LLM (reasoner model): given news + sentiment, what's your estimated true probability? Confidence 0-1?
  5. Compute `edge = abs(trueProb - impliedProb) * volumeWeight`
  6. Surface only edges > 10% with confidence > 0.6
- **Track every prediction**: log `{ marketId, yourProb, marketProb, side, ts }` so you can validate your 60% over time
- **Output**: `{ market, yourProb, marketProb, edge, recommendedSide, keyEvidence: string[], confidence, link }`

### Tab 8 — Chat (model swap)
- Top bar: model dropdown (lists DGrid catalog, default per agent prompt set)
- Sidebar: thread list + new thread + per-thread system prompt
- Implementation: Vercel AI SDK `useChat` with `body: { model, threadId }`. The route handler reads `model` and instantiates the right DGrid client call. Stream responses.
- Bonus: a "Use my data" tool that lets the chat agent query your `scan_results` table — "what did the news scanner find about Eigenlayer this week?"

---

## Things you missed (add these — high value)

1. **Morning brief on the home page**: An LLM-generated 1-page summary that consumes outputs of all 7 scanners and gives you a coffee-time read. Sections: "What changed overnight", "Top 3 opportunities today", "Your prediction edges", "Mints ending in 24h". Run after all morning scans complete.

2. **Airdrop / quest tracker**: Galxe, Layer3, Zealy, Rabbithole. Paste a wallet → check eligibility per chain. Many of these have free APIs or scrapeable endpoints.

3. **Token unlock calendar**: tokenunlocks.app API. Surface unlocks > $50M in next 7 days — high correlation with price moves you can position around.

4. **Funding rate / liquidation heatmap**: Coinglass scrape or Hyperliquid public API. Extreme perp funding + spot divergence = signal.

5. **KOL wallet tracking**: Pick 20 wallets to follow (find via Nansen/Arkham public profiles). Watch on-chain moves via Helius webhooks (Solana) and Alchemy webhooks (EVM). When 3+ buy the same new token = Tab 4 alert.

6. **GitHub watchlist**: New repos by devs you respect, new commits on protocols you follow. Often you hear about projects before launch.

7. **Protocol blog RSS aggregator**: Vitalik's blog, Solana Foundation, Arbitrum, Polygon zkEVM, EigenLayer, Optimism, Base. Often hours ahead of news sites.

8. **Bridge fee monitor**: When moving capital between chains for a mint or trade. LiFi or Socket aggregator quotes. Saves 10-30% per move.

9. **Cost dashboard**: How much DGrid you're burning per scanner per day. Per-agent daily budget cap in `agent_configs.dailyBudgetUsd`. Auto-pause if exceeded.

10. **Telegram alert pipeline**: When `score > threshold`, push to your phone. Critical for time-sensitive mints and meme entries. Use a private bot, env-store the token, never log the chat ID publicly.

11. **Bookmark + journal**: Every result row has a bookmark button. Bookmarked items show up in a journal tab where you log "bought", "passed", "watching", with notes. Builds your personal alpha record and feeds back into prediction backtesting.

12. **Prediction backtest mode**: Replay past markets, log what your analyst agent predicted vs actual outcome. Validates the 60% number and tunes the prompt over time.

13. **Read-only mode for showing friends**: A `?demo=true` query param that anonymizes wallets and disables rescan triggers. Useful when you want to flex without exposing your watchlist.

---

## Build phases (four solo weekends)

### Week 1: Foundation
- Init Next.js 15 + Drizzle + Postgres + Tailwind + shadcn
- Wire DGrid via Vercel AI SDK (one test call from a server action)
- Auth (Clerk free tier or basic password)
- Sidebar + tab skeleton (empty placeholder pages)
- **Chat tab fully working end-to-end** — this validates DGrid integration before you build anything else
- Inngest setup with one dummy scheduled function

### Week 2: Cheap scanners (no rate-limit pain)
- News scanner (RSS + CryptoPanic, classifier model)
- Dev Events scanner (ETHGlobal + Devfolio)
- Daily morning brief that aggregates these two — proves the multi-agent synthesis pattern works

### Week 3: Trading-sensitive scanners
- Meme radar (DexScreener + Birdeye + KOL wallets)
- NFT mints (Reservoir + Magic Eden)
- Prediction markets with analyst LLM
- Telegram alerts wired in

### Week 4: Polish + extras
- X creator events scanner
- Build ideas scanner (consumes others)
- Bookmark + journal
- Cost dashboard
- One or two from the "missed" list (airdrop tracker is highest leverage)

---

## .env.example

```bash
# === DGrid ===
DGRID_API_KEY=
DGRID_BASE_URL=https://api.dgrid.ai/v1   # confirm at docs.dgrid.ai

# === Data sources ===
CRYPTOPANIC_TOKEN=
TWITTERAPI_IO_KEY=
RESERVOIR_API_KEY=
MAGICEDEN_API_KEY=
BIRDEYE_API_KEY=
HELIUS_API_KEY=
ALCHEMY_KEY_ETH=
ALCHEMY_KEY_BASE=
ALCHEMY_KEY_ARB=
ALCHEMY_KEY_POLYGON=
ALCHEMY_KEY_OP=
COINGLASS_API_KEY=
TOKENUNLOCKS_API_KEY=

# Polymarket / Manifold / Kalshi are mostly public — no keys needed for reads

# === Infra ===
DATABASE_URL=postgres://user:pass@localhost:5432/alpha_agent
UPSTASH_REDIS_URL=
UPSTASH_REDIS_TOKEN=
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=

# === Alerts ===
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=

# === Auth ===
AUTH_SECRET=
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## CLAUDE.md (drop this file in repo root)

```md
# Project: Alpha Agent Dashboard

Personal 24/7 crypto intelligence dashboard. Multi-chain target: Solana, Ethereum, Polygon, Arbitrum, Base, Optimism.

## Stack constraints (DO NOT change without explicit approval)
- Next.js 15 App Router, TypeScript strict mode
- Drizzle ORM + Postgres (NOT Prisma)
- Inngest for background jobs (NOT raw cron, NOT a separate Python worker)
- DGrid via Vercel AI SDK OpenAI provider — ALWAYS import model strings from `lib/llm/models.ts`, never hardcode
- shadcn/ui for primitives, Tremor for tables and charts
- Zod schemas for ALL LLM outputs via `generateObject`, never parse free-text

## Code conventions
- Server actions for mutations, RSC for reads, route handlers ONLY for streaming chat + Inngest webhook
- Every external API call lives in `lib/sources/*` — one file per provider, exports typed functions. Agents NEVER call `fetch` directly.
- Every agent in `lib/agents/*.ts` exports `{ run(ctx), schema, defaultCron }`
- Chain identifiers: lowercase strings `sol`, `eth`, `polygon`, `arbitrum`, `base`, `optimism` — single source in `lib/chains.ts`
- All env vars accessed via `lib/env.ts` (Zod-validated), never via `process.env.X` directly in features

## Things to know about the developer
- I build smart contracts across multiple chains (Hardhat/Foundry for EVM, Anchor for Solana). Don't assume EVM patterns work on Solana — different account model, different fee model.
- Always tag scan results with the affected chain(s).
- I value understanding WHY something works differently on each chain — comment chain-specific quirks in code.

## Hard rules
- Never add a separate Python service
- Never introduce Prisma — we use Drizzle
- Never hardcode API keys, RPC URLs, or model strings
- Never suggest auto-trading, wallet signing, or any flow that touches a private key
- Never use deprecated Next.js patterns (pages/, getServerSideProps, getStaticProps)
- Always show estimated chain costs (gas on EVM, compute units on Solana) in UI for any user-actionable item

## When adding a new scanner
1. Add source(s) to `lib/sources/<name>.ts` with typed exports
2. Add agent to `lib/agents/<name>.ts` with Zod output schema
3. Register in `lib/agents/registry.ts`
4. Add Inngest function in `inngest/functions/<name>.ts`
5. Add UI tab in `app/(dashboard)/<name>/page.tsx`
6. Drizzle migrate if new fields needed
7. Update this file's agent list if adding to the canonical seven

## Testing
- Vitest for unit tests on agents (mock the LLM call, assert schema-compliant output)
- Playwright for one happy-path E2E on the dashboard
```

---

## Cost estimate (monthly, personal use)

| Item | Cost |
|---|---|
| DGrid (mix of cheap classifiers + occasional reasoner) | $5-20 |
| twitterapi.io (capped at 500 tweets/day per scanner) | $5-15 |
| Helius (Solana RPC) | free tier |
| Alchemy (EVM RPC) | free tier |
| Reservoir (NFT data) | free tier |
| Birdeye | free tier or $10 |
| Supabase or Neon (Postgres) | free tier |
| Upstash Redis | free tier |
| Vercel (frontend) | free / hobby |
| Inngest | free tier |
| **Total** | **$10-50/month** |

Cap each agent's daily DGrid spend in `agent_configs.dailyBudgetUsd` so a runaway loop can't burn $500 overnight.

---

## Security notes

- **Single-user app**: put it behind auth, or use Cloudflare Zero Trust if you expose it publicly
- **No wallet integration**: this is a read-only intelligence dashboard. Trading is manual, in your normal wallet. Don't let this app hold keys.
- **RPC keys are spending keys** — they don't sign transactions but they do have rate-limit budgets. Rotate them like passwords.
- **Telegram bot**: bot whose chat is private to you (use `/setjoingroups Disable`)
- **DGrid daily limits**: set a hard cap on the DGrid dashboard so a bug can't drain your credits
- **Prediction tab signals are not financial advice** — every action is on you, especially meme tokens which can rug at any time. The `rugCheck` field in meme output is a heuristic, not a guarantee.

---

## What to ask Claude Code first

When you open Claude Code in the empty repo:

1. "Read PLAN.md and CLAUDE.md. Then scaffold the project structure per the file tree, install dependencies, set up Drizzle + Postgres locally with docker-compose, and create the empty page stubs."

2. After that's working: "Build the chat tab end-to-end with model swap. Use the DGrid client. Don't touch any agent code yet."

3. Then go scanner by scanner in the order from the build phases.

Hand Claude Code one phase at a time — never "build everything." It'll over-fit if the scope is too broad.
