import { inngest } from '@/inngest/client';
import { NextResponse } from 'next/server';

const AGENT_EVENTS: Record<string, string> = {
  prediction: 'agent/prediction.run',
  news:       'agent/news.run',
  dev_events: 'agent/dev-events.run',
  nft_mints:  'agent/nft-mints.run',
  memes:      'agent/memes.run',
  x_events:   'agent/x-events.run',
  ideas:      'agent/ideas.run',
};

export async function POST(req: Request) {
  const { agent } = await req.json();

  const eventName = AGENT_EVENTS[agent];
  if (!eventName) {
    return NextResponse.json({ error: `Unknown agent: ${agent}` }, { status: 400 });
  }

  // Inngest needs INNGEST_EVENT_KEY in prod to actually deliver events. When
  // unset, inngest.send() resolves successfully but the event is dropped —
  // user sees a fake "queued" success. Be honest instead.
  if (!process.env.INNGEST_EVENT_KEY) {
    return NextResponse.json(
      {
        error:
          `Inngest not configured (INNGEST_EVENT_KEY missing). ` +
          `Manual scans for "${agent}" run on the VPS schedule, not from this button. ` +
          `Set INNGEST_EVENT_KEY in Vercel env vars to enable manual queueing.`,
      },
      { status: 503 },
    );
  }

  await inngest.send({ name: eventName, data: { trigger: 'manual' } });

  return NextResponse.json({ ok: true, agent, event: eventName });
}
