import { env } from '@/lib/env';
import type { ParsedMarket } from './polymarket';

// ─── MiroFish REST API client ─────────────────────────────────────────────────
// Full async pipeline: seed → ontology → graph → simulation → report
// Returns a report string, or null if MiroFish is unavailable or times out.
// All steps have individual timeouts; the whole pipeline caps at 10 minutes.

const PIPELINE_TIMEOUT_MS = 10 * 60 * 1000; // 10 min hard cap
const POLL_INTERVAL_MS = 8_000;              // poll every 8 seconds

// ─── Helpers ──────────────────────────────────────────────────────────────────

function base(path: string): string {
  return `${env.MIROFISH_URL}${path}`;
}

async function mfetch(path: string, init: RequestInit): Promise<unknown> {
  const res = await fetch(base(path), {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(30_000), // 30s per individual request
  });
  if (!res.ok) throw new Error(`MiroFish ${path} → HTTP ${res.status}`);
  return res.json();
}

async function poll(
  checkFn: () => Promise<boolean>,
  intervalMs: number,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await checkFn()) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

// ─── Seed document ────────────────────────────────────────────────────────────

function buildSeedDoc(market: ParsedMarket, contextBlock: string): string {
  return `# Prediction Market Analysis Seed

## Market Question
${market.question}

## Market Data
- Current YES probability: ${(market.yesPrice * 100).toFixed(1)}%
- Trading volume: $${(market.volumeUsd / 1_000_000).toFixed(2)}M
- Liquidity: $${(market.liquidityUsd / 1000).toFixed(0)}k
- Resolves: ${market.endDate} (${market.daysLeft} days)
- Description: ${market.description?.slice(0, 400) || 'N/A'}

## Live Market Intelligence
${contextBlock}

---

## Simulation Requirement
Create a diverse community of agents who hold strong, varied opinions about the likely resolution of this prediction market question. The community should include:
- Institutional and retail prediction market traders with different risk appetites
- Domain experts directly relevant to the market topic
- Contrarian thinkers who challenge consensus views
- News-driven actors who react to recent headlines
- Quantitative analysts focused on base rates and historical patterns
- Social media influencers who drive narrative momentum
- Skeptics who distrust current market pricing

Agents should debate, post, react, and form coalitions organically. The simulation should surface emergent consensus about the true probability of YES resolution, especially where it diverges from the current market price of ${(market.yesPrice * 100).toFixed(1)}%.`;
}

// ─── Step 1: Generate ontology from seed document ─────────────────────────────

async function generateOntology(
  seedText: string,
  marketId: string,
): Promise<string | null> {
  const formData = new FormData();
  const blob = new Blob([seedText], { type: 'text/markdown' });
  formData.append('files', blob, 'market-seed.md');
  formData.append('project_name', `alpha-${marketId}-${Date.now()}`);
  formData.append(
    'simulation_requirement',
    'Generate diverse prediction market participant personas who debate market resolution probabilities.',
  );

  const res = await mfetch('/api/graph/ontology/generate', {
    method: 'POST',
    body: formData,
  }) as { success: boolean; data?: { project_id: string } };

  return res.success ? (res.data?.project_id ?? null) : null;
}

// ─── Step 2: Build knowledge graph ────────────────────────────────────────────

async function buildGraph(projectId: string): Promise<string | null> {
  const buildRes = await mfetch('/api/graph/build', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project_id: projectId }),
  }) as { success: boolean; data?: { task_id: string } };

  if (!buildRes.success || !buildRes.data?.task_id) return null;
  const taskId = buildRes.data.task_id;

  // Poll for completion
  let graphId: string | null = null;
  const done = await poll(async () => {
    const status = await mfetch(`/api/graph/task/${taskId}`, { method: 'GET' }) as {
      success: boolean;
      data?: { status: string; graph_id?: string };
    };
    if (status.data?.status === 'completed' && status.data.graph_id) {
      graphId = status.data.graph_id;
      return true;
    }
    return status.data?.status === 'failed';
  }, POLL_INTERVAL_MS, 2 * 60 * 1000);

  return done ? graphId : null;
}

// ─── Step 3: Create + prepare + run simulation ─────────────────────────────────

