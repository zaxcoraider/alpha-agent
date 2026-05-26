import { generateText, generateObject } from 'ai';
import { z } from 'zod';
import { dgrid, dgridNoTemp } from '@/lib/llm/client';
import { MODELS } from '@/lib/llm/models';
import { env } from '@/lib/env';

// ── Raw project schema from Grok scan ────────────────────────────────────────

const en = (v: unknown) => String(v ?? '').toLowerCase().trim().replace(/[\s-]+/g, '_');

const GrokNFTSchema = z.object({
  projects: z.array(z.object({
    name:              z.string(),
    chain:             z.preprocess(v => {
      const m: Record<string, string> = {
        sol: 'sol', solana: 'sol', eth: 'eth', ethereum: 'eth', base: 'base',
        arbitrum: 'arbitrum', arb: 'arbitrum', polygon: 'polygon', matic: 'polygon',
        bnb: 'bnb', bsc: 'bnb',
      };
      return m[String(v ?? '').toLowerCase().trim()] ?? 'eth';
    }, z.enum(['sol', 'eth', 'base', 'arbitrum', 'polygon', 'bnb'])).catch('eth'),
    mintPrice:         z.number().transform(n => Math.max(0, n)),
    mintPriceCurrency: z.string(),
    supply:            z.number().transform(n => Math.round(n)).optional(),
    mintStatus:        z.preprocess(en, z.enum(['not_started', 'live', 'ending_soon', 'sold_out'])).catch('not_started'),
    mintLink:          z.string().optional(),
    contractAddress:   z.string().optional(),
    contractVerified:  z.boolean().catch(false),
    teamDoxxed:        z.boolean().catch(false),
    ctMentions:        z.number().transform(n => Math.max(0, Math.round(n))),
    ctVelocity:        z.number().transform(n => Math.max(0, n)),
    mentionedByKOL:    z.boolean().catch(false),
    kolHandles:        z.array(z.string()).catch([]),
    whaleActivity:     z.boolean().catch(false),
    whaleWallets:      z.array(z.string()).catch([]),
    gasEstimate:       z.string().optional(),
  })),
});

export type RawNFTProject = z.infer<typeof GrokNFTSchema>['projects'][0] & {
  source: 'grok' | 'reservoir' | 'magiceden';
};

// ── 2-step pipeline: Grok fetches live CT → DeepSeek structures it ────────────

export async function scanCTForMints(): Promise<RawNFTProject[]> {
  // Step 1: Grok searches X in real-time for live NFT mint signals
  let ctReport = '';
  try {
    const { text } = await generateText({
      model:       dgridNoTemp(MODELS.grok),
      abortSignal: AbortSignal.timeout(40_000),
      prompt: `Search X (Twitter) right now for NFT mint opportunities — live, about to launch, or just announced. Focus on early signals with few mentions.

Search for:
- "free mint" + contract address or link
- "mint is live" OR "minting now" OR "mint opens"
- "allowlist" OR "whitelist" OR "WL spots" + NFT project name
- "stealth launch" OR "stealth mint"
- "cNFT" OR "compressed NFT" (Solana near-free mints)
- New project announcements from NFT KOL accounts

Chains: Solana, Ethereum, Base, Arbitrum, Polygon, BNB Chain

For each project found, report: project name, chain, mint price, mint status (live/upcoming/sold out), mint link, how many X accounts are talking about it, which KOLs mentioned it, any on-chain whale activity, whether team is doxxed, gas estimate.

Prioritize projects with fewer than 50 mentions that are growing fast — those are early alpha.`,
    });
    ctReport = text;
  } catch (err) {
    console.error('[sources/nft-mints] Grok step-1 failed:', err);
    return [];
  }

  if (!ctReport.trim()) return [];

  // Step 2: DeepSeek parses Grok's live report into structured schema
  try {
    const { object } = await generateObject({
      model:       dgrid(MODELS.classifier),
      schema:      GrokNFTSchema,
      mode:        'json',
      abortSignal: AbortSignal.timeout(60_000),
      prompt: `Parse the following real-time NFT mint intelligence report (fetched from Grok's live X search) into structured projects.

LIVE CT REPORT:
${ctReport}

Rules:
- Only extract projects explicitly mentioned in the report — no hallucinations
- ctMentions: unique X accounts mentioning the project
- ctVelocity: approximate mentions per hour
- contractVerified: true only if explicitly stated
- gasEstimate: format as "~0.003 ETH" or "~5000 CU" (Solana compute units)`,
    });

    return object.projects.map((p) => ({ ...p, source: 'grok' as const }));
  } catch (err) {
    console.error('[sources/nft-mints] DeepSeek step-2 failed:', err);
    return [];
  }
}

