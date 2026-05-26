import { generateObject } from 'ai';
import { z } from 'zod';
import { dgrid } from '@/lib/llm/client';
import { MODELS } from '@/lib/llm/models';
import {
  scanCTForMints,
  fetchReservoirMints,
  fetchMagicEdenMints,
  type RawNFTProject,
} from '@/lib/sources/nft-mints';

// ── Output schema ─────────────────────────────────────────────────────────────

export const NFTMintSchema = z.object({
  name:              z.string(),
  chain:             z.enum(['sol', 'eth', 'base', 'arbitrum', 'polygon', 'bnb']),
  mintPrice:         z.number().transform(n => Math.max(0, n)),
  mintPriceCurrency: z.string(),
  supply:            z.number().transform(n => Math.round(n)).optional(),
  mintStatus:        z.enum(['not_started', 'live', 'ending_soon', 'sold_out']),
  mintLink:          z.string().optional(),
  contractAddress:   z.string().optional(),
  contractVerified:  z.boolean(),
  teamDoxxed:        z.boolean(),

  ctMentions:     z.number().transform(n => Math.max(0, Math.round(n))),
  ctVelocity:     z.number().transform(n => Math.max(0, n)),
  mentionedByKOL: z.boolean(),
  kolHandles:     z.array(z.string()),

  alphaScore:     z.number().transform(n => Math.max(0, Math.min(100, Math.round(n)))),
  alphaBreakdown: z.string().transform(s => s.slice(0, 400)),

  rugRisk:  z.enum(['low', 'medium', 'high', 'critical']),
  rugFlags: z.array(z.string()),

  futurePotential:   z.number().transform(n => Math.max(1, Math.min(10, Math.round(n)))),
  floorPrediction7d: z.string().optional(),
  similarTo:         z.string().optional(),

  isFree:          z.boolean(),
  mintStrategy:    z.string().transform(s => s.slice(0, 300)),
  bluechipScore:   z.number().transform(n => Math.max(0, Math.min(100, Math.round(n)))),
  nextSteps:       z.string().transform(s => s.slice(0, 200)),

  whaleActivity: z.boolean(),
  whaleWallets:  z.array(z.string()),
  gasEstimate:   z.string().optional(),
  source:        z.string(),
});

export type NFTMint = z.infer<typeof NFTMintSchema>;

// ── Per-project analysis (Sonnet 4.6 + Grok live CT context) ─────────────────

async function analyzeProject(raw: RawNFTProject, grokContext: string): Promise<NFTMint | null> {
  try {
    const { object } = await generateObject({
      model:       dgrid(MODELS.classifier),
      schema:      NFTMintSchema,
      mode:        'json',
      abortSignal: AbortSignal.timeout(60_000),
      prompt: `Analyze this NFT project for alpha score, rug risk, and future potential.

Project data:
Name: ${raw.name}
Chain: ${raw.chain}
Mint price: ${raw.mintPrice} ${raw.mintPriceCurrency} (0 = free)
Supply: ${raw.supply ?? 'unknown'}
Status: ${raw.mintStatus}
Contract: ${raw.contractAddress ?? 'not provided'} | Verified: ${raw.contractVerified}
Team doxxed: ${raw.teamDoxxed}
CT mentions: ${raw.ctMentions} total | Velocity: ${raw.ctVelocity}/hr
KOL mentioned: ${raw.mentionedByKOL} — handles: ${raw.kolHandles.join(', ') || 'none'}
Whale activity: ${raw.whaleActivity} — wallets: ${raw.whaleWallets.join(', ') || 'none'}
Mint link: ${raw.mintLink ?? 'not provided'}
Source: ${raw.source}

LIVE CT CONTEXT (from Grok X search right now):
${grokContext || 'No real-time CT data available.'}

── ALPHA SCORE (0–100) ──
Start from 0, add:
+20 if fewer than 20 total CT mentions (true early alpha)
+15 if CT velocity > 5x/hr growth
+15 if mentioned by verified NFT KOL (10k+ followers)
+15 if known whale wallet is already minting
+10 if free mint (price = 0)
+10 if contract deployed < 48h (new project)
+10 if mint not started yet (earliest signal)
+5  if team has successful past project

── RUG RISK DETECTION ──
0 flags → low | 1-2 → medium | 3-4 → high | 5+ → critical
Flags: anonymous team, unverified contract, high price + no audit, dev wallet >20%, no liquidity lock, copy-paste concept, fake followers, impersonating known project, X account <30 days old.

── FUTURE POTENTIAL (1–10) ──
Consider: unique concept, chain timing, team, community signals, comparable projects.

── FLOOR PREDICTION 7d ──
Best estimate of floor price 7 days post-mint. Format: "X.XX ETH" or "X SOL".

── SIMILAR TO ──
Most similar successful early launch pattern (e.g. "early Azuki signals"). Null if not genuinely similar.

── IS FREE ──
isFree: true if mintPrice === 0. Free mints are highest priority.

── MINT STRATEGY ──
Concrete advice for this project:
- If free: "Mint max wallet limit immediately. List 50% at 2x floor, hold rest."
- If paid: "Only mint if KOL-backed + team doxxed. Budget max 0.05 ETH. Flip at 3x."
Include timing advice (mint window, expected floor timeline).

── BLUE CHIP SCORE (0-100) ──
Probability of becoming a recognized blue chip (BAYC, Azuki, Pudgy Penguins level).
Most projects score 0-10. Only >50 for exceptional signals.

── NEXT STEPS ──
One concrete sentence of what to do RIGHT NOW.

Be precise and honest. If signals are weak, score low.`,
    });

    return { ...object, source: raw.source };
  } catch (err) {
    console.error('[nft-mints] analyzeProject failed:', err);
    return null;
  }
}

// ── Main scan ─────────────────────────────────────────────────────────────────

export async function runNFTMintsScan(): Promise<{
  mints: NFTMint[];
  scanned: number;
}> {
  const [grokProjects, reservoirProjects, magicEdenProjects] = await Promise.all([
    scanCTForMints(),
    fetchReservoirMints(),
    fetchMagicEdenMints(),
  ]);

  const all = [...grokProjects, ...reservoirProjects, ...magicEdenProjects];
  console.log(`[nft-mints] sources returned: grok=${grokProjects.length} reservoir=${reservoirProjects.length} magiceden=${magicEdenProjects.length}`);

  // Deduplicate by name
  const seen = new Set<string>();
  const unique: RawNFTProject[] = [];
  for (const p of all) {
    const key = p.name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
    if (!seen.has(key)) { seen.add(key); unique.push(p); }
  }

  // Grok-first, cap at 5 to stay within Vercel timeout + save credits
  const grokFirst = [
    ...unique.filter((p) => p.source === 'grok'),
    ...unique.filter((p) => p.source !== 'grok'),
  ].slice(0, 5);

  console.log(`[nft-mints] analyzing ${grokFirst.length} projects`);

  // Analyze all in parallel — no second Grok call (saves credits)
  const results = await Promise.allSettled(grokFirst.map((p) => analyzeProject(p, '')));
  const mints: NFTMint[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) mints.push(r.value);
  }

  console.log(`[nft-mints] analysis done: ${mints.length} mints produced`);

  // Filter sold out + sort by alpha score
  const active = mints.filter((m) => m.mintStatus !== 'sold_out');
  active.sort((a, b) => b.alphaScore - a.alphaScore);

  return { mints: active, scanned: all.length };
}
