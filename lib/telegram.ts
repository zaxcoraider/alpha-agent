import { env } from './env';
import type { Prediction } from './agents/prediction';

function apiBase(): string | null {
  return env.TELEGRAM_BOT_TOKEN
    ? `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}`
    : null;
}

export async function sendTelegram(chatId: string, text: string): Promise<void> {
  const base = apiBase();
  if (!base) return;
  await fetch(`${base}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  }).catch(() => null);
}

export async function setWebhook(appUrl: string): Promise<boolean> {
  const base = apiBase();
  if (!base) return false;
  const res = await fetch(`${base}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: `${appUrl}/api/telegram` }),
  });
  const data = await res.json() as { ok: boolean; description?: string };
  return data.ok;
}

// ─── Formatters ───────────────────────────────────────────────────────────────

export function formatPredictionCard(p: Prediction): string {
  const emoji = p.recommendedSide === 'YES' ? '✅' : p.recommendedSide === 'NO' ? '🔴' : '⚪';
  const edge  = Math.round(p.edge * 100);
  const conf  = Math.round(p.confidence * 100);
  const mkt   = Math.round(p.marketProb * 100);
  const ens   = Math.round(p.yourProb * 100);
  const src   = p.source ? ` [${p.source}]` : '';
  const mf    = p.miroFishEnhanced ? ' 🐠' : '';

  const lines = [
    `${emoji} <b>${p.recommendedSide} +${edge}% edge${mf}</b>${src}`,
    `<i>${p.question}</i>`,
    `Market ${mkt}% → Ensemble ${ens}% · Conf ${conf}%`,
  ];

  if (p.keyEvidence?.[0]) lines.push(`› ${p.keyEvidence[0]}`);
  if (p.keyEvidence?.[1]) lines.push(`› ${p.keyEvidence[1]}`);

  return lines.join('\n');
}

export async function sendScanAlert(predictions: Prediction[], scanned: number): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;

  const withEdge = predictions.filter((p) => p.recommendedSide !== 'SKIP');

  const header = `🎯 <b>Alpha Agent — Daily Scan</b>\nScanned ${scanned} markets · <b>${withEdge.length} edge${withEdge.length !== 1 ? 's' : ''} found</b>\n\n`;

  if (withEdge.length === 0) {
    await sendTelegram(env.TELEGRAM_CHAT_ID, header + 'No strong edges today.');
    return;
  }

  const cards = withEdge.slice(0, 5).map(formatPredictionCard).join('\n\n');
  const footer = withEdge.length > 5 ? `\n\n+${withEdge.length - 5} more on the dashboard.` : '';

  await sendTelegram(env.TELEGRAM_CHAT_ID, header + cards + footer);
}
