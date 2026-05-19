import { inngest } from '../client';

// Runs daily at 06:00 — will trigger all enabled agents
// Week 2+ will populate actual agent calls here
export const morningScan = inngest.createFunction(
  { id: 'morning-scan', name: 'Morning Scan' },
  { cron: '0 6 * * *' },
  async ({ step }) => {
    await step.run('log-start', async () => {
      console.log('[morning-scan] Starting daily scan —', new Date().toISOString());
    });

    // Placeholder: agents will be added here week by week
    return { status: 'ok', message: 'Morning scan placeholder — agents coming in Week 2' };
  }
);
