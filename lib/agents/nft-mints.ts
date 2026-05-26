import { generateText } from 'ai';
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

const en = (v: unknown) => String(v ?? '').toLowerCase().trim().replace(/[\s-]+/g, '_');

export const NFTMintSchema = z.object({
  name:              z.string(),
  chain:             z.preprocess(v => {
    const m: Record<string, string> = {
      sol: 'sol', solana: 'sol',
      eth: 'eth', ethereum: 'eth',
      base: 'base',
      arbitrum: 'arbitrum', arb: 'arbitrum',
      polygon: 'polygon', matic: 'polygon',
      bnb: 'bnb', bsc: 'bnb',
    };
    return m[String(v ?? '').toLowerCase().trim()] ?? String(v ?? '').toLowerCase().trim();
  }, z.enum(['sol', 'eth', 'base', 'arbitrum', 'polygon', 'bnb'])).catch('eth'),
  mintPrice:         z.number().transform(n => Math.max(0, n)),
  mintPriceCurrency: z.string(),
  supply:            z.number().transform(n => Math.round(n)).optional(),
  mintStatus:        z.preprocess(en, z.enum(['not_started', 'live', 'ending_soon', 'sold_out'])).catch('not_started'),
  mintLink:          z.string().optional(),
  contractAddress:   z.string().optional(),
  contractVerified:  z.boolean().catch(false),
  teamDoxxed:        z.boolean().catch(false),

  ctMentions:     z.number().transform(n => Math.max(0, Math.round(n))),
  ctVelocity:     z.number().transform(n => Math.max(0, n)),
  mentionedByKOL: z.boolean().catch(false),
  kolHandles:     z.array(z.string()).catch([]),

  alphaScore:     z.number().transform(n => Math.max(0, Math.min(100, Math.round(n)))),
  alphaBreakdown: z.string().transform(s => s.slice(0, 400)),

  rugRisk:  z.preprocess(en, z.enum(['low', 'medium', 'high', 'critical'])).catch('medium'),
  rugFlags: z.array(z.string()).catch([]),

  futurePotential:   z.number().transform(n => Math.max(1, Math.min(10, Math.round(n)))),
  floorPrediction7d: z.string().optional(),
  similarTo:         z.string().optional(),

  isFree:          z.boolean().catch(false),
  mintStrategy:    z.string().transform(s => s.slice(0, 300)),
  bluechipScore:   z.number().transform(n => Math.max(0, Math.min(100, Math.round(n)))),
  nextSteps:       z.string().transform(s => s.slice(0, 200)),

  whaleActivity: z.boolean().catch(false),
  whaleWallets:  z.array(z.string()).catch([]),
  gasEstimate:   z.string().optional(),
  source:        z.string(),
});

export type NFTMint = z.infer<typeof NFTMintSchema>;

// ── Per-project analysis (Sonnet 4.6 + Grok live CT context) ─────────────────

async function analyzeProject(raw: RawNFTProject, _grokContext: string): Promise<NFTMint | null> {
  try {
    const { text } = await generateText({
      model:       dgrid(MODELS.classifier),
      abortSignal: AbortSignal.timeout(45_000),
      prompt: `Analyze this NFT project. Reply with ONLY a JSON object — no markdown, no explanation.

Project: ${raw.name} on ${raw.chain}
Price: ${raw.mintPrice} ${raw.mintPriceCurrency} | Supply: ${raw.supply ?? 'unknown'}
Status: ${raw.mintStatus} | Contract: ${raw.contractAddress ?? 'none'} (verified: ${raw.contractVerified})
Team doxxed: ${raw.teamDoxxed} | CT: ${raw.ctMentions} mentions @ ${raw.ctVelocity}/hr
KOL: ${raw.mentionedByKOL} | Whales: ${raw.whaleActivity}
Link: ${raw.mintLink ?? 'none'} | Source: ${raw.source}

Return this exact JSON (ONLY these allowed values):
{
  "name": "${raw.name.replace(/"/g, "'")}",
  "chain": "${raw.chain}",
  "mintPrice": ${raw.mintPrice},
  "mintPriceCurrency": "${raw.mintPriceCurrency}",
  "supply": ${raw.supply ?? null},
  "mintStatus": "<one of: not_started, live, ending_soon, sold_out>",
  "mintLink": ${raw.mintLink ? `"${raw.mintLink}"` : 'null'},
  "contractAddress": ${raw.contractAddress ? `"${raw.contractAddress}"` : 'null'},
  "contractVerified": ${raw.contractVerified},
  "teamDoxxed": ${raw.teamDoxxed},
  "ctMentions": ${raw.ctMentions},
  "ctVelocity": ${raw.ctVelocity},
  "mentionedByKOL": ${raw.mentionedByKOL},
  "kolHandles": ${JSON.stringify(raw.kolHandles)},
  "alphaScore": <0-100>,
  "alphaBreakdown": "<why this score, max 300 chars>",
  "rugRisk": "<one of: low, medium, high, critical>",
  "rugFlags": ["<flag>"],
  "futurePotential": <1-10>,
  "floorPrediction7d": "<e.g. 0.05 ETH or null>",
  "similarTo": "<e.g. early Azuki or null>",
  "isFree": ${raw.mintPrice === 0},
  "mintStrategy": "<concrete advice max 250 chars>",
  "bluechipScore": <0-100>,
  "nextSteps": "<one sentence what to do now, max 150 chars>",
  "whaleActivity": ${raw.whaleActivity},
  "whaleWallets": ${JSON.stringify(raw.whaleWallets)},
  "gasEstimate": ${raw.gasEstimate ? `"${raw.gasEstimate}"` : 'null'},
  "source": "${raw.source}"
}`,
    });

    const match = text.match(/\{[\s\S]*\}/);
    if (!match) { console.error('[nft-mints] no JSON for', raw.name); return null; }

    let obj: Record<string, unknown>;
    try { obj = JSON.parse(match[0]); }
    catch (e) { console.error('[nft-mints] JSON.parse failed', e); return null; }

    const parsed = NFTMintSchema.safeParse(obj);
    if (!parsed.success) {
      console.error('[nft-mints] schema failed for', raw.name, JSON.stringify(parsed.error.issues[0]));
      return null;
    }
    return parsed.data;
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
