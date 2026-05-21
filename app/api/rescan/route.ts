import { inngest } from '@/inngest/client';
import { NextResponse } from 'next/server';

const AGENT_EVENTS: Record<string, string> = {
  prediction: 'agent/prediction.run',
  news:       'agent/news.run',
  dev_events: 'agent/dev-events.run',
  nft_mints:  'agent/nft-mints.run',
  memes:      'agent/memes.run',
  x_events:   'agent/x-events.run',
};

export async function POST(req: Request) {
  const { agent } = await req.json();

  const eventName = AGENT_EVENTS[agent];
  if (!eventName) {
    return NextResponse.json({ error: `Unknown agent: ${agent}` }, { status: 400 });
  }

  await inngest.send({ name: eventName, data: { trigger: 'manual' } });

  return NextResponse.json({ ok: true, agent, event: eventName });
}
