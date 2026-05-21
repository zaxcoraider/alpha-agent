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
  mintPrice:         z.number().min(0),
  mintPriceCurrency: z.string(),
  supply:            z.number().int().optional(),
  mintStatus:        z.enum(['not_started', 'live', 'ending_soon', 'sold_out']),
  mintLink:          z.string().optional(),
  contractAddress:   z.string().optional(),
  contractVerified:  z.boolean(),
  teamDoxxed:        z.boolean(),

  ctMentions:     z.number().int().min(0),
  ctVelocity:     z.number().min(0),
  mentionedByKOL: z.boolean(),
  kolHandles:     z.array(z.string()),

  alphaScore:     z.number().int().min(0).max(100),
  alphaBreakdown: z.string().max(400),

  rugRisk:  z.enum(['low', 'medium', 'high', 'critical']),
  rugFlags: z.array(z.string()),

  futurePotential:   z.number().int().min(1).max(10),
  floorPrediction7d: z.string().optional(),
  similarTo:         z.string().optional(),

  whaleActivity: z.boolean(),
  whaleWallets:  z.array(z.string()),
  gasEstimate:   z.string().optional(),
  source:        z.string(),
});

export type NFTMint = z.infer<typeof NFTMintSchema>;

// ── Analysis prompt (Claude Opus) ─────────────────────────────────────────────

async function analyzeProject(raw: RawNFTProject): Promise<NFTMint | null> {
  try {
    const { object } = await generateObject({
      model:       dgrid(MODELS.reasoner),       // Claude Opus 4.7
      schema:      NFTMintSchema,
      abortSignal: AbortSignal.timeout(25_000),
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
Check each flag:
- Anonymous team (unknown identity): +1 flag
- Unverified contract: +1 flag
- High price + no audit: +1 flag
- Dev wallet likely >20% supply: +1 flag
- No liquidity lock or vesting: +1 flag
- Copy-paste or unoriginal concept: +1 flag
- Fake/bought follower signals: +1 flag
- Impersonating successful project: +1 flag
- X account likely < 30 days old: +1 flag

0 flags → low | 1-2 flags → medium | 3-4 flags → high | 5+ flags → critical

── FUTURE POTENTIAL (1–10) ──
Consider: unique concept, chain timing, team, community signals, comparable projects.

── FLOOR PREDICTION 7d ──
Best estimate of floor price 7 days post-mint based on comparable launches. Format as "X.XX ETH" or "X SOL".

── SIMILAR TO ──
Name the most similar successful launch this resembles in its early signal pattern (e.g. "early Azuki signals" or "early DeGods pattern"). Only if genuinely similar — null if not.

Be precise and honest. If signals are weak, score low.`,
    });

    return { ...object, source: raw.source };
  } catch {
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

  // Deduplicate by name
  const seen = new Set<string>();
  const unique: RawNFTProject[] = [];
  for (const p of all) {
    const key = p.name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
    if (!seen.has(key)) { seen.add(key); unique.push(p); }
  }

  // Analyze in batches of 3 (Claude Opus is slower/expensive — prioritize Grok finds)
  const grokFirst = [
    ...unique.filter((p) => p.source === 'grok'),
    ...unique.filter((p) => p.source !== 'grok'),
  ].slice(0, 20); // cap at 20 per scan

  const mints: NFTMint[] = [];
  for (let i = 0; i < grokFirst.length; i += 3) {
    const batch   = grokFirst.slice(i, i + 3);
    const results = await Promise.allSettled(batch.map(analyzeProject));
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) mints.push(r.value);
    }
  }

  // Filter out sold out + sort by alpha score
  const active = mints.filter((m) => m.mintStatus !== 'sold_out');
  active.sort((a, b) => b.alphaScore - a.alphaScore);

  return { mints: active, scanned: all.length };
}
