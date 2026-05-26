import { generateText, generateObject } from 'ai';
import { z } from 'zod';
import { dgrid, dgridNoTemp } from '@/lib/llm/client';
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

  isFree:          z.boolean(),
  mintStrategy:    z.string().max(300),
  bluechipScore:   z.number().int().min(0).max(100),
  nextSteps:       z.string().max(200),

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
      model:       dgridNoTemp(MODELS.balanced),
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

  // Deduplicate by name
  const seen = new Set<string>();
  const unique: RawNFTProject[] = [];
  for (const p of all) {
    const key = p.name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
    if (!seen.has(key)) { seen.add(key); unique.push(p); }
  }

  // Grok-first, cap at 20
  const grokFirst = [
    ...unique.filter((p) => p.source === 'grok'),
    ...unique.filter((p) => p.source !== 'grok'),
  ].slice(0, 20);

  // Single Grok call — live CT snapshot for all projects before analysis
  let grokContext = '';
  if (grokFirst.length > 0) {
    const nameList = grokFirst.map((p) => `${p.name} (${p.chain.toUpperCase()})`).join(', ');
    try {
      const { text } = await generateText({
        model:       dgridNoTemp(MODELS.grok),
        abortSignal: AbortSignal.timeout(40_000),
        prompt: `Search X (Twitter) right now for these NFT projects and give me a live CT update for each: ${nameList}.

For each project: is it being discussed on X? Which KOLs are talking about it? Any red flags (rug warnings, team drama, contract issues)? Any positive signals (whale mints, celebrity endorsements, viral posts)? Is the mint currently live? 1-3 sentences per project. If no mentions found, say so.`,
      });
      grokContext = text;
    } catch (err) {
      console.error('[nft-mints] Grok enrichment failed:', err);
    }
  }

  // Analyze in batches of 3, passing live Grok context to each
  const mints: NFTMint[] = [];
  for (let i = 0; i < grokFirst.length; i += 3) {
    const batch   = grokFirst.slice(i, i + 3);
    const results = await Promise.allSettled(batch.map((p) => analyzeProject(p, grokContext)));
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) mints.push(r.value);
    }
  }

  // Filter sold out + sort by alpha score
  const active = mints.filter((m) => m.mintStatus !== 'sold_out');
  active.sort((a, b) => b.alphaScore - a.alphaScore);

  return { mints: active, scanned: all.length };
}
