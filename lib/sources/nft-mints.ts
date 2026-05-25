import { generateObject } from 'ai';
import { z } from 'zod';
import { dgrid } from '@/lib/llm/client';
import { MODELS } from '@/lib/llm/models';
import { env } from '@/lib/env';

// ── Raw project schema from Grok scan ────────────────────────────────────────

const GrokNFTSchema = z.object({
  projects: z.array(z.object({
    name:              z.string(),
    chain:             z.enum(['sol', 'eth', 'base', 'arbitrum', 'polygon', 'bnb']),
    mintPrice:         z.number().min(0),           // 0 = free
    mintPriceCurrency: z.string(),                  // ETH / SOL / MATIC etc.
    supply:            z.number().int().optional(),
    mintStatus:        z.enum(['not_started', 'live', 'ending_soon', 'sold_out']),
    mintLink:          z.string().optional(),
    contractAddress:   z.string().optional(),
    contractVerified:  z.boolean(),
    teamDoxxed:        z.boolean(),
    ctMentions:        z.number().int().min(0),     // total CT mentions found
    ctVelocity:        z.number().min(0),           // approx mentions/hour
    mentionedByKOL:    z.boolean(),
    kolHandles:        z.array(z.string()),
    whaleActivity:     z.boolean(),
    whaleWallets:      z.array(z.string()),
    gasEstimate:       z.string().optional(),       // '~0.003 ETH' or '~5000 CU'
  })).max(25),
});

export type RawNFTProject = z.infer<typeof GrokNFTSchema>['projects'][0] & {
  source: 'grok' | 'reservoir' | 'magiceden';
};

// ── Grok CT early signal scan ─────────────────────────────────────────────────

export async function scanCTForMints(): Promise<RawNFTProject[]> {
  try {
    const { object } = await generateObject({
      model:       dgrid(MODELS.classifier),  // deepseek-v3.2 — confirmed working
      schema:      GrokNFTSchema,
      mode:        'json',
      abortSignal: AbortSignal.timeout(60_000),
      prompt: `You have real-time access to X (Twitter). Search CT (Crypto Twitter) RIGHT NOW for NFT mints that are either live, about to launch, or just announced — especially early signals with few mentions.

Search signals:
- "free mint" + any contract address or link
- "mint is live" OR "minting now" OR "mint opens"
- "allowlist" OR "whitelist" OR "WL spots" + NFT project name
- "stealth launch" OR "stealth mint"
- "cNFT" OR "compressed NFT" (Solana near-free mints)
- New project announcements from NFT KOL accounts

Chains to cover: Solana (sol), Ethereum (eth), Base (base), Arbitrum (arbitrum), Polygon (polygon), BNB Chain (bnb)

For each project found:
- ctMentions: total number of unique accounts mentioning it on X right now
- ctVelocity: estimate how many mentions per hour (growing fast = high velocity)
- mentionedByKOL: true if any account with 10k+ followers mentioned it
- kolHandles: list of influential handles mentioning it (without @)
- whaleActivity: true if known whale wallets are minting (check on-chain if possible)
- teamDoxxed: true if team identity is known
- contractVerified: true if contract is verified on-chain
- gasEstimate: approximate gas cost in native token

PRIORITY: Find projects with fewer than 50 total mentions that are growing fast — that's the early alpha.`,
    });

    return object.projects.map((p) => ({ ...p, source: 'grok' as const }));
  } catch {
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
