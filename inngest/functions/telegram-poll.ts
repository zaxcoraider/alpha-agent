import { inngest } from '../client';
import { env } from '@/lib/env';
import { inngest as inngestClient } from '../client';
import { sendTelegram } from '@/lib/telegram';
import { db } from '@/lib/db/client';
import { scanRuns, scanResults } from '@/lib/db/schema';
import { desc, eq } from 'drizzle-orm';
import type { Prediction } from '@/lib/agents/prediction';

// ─── Telegram update types ────────────────────────────────────────────────────

interface TgMessage {
  message_id: number;
  chat: { id: number };
  text?: string;
}

interface TgUpdate {
  update_id: number;
  message?: TgMessage;
}

interface TgResponse {
  ok: boolean;
  result: TgUpdate[];
}

// ─── Shared command handler (same logic as webhook) ───────────────────────────

async function handleMessage(msg: TgMessage): Promise<void> {
  const chatId  = String(msg.chat.id);
  const text    = msg.text?.trim() ?? '';
  const allowed = env.TELEGRAM_CHAT_ID;

  if (allowed && chatId !== allowed) return;

  if (text === '/start' || text === '/help') {
    await sendTelegram(chatId, [
      '👋 <b>Alpha Agent</b>',
      '',
      '<b>Commands:</b>',
      '/scan — trigger prediction scan now',
      '/predict &lt;question&gt; — analyze any question',
      '/status — last scan results',
      '/help — this message',
      '',
      '<b>Example:</b>',
      '/predict Will BTC hit $200k by end of 2026?',
    ].join('\n'));

    if (!allowed) {
      await sendTelegram(chatId,
        `Your chat ID is <code>${chatId}</code>\nAdd to .env.local:\nTELEGRAM_CHAT_ID=${chatId}`);
    }
    return;
  }

  if (text === '/scan') {
    await sendTelegram(chatId, '⏳ Triggering prediction scan… You\'ll get an alert when done (~3–5 min).');
    await inngestClient.send({ name: 'agent/prediction.run', data: { trigger: 'telegram' } });
    return;
  }

  if (text === '/status') {
    try {
      const lastRun = await db
        .select()
        .from(scanRuns)
        .where(eq(scanRuns.agent, 'prediction'))
        .orderBy(desc(scanRuns.startedAt))
        .limit(1);
      const run = lastRun[0];
      if (!run) {
        await sendTelegram(chatId, '📊 No scans run yet. Send /scan to start.');
      } else {
        const when  = run.finishedAt ? new Date(run.finishedAt).toLocaleString() : 'in progress';
        await sendTelegram(chatId, [
          '📊 <b>Last Scan</b>',
          `Status: ${run.status}`,
          `Finished: ${when}`,
          `Markets scanned: ${run.itemsFound ?? '?'}`,
        ].join('\n'));
      }
    } catch {
      await sendTelegram(chatId, 'Could not fetch status — is Postgres running?');
    }
    return;
  }

  const predictMatch = text.match(/^\/predict\s+([\s\S]+)$/i);
  if (predictMatch) {
    const question = predictMatch[1].trim();
    await sendTelegram(chatId,
      `🔮 <b>Analyzing…</b>\n<i>${question}</i>\n\n10-analyst ensemble + Grok X — ~60 seconds.`);
    await inngestClient.send({
      name: 'agent/custom-predict',
      data: { question, chatId },
    });
    return;
  }

  if (text.startsWith('/')) {
    await sendTelegram(chatId, 'Unknown command. Send /help for available commands.');
  }
}

// ─── Inngest polling function ─────────────────────────────────────────────────

export const telegramPoll = inngest.createFunction(
  { id: 'telegram-poll', name: 'Telegram Bot Polling' },
  [
    { cron: '*/1 * * * *' },              // every 60 seconds
    { event: 'agent/telegram.poll' },     // manual trigger
  ],
  async ({ step }) => {
    if (!env.TELEGRAM_BOT_TOKEN) return { skipped: true };

    const base = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}`;

    // Fetch pending updates
    const updates = await step.run('fetch-updates', async () => {
      const res = await fetch(`${base}/getUpdates?timeout=0&limit=100`, {
        signal: AbortSignal.timeout(10_000),
      });
      const data = await res.json() as TgResponse;
      return data.ok ? data.result : [];
    });

    if (updates.length === 0) return { processed: 0 };

    // Process each message
    await step.run('process-messages', async () => {
      for (const update of updates) {
        if (update.message) {
          await handleMessage(update.message);
        }
      }
    });

    // Confirm receipt — tells Telegram not to resend these updates
    const lastId = updates[updates.length - 1].update_id;
    await step.run('confirm-receipt', async () => {
      await fetch(`${base}/getUpdates?offset=${lastId + 1}&limit=1&timeout=0`);
    });

    return { processed: updates.length };
  },
);