async function runSimulation(graphId: string): Promise<string | null> {
  // Create
  const createRes = await mfetch('/api/simulation/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      graph_id: graphId,
      enable_twitter: true,
      enable_reddit: true,
    }),
  }) as { success: boolean; data?: { simulation_id: string } };

  if (!createRes.success) return null;
  const simId = createRes.data!.simulation_id;

  // Prepare — generates agent personas from graph entities
  const prepareRes = await mfetch('/api/simulation/prepare', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      simulation_id: simId,
      use_llm_for_profiles: true,
      parallel_profile_count: 8,
    }),
  }) as { success: boolean; data?: { task_id: string } };

  if (!prepareRes.success) return null;
  const prepTaskId = prepareRes.data?.task_id;

  // Wait for prepare to complete
  const prepDone = await poll(async () => {
    const s = await mfetch('/api/simulation/prepare/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_id: prepTaskId }),
    }) as { success: boolean; data?: { status: string } };
    return s.data?.status === 'completed' || s.data?.status === 'failed';
  }, POLL_INTERVAL_MS, 3 * 60 * 1000);

  if (!prepDone) return null;

  // Start simulation — parallel Twitter + Reddit, 20 rounds
  const startRes = await mfetch('/api/simulation/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      simulation_id: simId,
      platform: 'parallel',
      max_rounds: 20,
    }),
  }) as { success: boolean };

  if (!startRes.success) return null;

  // Poll until simulation finishes
  const simDone = await poll(async () => {
    const status = await mfetch(`/api/simulation/${simId}/run-status`, {
      method: 'GET',
    }) as { success: boolean; data?: { status?: string; current_round?: number; total_rounds?: number } };
    const d = status.data;
    return d?.status === 'completed' || d?.status === 'stopped' ||
      (d?.current_round !== undefined && d?.total_rounds !== undefined &&
        d.current_round >= d.total_rounds);
  }, POLL_INTERVAL_MS * 2, 7 * 60 * 1000);

  if (!simDone) {
    // Stop gracefully if we're out of time
    await mfetch('/api/simulation/stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ simulation_id: simId }),
    }).catch(() => null);
  }

  return simId;
}

// ─── Step 4: Generate report ──────────────────────────────────────────────────

async function generateReport(simId: string): Promise<string | null> {
  const genRes = await mfetch('/api/report/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ simulation_id: simId }),
  }) as { success: boolean; data?: { report_id: string; task_id: string } };

  if (!genRes.success) return null;
  const { report_id: reportId, task_id: taskId } = genRes.data!;

  // Wait for report to complete
  await poll(async () => {
    const s = await mfetch('/api/report/generate/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_id: taskId }),
    }) as { success: boolean; data?: { status: string } };
    return s.data?.status === 'completed' || s.data?.status === 'failed';
  }, POLL_INTERVAL_MS, 2 * 60 * 1000);

  // Fetch the full report
  const report = await mfetch(`/api/report/${reportId}`, {
    method: 'GET',
  }) as { success: boolean; data?: { content?: string; sections?: { content: string }[] } };

  if (!report.success) return null;

  // Try to get full content, fall back to concatenating sections
  if (report.data?.content) return report.data.content;

  const sections = await mfetch(`/api/report/${reportId}/sections`, {
    method: 'GET',
  }) as { success: boolean; data?: { sections: { content: string }[] } };

  if (sections.success && sections.data?.sections?.length) {
    return sections.data.sections.map((s) => s.content).join('\n\n');
  }

  return null;
}

// ─── Main export: full pipeline ───────────────────────────────────────────────

export async function runMiroFishAnalysis(
  market: ParsedMarket,
  contextBlock: string,
): Promise<string | null> {
  // Skip if MiroFish isn't running (MIROFISH_URL not reachable)
  try {
    await fetch(`${env.MIROFISH_URL}/api/graph/tasks`, {
      signal: AbortSignal.timeout(3_000),
    });
  } catch {
    return null; // MiroFish not available — skip silently
  }

  const deadline = Date.now() + PIPELINE_TIMEOUT_MS;
  const remaining = () => deadline - Date.now();

  try {
    const seedDoc = buildSeedDoc(market, contextBlock);

    const projectId = await generateOntology(seedDoc, market.id);
    if (!projectId || remaining() < 0) return null;

    const graphId = await buildGraph(projectId);
    if (!graphId || remaining() < 0) return null;

    const simId = await runSimulation(graphId);
    if (!simId || remaining() < 0) return null;

    const report = await generateReport(simId);
    return report;
  } catch {
    return null; // Always fail gracefully — ensemble runs with or without MiroFish
  }
}
