import { generateObject } from 'ai';
import { z } from 'zod';
import { dgrid } from '@/lib/llm/client';
import { MODELS } from '@/lib/llm/models';
import { tavilySearch } from '@/lib/sources/tavily';

// ── Schema ────────────────────────────────────────────────────────────────────

const OpportunityListSchema = z.object({
  opportunities: z.array(z.object({
    title:       z.string(),
    type:        z.enum(['hackathon', 'grant', 'bounty', 'audit', 'accelerator', 'bug_bounty', 'prize']),
    description: z.string().max(300),
    prize:       z.string().optional(),
    deadline:    z.string().optional(),
    url:         z.string().optional(),
    organizer:   z.string().optional(),
    skills:      z.array(z.string()),
    chains:      z.array(z.string()),
    remote:      z.boolean(),
    location:    z.string().optional(),
    sponsors:    z.array(z.string()),
  })).max(20),
});

export type RawOpportunity = z.infer<typeof OpportunityListSchema>['opportunities'][0] & {
  source: 'grok' | 'tavily';
};

// ── Grok X discovery ──────────────────────────────────────────────────────────

export async function discoverFromGrok(): Promise<RawOpportunity[]> {
  try {
    const { object } = await generateObject({
      model:       dgrid(MODELS.grok),
      schema:      OpportunityListSchema,
      abortSignal: AbortSignal.timeout(35_000),
      prompt: `You have real-time access to X (Twitter). Search X right now for ALL active and upcoming developer opportunities in crypto/blockchain/AI space — posted in the last 30 days.

Find:
- Hackathons (ETHGlobal, Devfolio, DoraHacks, Devpost, Encode, HackQuest) — any prize size
- Grants (Ethereum Foundation ESP, Solana Foundation, chain ecosystem funds)
- Audit contests (Code4rena, Sherlock, Cantina, Hats Finance — pools $50k–$500k)
- Bug bounties (Immunefi, HackerOne)
- Accelerators (a16z crypto, Paradigm Fellowship, Binance Labs, Coinbase Ventures, YC)
- Prize competitions (xPrize, Google/Gemini challenge, Microsoft, OpenAI, Anthropic, Meta challenges)
- ANY announcement with keywords: "prize pool" "$" "applications open" "hackathon" "grants program" "bounty" "audit contest"

Accounts to search: @ETHGlobal @devfolio @DoraHacks @encodeclub @gitcoin @immunefi @code4rena @sherlock_defi @cantina_xyz @hatsfinance @ethereum @solana @monad_xyz @berachain @hyperliquid_x @a16zcrypto @paradigm @multicoin @binancelabs @coinbaseventures @OpenAI @Anthropic @Google @Microsoft @xAI

Return every opportunity you find. Estimate deadline if approximate ("end of June" → 2026-06-30). Set remote: true unless explicitly in-person only.`,
    });
    return object.opportunities.map((o) => ({ ...o, source: 'grok' as const }));
  } catch {
    return [];
  }
}

// ── Tavily web discovery ──────────────────────────────────────────────────────

const TAVILY_QUERIES = [
  'crypto blockchain hackathon 2026 prize pool registration open',
  'web3 developer grants program 2026 applications open ecosystem fund',
  'smart contract audit contest code4rena sherlock cantina 2026',
  'blockchain developer accelerator 2026 applications cohort',
  'AI web3 innovation challenge prize competition xprize 2026',
];

export async function discoverFromTavily(): Promise<RawOpportunity[]> {
  const chunks: string[] = [];

  await Promise.allSettled(
    TAVILY_QUERIES.map(async (q) => {
      try {
        const { results, answer } = await tavilySearch(q, {
          maxResults:   5,
          searchDepth:  'basic',
          topic:        'general',
        });
        if (answer) chunks.push(`Q: ${q}\nA: ${answer}`);
        for (const r of results) {
          chunks.push(`URL: ${r.url}\n${r.title}\n${r.content.slice(0, 400)}`);
        }
      } catch { /* skip failed queries */ }
    }),
  );

  if (!chunks.length) return [];

  try {
    const { object } = await generateObject({
      model:       dgrid(MODELS.balanced),
      schema:      OpportunityListSchema,
      abortSignal: AbortSignal.timeout(30_000),
      prompt: `Extract all developer opportunities from these web search results. Only include ACTIVE or UPCOMING opportunities — skip anything past its deadline.

Search results:
${chunks.slice(0, 30).join('\n\n---\n\n')}

For each: deadline as approximate ISO date if mentioned, remote: true unless clearly in-person, skills as tech stack (solidity/rust/typescript/anchor/move/cairo), chains as blockchain ecosystems.`,
    });
    return object.opportunities.map((o) => ({ ...o, source: 'tavily' as const }));
  } catch {
    return [];
  }
}
