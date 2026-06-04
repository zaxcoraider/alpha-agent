import { inngest } from '../client';
import { runIdeasSynthesis } from '@/lib/agents/ideas';
import { db } from '@/lib/db/client';
import { scanRuns, scanResults } from '@/lib/db/schema';
import { MODELS } from '@/lib/llm/models';
import { eq, desc, gte } from 'drizzle-orm';
import { sendTelegram } from '@/lib/telegram';
import { env } from '@/lib/env';

// ── Chain normalization (agent emits `bnb`; DB enum only accepts `bsc`) ────────
// The synthesis agent's Zod enum yields `bnb`, but scanResults.chains is the
// pgEnum `chain` which has no `bnb` member — an unmapped value throws
// `invalid input value for enum chain: "bnb"` and fails the whole save step.
// Mirror the CHAIN_MAP/toDbChains pattern used by dev-events/memes/nft scanners.
type DbChain = 'sol' | 'eth' | 'polygon' | 'arbitrum' | 'base' | 'optimism' | 'bsc' | 'sui' | 'unknown';

const CHAIN_MAP: Record<string, DbChain> = {
  sol: 'sol', eth: 'eth', base: 'base', arbitrum: 'arbitrum',
  polygon: 'polygon', optimism: 'optimism', sui: 'sui',
  bnb: 'bsc', bsc: 'bsc', binance: 'bsc',
};

function toDbChains(chains: string[]): DbChain[] {
  return [...new Set(chains.map((c) => CHAIN_MAP[c.toLowerCase()] ?? 'unknown'))];
}

// ── Build context summary from recent scan results ────────────────────────────

async function buildContextSummary(): Promise<string> {
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

  if (rows.length === 0) return 'No recent scan data available.';

  // Group by agent and format
  const grouped: Record<string, typeof rows> = {};
  for (const r of rows) {
    if (!grouped[r.agent]) grouped[r.agent] = [];
    grouped[r.agent]!.push(r);
  }

  const sections: string[] = [];

  const agentLabels: Record<string, string> = {
    prediction: 'PREDICTION MARKETS',
    news:       'NEWS',
    nft:        'NFT MINTS',
    memes:      'MEME TOKENS',
    x_events:   'X EVENTS',
    dev_events: 'DEV EVENTS / HACKATHONS',
    ideas:      'PREVIOUS IDEAS', // skip this one
  };

  for (const [agent, items] of Object.entries(grouped)) {
    if (agent === 'ideas') continue;
    const label = agentLabels[agent] ?? agent.toUpperCase();
    const lines = items.slice(0, 15).map((r) => {
      const score = r.score ? ` [score: ${r.score}]` : '';
      const summary = r.summary ? ` — ${r.summary.slice(0, 120)}` : '';
      return `  • ${r.title}${score}${summary}`;
    });
    sections.push(`## ${label} (${items.length} items)\n${lines.join('\n')}`);
  }

  return sections.join('\n\n');
}

// ── Inngest function ──────────────────────────────────────────────────────────

export const ideasScan = inngest.createFunction(
  { id: 'ideas-scan', name: 'Alpha Ideas Synthesizer' },
  [
    { cron: '0 */6 * * *' },         // every 6 hours
    { event: 'agent/ideas.run' },     // manual trigger
  ],
  async ({ step }) => {
    const run = await step.run('create-run', async () => {
      const [r] = await db.insert(scanRuns).values({
        agent:     'ideas',
        trigger:   'cron',
        status:    'running',
        modelUsed: MODELS.reasoner,
      }).returning();
      return r;
    });

    const contextSummary = await step.run('build-context', async () => {
      return buildContextSummary();
    });

    const batch = await step.run('synthesize', async () => {
      return runIdeasSynthesis(contextSummary);
    });

    await step.run('save-and-alert', async () => {
      // Save individual ideas
      for (const idea of batch.ideas) {
        const rawId      = idea.title.slice(0, 60);
        const externalId = `idea-${Buffer.from(rawId).toString('base64').slice(0, 40)}`;

        await db.insert(scanResults).values({
          runId:      run.id,
          agent:      'ideas',
          externalId,
          title:      idea.title,
          summary:    idea.tldr,
          score:      String(idea.conviction),
          chains:     toDbChains(idea.chains),
          raw:        idea,
        }).onConflictDoUpdate({
          target: [scanResults.agent, scanResults.externalId],
          set: {
            summary: idea.tldr,
            score:   String(idea.conviction),
            raw:     idea,
          },
        });
      }

      // Save weekly report as a special entry
      const reportId = `idea-weekly-report-${new Date().toISOString().slice(0, 10)}`;
      await db.insert(scanResults).values({
        runId:      run.id,
        agent:      'ideas',
        externalId: reportId,
        title:      `Weekly Alpha Report — ${new Date().toLocaleDateString()}`,
        summary:    batch.weeklyReport.headline,
        score:      '10',
        chains:     [],
        raw:        { type: 'weekly_report', ...batch.weeklyReport },
      }).onConflictDoUpdate({
        target: [scanResults.agent, scanResults.externalId],
        set: { summary: batch.weeklyReport.headline, raw: { type: 'weekly_report', ...batch.weeklyReport } },
      });

      // Telegram: top build + top trade
      const chatId  = env.TELEGRAM_CHAT_ID;
      const topBuild = batch.ideas.find((i) => i.type === 'build');
      const topTrade = batch.ideas.find((i) => i.type === 'trade');

      if (chatId) {
        const msg = [
          `💡 <b>Alpha Ideas — ${new Date().toLocaleDateString()}</b>`,
          `<i>${batch.weeklyReport.headline}</i>`,
          topBuild ? `\n🔨 <b>Build:</b> ${topBuild.title}\n${topBuild.tldr}` : '',
          topTrade ? `\n📈 <b>Trade:</b> ${topTrade.title}\n${topTrade.tldr}` : '',
        ].filter(Boolean).join('\n');

        await sendTelegram(chatId, msg).catch(() => { /* non-fatal */ });
      }

      await db.update(scanRuns)
        .set({ status: 'ok', finishedAt: new Date(), itemsFound: String(batch.ideas.length) })
        .where(eq(scanRuns.id, run.id));
    });

    return { ideas: batch.ideas.length };
  },
);