// ── Reservoir — EVM trending mints (optional) ─────────────────────────────────

export async function fetchReservoirMints(): Promise<RawNFTProject[]> {
  if (!env.RESERVOIR_API_KEY) return [];

  try {
    const res = await fetch(
      'https://api.reservoir.tools/collections/v7?sortBy=1DayVolume&limit=15&onSaleCount=1',
      {
        headers: { 'x-api-key': env.RESERVOIR_API_KEY, 'accept': 'application/json' },
        signal:  AbortSignal.timeout(10_000),
      },
    );
    if (!res.ok) return [];

    const data = await res.json() as {
      collections?: {
        name?: string; contractAddresses?: string[];
        floorAsk?: { price?: { amount?: { native?: number } } };
        tokenCount?: string;
        mintStages?: { kind?: string }[];
        chainId?: number;
      }[]
    };

    return (data.collections ?? []).map((c): RawNFTProject => {
      const chainMap: Record<number, RawNFTProject['chain']> = {
        1: 'eth', 8453: 'base', 42161: 'arbitrum', 137: 'polygon', 56: 'bnb',
      };
      return {
        name:              c.name ?? 'Unknown',
        chain:             chainMap[c.chainId ?? 1] ?? 'eth',
        mintPrice:         c.floorAsk?.price?.amount?.native ?? 0,
        mintPriceCurrency: 'ETH',
        supply:            c.tokenCount ? parseInt(c.tokenCount) : undefined,
        mintStatus:        c.mintStages?.length ? 'live' : 'not_started',
        contractAddress:   c.contractAddresses?.[0],
        contractVerified:  true,
        teamDoxxed:        false,
        ctMentions:        0,
        ctVelocity:        0,
        mentionedByKOL:    false,
        kolHandles:        [],
        whaleActivity:     false,
        whaleWallets:      [],
        source:            'reservoir',
      };
    });
  } catch {
    return [];
  }
}

// ── Magic Eden — Solana launchpad (optional) ──────────────────────────────────

export async function fetchMagicEdenMints(): Promise<RawNFTProject[]> {
  try {
    const res = await fetch(
      'https://api-mainnet.magiceden.dev/v2/launchpad/collections?offset=0&limit=15',
      { signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) return [];

    const data = await res.json() as {
      collections?: {
        name?: string; symbol?: string;
        price?: number; size?: number;
        launchDatetime?: string; mintAddress?: string;
      }[]
    };

    const now = Date.now();
    return (data.collections ?? []).map((c): RawNFTProject => {
      const launchMs = c.launchDatetime ? new Date(c.launchDatetime).getTime() : now;
      const status: RawNFTProject['mintStatus'] =
        launchMs > now ? 'not_started' : 'live';

      return {
        name:              c.name ?? 'Unknown',
        chain:             'sol',
        mintPrice:         c.price ?? 0,
        mintPriceCurrency: 'SOL',
        supply:            c.size,
        mintStatus:        status,
        contractAddress:   c.mintAddress,
        contractVerified:  true,
        teamDoxxed:        false,
        ctMentions:        0,
        ctVelocity:        0,
        mentionedByKOL:    false,
        kolHandles:        [],
        whaleActivity:     false,
        whaleWallets:      [],
        source:            'magiceden',
      };
    });
  } catch {
    return [];
  }
}
