import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { scanRuns, scanResults } from '@/lib/db/schema';
import { eq, desc, gte } from 'drizzle-orm';
import { MODELS, AGENT_MODELS } from '@/lib/llm/models';
import { runMemesScan }   from '@/lib/agents/memes';
import { runXEventsScan } from '@/lib/agents/x-events';
import { runNFTMintsScan } from '@/lib/agents/nft-mints';
import { runNewsScan } from '@/lib/agents/news';
import { runDevEventsScan } from '@/lib/agents/dev-events';
import { runIdeasSynthesis } from '@/lib/agents/ideas';

export const runtime    = 'nodejs';
export const maxDuration = 300; // 5 min — needs Vercel Pro; Hobby caps at 60s

type DbChain   = 'sol' | 'eth' | 'polygon' | 'arbitrum' | 'base' | 'optimism' | 'bsc' | 'sui' | 'unknown';

const CHAIN_MAP: Record<string, DbChain> = {
  sol: 'sol', solana: 'sol', eth: 'eth', ethereum: 'eth', evm: 'eth',
  base: 'base', arbitrum: 'arbitrum', polygon: 'polygon',
  bnb: 'bsc', bsc: 'bsc', binance: 'bsc', optimism: 'optimism', sui: 'sui',
  any: 'unknown',
};

