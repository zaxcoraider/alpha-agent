import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { scanRuns, scanResults } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { MODELS } from '@/lib/llm/models';
import { runMemesScan }   from '@/lib/agents/memes';
import { runXEventsScan } from '@/lib/agents/x-events';
import { runNFTMintsScan } from '@/lib/agents/nft-mints';

export const runtime    = 'nodejs';
export const maxDuration = 300; // 5 min — needs Vercel Pro; Hobby caps at 60s

type DbAgent   = 'memes' | 'x_events' | 'nft';
type DbChain   = 'sol' | 'eth' | 'polygon' | 'arbitrum' | 'base' | 'optimism' | 'bsc' | 'sui' | 'unknown';

const CHAIN_MAP: Record<string, DbChain> = {
  sol: 'sol', eth: 'eth', base: 'base', arbitrum: 'arbitrum',
  polygon: 'polygon', bnb: 'bsc', any: 'unknown',
};

export async function POST(req: Request) {
  const { agent } = await req.json() as { agent: string };

  // ── Memes ──────────────────────────────────────────────────────────────────
  if (agent === 'memes') {
    const [run] = await db.insert(scanRuns).values({
      agent: 'memes', trigger: 'manual', status: 'running', modelUsed: MODELS.balanced,
    }).returning();

    try {
      const { tokens, scanned } = await runMemesScan();

      for (const token of tokens) {
        const rawId      = (token.contractAddress ?? `${token.ticker}-${token.chain}`).slice(0, 60);
        const externalId = `meme-${Buffer.from(rawId).toString('base64').slice(0, 40)}`;
        await db.insert(scanResults).values({
          runId: run.id, agent: 'memes', externalId,
          title:   `${token.name} ($${token.ticker})`,
          summary: token.gemBreakdown,
          url:     token.dexUrl,
          score:   String(token.gemScore / 10),
          chains:  [CHAIN_MAP[token.chain] ?? 'unknown'] as DbChain[],
          raw:     token,
        }).onConflictDoUpdate({
          target: [scanResults.agent, scanResults.externalId],
          set: { summary: token.gemBreakdown, score: String(token.gemScore / 10), raw: token },
        });
      }

      await db.update(scanRuns)
        .set({ status: 'ok', finishedAt: new Date(), itemsFound: String(scanned) })
        .where(eq(scanRuns.id, run.id));

      return NextResponse.json({ ok: true, saved: tokens.length, scanned });
    } catch (err) {
      console.error('[scan-direct/memes]', err);
      const msg = err instanceof Error ? err.message : String(err);
      await db.update(scanRuns).set({ status: 'error', finishedAt: new Date(), error: msg.slice(0, 500) }).where(eq(scanRuns.id, run.id));
      return NextResponse.json({ ok: false, error: msg }, { status: 500 });
    }
  }

  // ── X Events ───────────────────────────────────────────────────────────────
  if (agent === 'x_events') {
    const [run] = await db.insert(scanRuns).values({
      agent: 'x_events', trigger: 'manual', status: 'running', modelUsed: MODELS.balanced,
    }).returning();

    try {
      const { events, scanned } = await runXEventsScan();

      for (const event of events) {
        const rawId      = event.title.slice(0, 60);
        const externalId = `xev-${Buffer.from(rawId).toString('base64').slice(0, 40)}`;
        const chain      = event.chain ? [CHAIN_MAP[event.chain] ?? 'unknown'] : [];
        await db.insert(scanResults).values({
          runId: run.id, agent: 'x_events', externalId,
          title:   event.title,
          summary: event.description,
          url:     event.url,
          score:   String(event.relevanceScore),
          chains:  chain as DbChain[],
          raw:     event,
        }).onConflictDoUpdate({
          target: [scanResults.agent, scanResults.externalId],
          set: { summary: event.description, score: String(event.relevanceScore), raw: event },
        });
      }

      await db.update(scanRuns)
        .set({ status: 'ok', finishedAt: new Date(), itemsFound: String(scanned) })
        .where(eq(scanRuns.id, run.id));

      return NextResponse.json({ ok: true, saved: events.length, scanned });
    } catch (err) {
      console.error('[scan-direct/x_events]', err);
      const msg = err instanceof Error ? err.message : String(err);
      await db.update(scanRuns).set({ status: 'error', finishedAt: new Date(), error: msg.slice(0, 500) }).where(eq(scanRuns.id, run.id));
      return NextResponse.json({ ok: false, error: msg }, { status: 500 });
    }
  }

  // ── NFT Mints ──────────────────────────────────────────────────────────────
  if (agent === 'nft_mints') {
    const [run] = await db.insert(scanRuns).values({
      agent: 'nft', trigger: 'manual', status: 'running', modelUsed: MODELS.balanced,
    }).returning();

    try {
      const { mints, scanned } = await runNFTMintsScan();

      for (const mint of mints) {
        const rawId      = (mint.contractAddress ?? mint.name).slice(0, 60);
        const externalId = `nft-${Buffer.from(rawId).toString('base64').slice(0, 40)}`;
        await db.insert(scanResults).values({
          runId: run.id, agent: 'nft', externalId,
          title:   mint.name,
          summary: mint.alphaBreakdown,
          url:     mint.mintLink,
          score:   String(mint.alphaScore / 10),
          chains:  [CHAIN_MAP[mint.chain] ?? 'unknown'] as DbChain[],
          raw:     mint,
        }).onConflictDoUpdate({
          target: [scanResults.agent, scanResults.externalId],
          set: { summary: mint.alphaBreakdown, score: String(mint.alphaScore / 10), raw: mint },
        });
      }

      await db.update(scanRuns)
        .set({ status: 'ok', finishedAt: new Date(), itemsFound: String(scanned) })
        .where(eq(scanRuns.id, run.id));

      return NextResponse.json({ ok: true, saved: mints.length, scanned });
    } catch (err) {
      console.error('[scan-direct/nft_mints]', err);
      const msg = err instanceof Error ? err.message : String(err);
      await db.update(scanRuns).set({ status: 'error', finishedAt: new Date(), error: msg.slice(0, 500) }).where(eq(scanRuns.id, run.id));
      return NextResponse.json({ ok: false, error: msg }, { status: 500 });
    }
  }

  return NextResponse.json({ error: `Unknown agent: ${agent}` }, { status: 400 });
}
