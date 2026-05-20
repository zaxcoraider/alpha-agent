import { type NextRequest, NextResponse } from 'next/server';
import { inngest } from '@/inngest/client';
import { sendTelegram, setWebhook } from '@/lib/telegram';
import { env } from '@/lib/env';
import { db } from '@/lib/db/client';
import { scanResults, scanRuns } from '@/lib/db/schema';
import { desc, eq } from 'drizzle-orm';

interface TelegramUpdate {
  message?: {
    chat: { id: number };
    text?: string;
  };
}

// ─── GET — one-time webhook registration ──────────────────────────────────────
// Visit /api/telegram?setup=https://your-server.com to register the webhook

export async function GET(req: NextRequest): Promise<NextResponse> {
  const url = req.nextUrl.searchParams.get('setup');
  if (!url) return NextResponse.json({ ok: false, error: 'Pass ?setup=YOUR_PUBLIC_URL' });
  const ok = await setWebhook(url);
  return NextResponse.json({ ok, webhook: `${url}/api/telegram` });
}

// ─── POST — Telegram webhook handler ─────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  const update = await req.json() as TelegramUpdate;
  const msg = update.message;
  if (!msg?.text) return NextResponse.json({ ok: true });

  const chatId   = String(msg.chat.id);
  const text     = msg.text.trim();
  const allowed  = env.TELEGRAM_CHAT_ID;

  // Security — only respond to the owner
  if (allowed && chatId !== allowed) return NextResponse.json({ ok: true });

  // ── /start or /help ───────────────────────────────────────────────────────
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

    // Tell them their chat ID if not configured yet
    if (!allowed) {
      await sendTelegram(
        chatId,
        `Your chat ID is <code>${chatId}</code>\nAdd to .env.local:\nTELEGRAM_CHAT_ID=${chatId}`,
      );
    }
    return NextResponse.json({ ok: true });
  }

  // ── /scan ─────────────────────────────────────────────────────────────────
  if (text === '/scan') {
    await sendTelegram(chatId, '⏳ Triggering prediction scan… You\'ll get an alert when done (~3–5 min).');
    await inngest.send({ name: 'agent/prediction.run', data: { trigger: 'telegram' } });
    return NextResponse.json({ ok: true });
  }

  // ── /status ───────────────────────────────────────────────────────────────
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
        const found = run.itemsFound ?? '?';
        await sendTelegram(chatId, [
          `📊 <b>Last Scan</b>`,
          `Status: ${run.status}`,
          `Finished: ${when}`,
          `Markets scanned: ${found}`,
        ].join('\n'));
      }
    } catch {
      await sendTelegram(chatId, 'Could not fetch status — is Postgres running?');
    }
    return NextResponse.json({ ok: true });
  }

  // ── /predict <question> ───────────────────────────────────────────────────
  const predictMatch = text.match(/^\/predict\s+([\s\S]+)$/i);
  if (predictMatch) {
    const question = predictMatch[1].trim();
    await sendTelegram(
      chatId,
      `🔮 <b>Analyzing…</b>\n<i>${question}</i>\n\n10-analyst ensemble + Grok X context — ~60 seconds.`,
    );
    await inngest.send({
      name: 'agent/custom-predict',
      data: { question, chatId },
    });
    return NextResponse.json({ ok: true });
  }

  // Unknown command
  if (text.startsWith('/')) {
    await sendTelegram(chatId, 'Unknown command. Send /help to see available commands.');
  }

  return NextResponse.json({ ok: true });
}
