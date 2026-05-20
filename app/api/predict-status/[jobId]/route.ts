import { type NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { scanResults } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import type { Prediction } from '@/lib/agents/prediction';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
): Promise<NextResponse> {
  const { jobId } = await params;

  const rows = await db
    .select()
    .from(scanResults)
    .where(and(
      eq(scanResults.agent, 'prediction'),
      eq(scanResults.externalId, `custom-${jobId}`),
    ))
    .limit(1);

  if (!rows[0]) {
    return NextResponse.json({ status: 'pending' });
  }

  return NextResponse.json({
    status: 'done',
    prediction: rows[0].raw as Prediction,
  });
}
