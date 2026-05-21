import { generateObject } from 'ai';
import { z } from 'zod';
import { dgrid } from '@/lib/llm/client';
import { MODELS } from '@/lib/llm/models';
import { discoverFromGrok, discoverFromTavily, type RawOpportunity } from '@/lib/sources/dev-events';

// ── Output schema ─────────────────────────────────────────────────────────────

export const OpportunitySchema = z.object({
  title:          z.string(),
  type:           z.enum(['hackathon', 'grant', 'bounty', 'audit', 'accelerator', 'bug_bounty', 'prize']),
  description:    z.string().max(400),
  prizeTotal:     z.string().optional(),
  prizeBreakdown: z.string().optional(),
  deadline:       z.string().optional(),       // YYYY-MM-DD
  daysLeft:       z.number().int().min(0).optional(),
  status:         z.enum(['upcoming', 'active', 'closing_soon', 'ended']),
  chains:         z.array(z.string()),
  skills:         z.array(z.string()),
  remote:         z.boolean(),
  location:       z.string().optional(),
  sponsors:       z.array(z.string()),
  matchScore:     z.number().int().min(1).max(10),
  matchReason:    z.string().max(300),
  sourceUrl:      z.string().optional(),
  source:         z.string(),
});

export type ProcessedOpportunity = z.infer<typeof OpportunitySchema>;

// ── Per-opportunity processor (Claude Sonnet) ─────────────────────────────────

async function processOpportunity(raw: RawOpportunity): Promise<ProcessedOpportunity | null> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const { object } = await generateObject({
      model:       dgrid(MODELS.balanced),
      schema:      OpportunitySchema,
      abortSignal: AbortSignal.timeout(20_000),
      prompt: `Process this developer opportunity into structured data. Today is ${today}.

Title: ${raw.title}
Type: ${raw.type}
Description: ${raw.description}
Prize: ${raw.prize ?? 'unknown'}
Deadline: ${raw.deadline ?? 'unknown'}
URL: ${raw.url ?? 'none'}
Organizer: ${raw.organizer ?? 'unknown'}
Skills: ${raw.skills.join(', ') || 'any'}
Chains: ${raw.chains.join(', ') || 'any'}
Remote: ${raw.remote} | Location: ${raw.location ?? 'n/a'}
Sponsors: ${raw.sponsors.join(', ') || 'unknown'}

Match score 1-10 for an EVM + Solana developer (Hardhat/Foundry/Anchor/TypeScript):
+3 prize > $100k  |  +2 EVM or Solana skills  |  +2 remote allowed  |  +1 deadline > 14 days
+1 verified sponsor  |  +1 individual or team participation ok
-2 unclear/unverified prize  |  -3 deadline already passed

Rules:
- deadline: YYYY-MM-DD, estimate if approximate ("end of June" → 2026-06-30), null if unknown
- daysLeft: integer days from today to deadline (0 = today, null if unknown)
- status: ended (deadline passed), closing_soon (daysLeft ≤ 3), active (open now), upcoming (not yet open)
- prizeTotal: e.g. "$500,000" | prizeBreakdown: "1st: $100k · 2nd: $50k · Track A: $25k" if known
- description: max 300 chars, clear action-oriented text
- sourceUrl: best direct link to apply or learn more`,
    });
    return object;
  } catch {
    return null;
  }
}

// ── Main scan runner ──────────────────────────────────────────────────────────

export async function runDevEventsScan(): Promise<{
  opportunities: ProcessedOpportunity[];
  scanned: number;
}> {
  const [grokRaw, tavilyRaw] = await Promise.all([
    discoverFromGrok(),
    discoverFromTavily(),
  ]);

  const all = [...grokRaw, ...tavilyRaw];

  // Title-based dedup before paying for processing
  const seen = new Set<string>();
  const unique: RawOpportunity[] = [];
  for (const r of all) {
    const key = r.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 25);
    if (!seen.has(key)) { seen.add(key); unique.push(r); }
  }

  // Process in batches of 5
  const processed: ProcessedOpportunity[] = [];
  for (let i = 0; i < unique.length; i += 5) {
    const batch = unique.slice(i, i + 5);
    const results = await Promise.allSettled(batch.map(processOpportunity));
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value && r.value.status !== 'ended') {
        processed.push(r.value);
      }
    }
  }

  processed.sort((a, b) => b.matchScore - a.matchScore);

  return { opportunities: processed, scanned: all.length };
}