function toDbChains(chains: string[]): DbChain[] {
  const mapped = chains.map((c) => CHAIN_MAP[c.toLowerCase()] ?? 'unknown');
  return [...new Set(mapped)];
}

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

  // ── News ───────────────────────────────────────────────────────────────────
  if (agent === 'news') {
    const [run] = await db.insert(scanRuns).values({
      agent: 'news', trigger: 'manual', status: 'running', modelUsed: AGENT_MODELS.news,
    }).returning();

    try {
      const { items, scanned } = await runNewsScan();

      for (const item of items) {
        const externalId = `news-${Buffer.from(item.url).toString('base64').slice(0, 40)}`;
        await db.insert(scanResults).values({
          runId: run.id, agent: 'news', externalId,
          title:   item.title,
          summary: item.whyRelevant,
          url:     item.url,
          score:   String(item.score),
          chains:  item.chains as DbChain[],
          raw:     item,
        }).onConflictDoUpdate({
          target: [scanResults.agent, scanResults.externalId],
          set: { summary: item.whyRelevant, score: String(item.score), raw: item },
        });
      }

      await db.update(scanRuns)
        .set({ status: 'ok', finishedAt: new Date(), itemsFound: String(scanned) })
        .where(eq(scanRuns.id, run.id));

      return NextResponse.json({ ok: true, saved: items.length, scanned });
    } catch (err) {
      console.error('[scan-direct/news]', err);
      const msg = err instanceof Error ? err.message : String(err);
      await db.update(scanRuns).set({ status: 'error', finishedAt: new Date(), error: msg.slice(0, 500) }).where(eq(scanRuns.id, run.id));
      return NextResponse.json({ ok: false, error: msg }, { status: 500 });
    }
  }

  // ── Dev Events ─────────────────────────────────────────────────────────────
  if (agent === 'dev_events') {
    const [run] = await db.insert(scanRuns).values({
      agent: 'dev_events', trigger: 'manual', status: 'running', modelUsed: MODELS.grok,
    }).returning();

    try {
      const { opportunities, scanned } = await runDevEventsScan();

      for (const opp of opportunities) {
        const rawId      = (opp.sourceUrl ?? opp.title).slice(0, 60);
        const externalId = `dev-${Buffer.from(rawId).toString('base64').slice(0, 40)}`;
        await db.insert(scanResults).values({
          runId: run.id, agent: 'dev_events', externalId,
          title:   opp.title,
          summary: opp.matchReason,
          url:     opp.sourceUrl,
          score:   String(opp.matchScore),
          chains:  toDbChains(opp.chains),
          raw:     opp,
        }).onConflictDoUpdate({
          target: [scanResults.agent, scanResults.externalId],
          set: { summary: opp.matchReason, score: String(opp.matchScore), raw: opp },
        });
      }

      await db.update(scanRuns)
        .set({ status: 'ok', finishedAt: new Date(), itemsFound: String(scanned) })
        .where(eq(scanRuns.id, run.id));

      return NextResponse.json({ ok: true, saved: opportunities.length, scanned });
    } catch (err) {
      console.error('[scan-direct/dev_events]', err);
      const msg = err instanceof Error ? err.message : String(err);
      await db.update(scanRuns).set({ status: 'error', finishedAt: new Date(), error: msg.slice(0, 500) }).where(eq(scanRuns.id, run.id));
      return NextResponse.json({ ok: false, error: msg }, { status: 500 });
    }
  }

  // ── Ideas (synthesizes across all recent scan results) ────────────────────
  if (agent === 'ideas') {
    const [run] = await db.insert(scanRuns).values({
      agent: 'ideas', trigger: 'manual', status: 'running', modelUsed: MODELS.reasoner,
    }).returning();

    try {
      // Build context summary from last 24h of scan results — same as ideas-scan inngest function
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1_000);
      const rows = await db
        .select({
          agent:   scanResults.agent,
          title:   scanResults.title,
          summary: scanResults.summary,
          score:   scanResults.score,
        })
        .from(scanResults)
        .where(gte(scanResults.createdAt, cutoff))
        .orderBy(desc(scanResults.score), desc(scanResults.createdAt))
        .limit(100);

      const agentLabels: Record<string, string> = {
        prediction: 'PREDICTION MARKETS', news: 'NEWS', nft: 'NFT MINTS',
        memes: 'MEME TOKENS', x_events: 'X EVENTS', dev_events: 'DEV EVENTS / HACKATHONS',
      };
      const grouped: Record<string, typeof rows> = {};
      for (const r of rows) {
        if (r.agent === 'ideas') continue;
        (grouped[r.agent] ??= []).push(r);
      }
      const sections: string[] = [];
      for (const [a, items] of Object.entries(grouped)) {
        const label = agentLabels[a] ?? a.toUpperCase();
        const lines = items.slice(0, 15).map((r) => {
          const score = r.score ? ` [score: ${r.score}]` : '';
          const summary = r.summary ? ` — ${r.summary.slice(0, 120)}` : '';
          return `  • ${r.title}${score}${summary}`;
        });
        sections.push(`## ${label} (${items.length} items)\n${lines.join('\n')}`);
      }
      const contextSummary = sections.length ? sections.join('\n\n') : 'No recent scan data available.';

      const batch = await runIdeasSynthesis(contextSummary);

      for (const idea of batch.ideas) {
        const externalId = `idea-${Buffer.from(idea.title.slice(0, 60)).toString('base64').slice(0, 40)}`;
        await db.insert(scanResults).values({
          runId: run.id, agent: 'ideas', externalId,
          title:   idea.title,
          summary: idea.tldr,
          score:   String(idea.conviction),
          chains:  idea.chains as DbChain[],
          raw:     idea,
        }).onConflictDoUpdate({
          target: [scanResults.agent, scanResults.externalId],
          set: { summary: idea.tldr, score: String(idea.conviction), raw: idea },
        });
      }

      const reportId = `idea-weekly-report-${new Date().toISOString().slice(0, 10)}`;
      await db.insert(scanResults).values({
        runId: run.id, agent: 'ideas', externalId: reportId,
        title:   `Weekly Alpha Report — ${new Date().toLocaleDateString()}`,
        summary: batch.weeklyReport.headline,
        score:   '10',
        chains:  [],
        raw:     { type: 'weekly_report', ...batch.weeklyReport },
      }).onConflictDoUpdate({
        target: [scanResults.agent, scanResults.externalId],
        set: { summary: batch.weeklyReport.headline, raw: { type: 'weekly_report', ...batch.weeklyReport } },
      });

      await db.update(scanRuns)
        .set({ status: 'ok', finishedAt: new Date(), itemsFound: String(batch.ideas.length) })
        .where(eq(scanRuns.id, run.id));

      return NextResponse.json({ ok: true, saved: batch.ideas.length, scanned: batch.ideas.length });
    } catch (err) {
      console.error('[scan-direct/ideas]', err);
      const msg = err instanceof Error ? err.message : String(err);
      await db.update(scanRuns).set({ status: 'error', finishedAt: new Date(), error: msg.slice(0, 500) }).where(eq(scanRuns.id, run.id));
      return NextResponse.json({ ok: false, error: msg }, { status: 500 });
    }
  }

  return NextResponse.json({ error: `Unknown agent: ${agent}` }, { status: 400 });
}
