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