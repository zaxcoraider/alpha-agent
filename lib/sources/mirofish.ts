import { generateObject } from 'ai';
import { z } from 'zod';
import { dgrid } from '@/lib/llm/client';
import { MODELS } from '@/lib/llm/models';
import { env } from '@/lib/env';
import type { ParsedMarket } from './polymarket';

// ─── Result types ─────────────────────────────────────────────────────────────

export type SwarmStats = {
  agentCount: number;      // total agents prepared (from expected_entities_count)
  sampleSize: number;      // agents who gave a parseable probability
  meanProb: number;        // 0-1 mean probability across all interviewed agents
  medianProb: number;      // 0-1 median
  stdDev: number;          // 0-1 — high = agents strongly disagree
  bullCount: number;       // agents estimating > 60%
  bearCount: number;       // agents estimating < 40%
  neutralCount: number;    // agents estimating 40–60%
  topBullResponse: string; // most bullish agent's verbatim response
  topBearResponse: string; // most bearish agent's verbatim response
};

export type MiroFishResult = {
  report: string | null;
  swarmStats: SwarmStats | null;
};

// ─── Depth modes ─────────────────────────────────────────────────────────────
// Controls agent count (stakeholders → Zep nodes → personas) and simulation rounds.

export type SwarmDepth = 'quick' | 'standard' | 'deep' | 'max';

export const DEPTH_CONFIG = {
  quick:    { stakeholders: 20,  rounds: 15, parallel: 10, timeoutMs: 12 * 60 * 1000, prepTimeoutMs: 3 * 60 * 1000 },
  standard: { stakeholders: 100, rounds: 25, parallel: 20, timeoutMs: 30 * 60 * 1000, prepTimeoutMs: 8 * 60 * 1000 },
  deep:     { stakeholders: 300, rounds: 40, parallel: 30, timeoutMs: 55 * 60 * 1000, prepTimeoutMs: 20 * 60 * 1000 },
  max:      { stakeholders: 500, rounds: 60, parallel: 40, timeoutMs: 90 * 60 * 1000, prepTimeoutMs: 35 * 60 * 1000 },
} as const;

// ─── Config ───────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 8_000;

// ─── HTTP helper ──────────────────────────────────────────────────────────────

function base(path: string): string {
  return `${env.MIROFISH_URL}${path}`;
}

// timeoutMs is per-request; interview/all needs much longer than other calls
async function mfetch(path: string, init: RequestInit, timeoutMs = 45_000): Promise<unknown> {
  const res = await fetch(base(path), {
    ...init,
    headers: { ...(init.headers ?? {}), Accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`MiroFish ${path} → HTTP ${res.status}`);
  return res.json();
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function poll(
  checkFn: () => Promise<boolean>,
  intervalMs: number,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await checkFn()) return true;
    await sleep(intervalMs);
  }
  return false;
}

// ─── Step 0: Generate named stakeholders ──────────────────────────────────────
// This is the agent-count lever.
// Zep builds entity nodes from the seed document — each named entity becomes a node,
// each node becomes an agent persona. A thin seed yields ~10-20 agents. A seed with
// 80-120 named ecosystem participants yields 60-150 agents.

const StakeholderSchema = z.object({
  stakeholders: z.array(
    z.object({
      name:   z.string(),
      role:   z.string().max(60),
      stance: z.enum(['bullish', 'bearish', 'neutral']),
      note:   z.string().max(100),
    }),
  ).min(5).max(600),
});

async function generateStakeholders(question: string, targetCount: number): Promise<string> {
  // For large counts, generate in two batches to avoid LLM output limits
  const batchSize = Math.min(targetCount, 120);
  const batches   = Math.ceil(targetCount / batchSize);
  const allStakeholders: Array<{ name: string; role: string; stance: string; note: string }> = [];

  for (let b = 0; b < batches; b++) {
    const thisBatch = b === batches - 1
      ? targetCount - allStakeholders.length
      : batchSize;

    try {
      const { object } = await generateObject({
        model:       dgrid(MODELS.classifier),
        schema:      StakeholderSchema,
        mode:        'json',
        abortSignal: AbortSignal.timeout(60_000),
        prompt: `Generate exactly ${thisBatch} named, real-world stakeholders (batch ${b + 1}/${batches}) with VARIED opinions on:

"${question}"

${b > 0 ? `Already generated ${allStakeholders.length} stakeholders — generate ${thisBatch} NEW and DIFFERENT ones now.` : ''}

Include a diverse mix:
- Crypto traders, whales, degens (prominent CT accounts, anonymous wallets)
- Institutional: Galaxy Digital, Paradigm, a16z, Grayscale, BlackRock, Fidelity, Jump Trading
- Analysts and researchers: TradFi crossovers, on-chain specialists, quant funds
- Protocol founders and teams relevant to the topic
- Exchanges and market makers: Binance, Coinbase, Kraken, Wintermute, Jane Street crypto
- Media personalities: Bloomberg Crypto, Decrypt, CoinDesk, Bankless, Unchained
- Skeptics and bears: Peter Schiff-style critics, regulatory hawks, skeptical academics
- On-chain analytics: Glassnode, Nansen, CryptoQuant, Santiment, Arkham analysts
- Retail: Reddit r/CryptoCurrency, degen Twitter communities, NFT traders
- Government and regulatory: SEC officials, Fed researchers, ECB policy staff
- DeFi protocols and DAOs relevant to the question
- Traditional finance crossing over: JPMorgan crypto desk, Goldman Sachs digital assets

Use real names where possible. Spread stances — 40% bullish, 35% bearish, 25% neutral gives the richest signal.`,
      });

      allStakeholders.push(...object.stakeholders);
    } catch {
      // Non-fatal — continue with what we have
      break;
    }
  }

  if (allStakeholders.length === 0) return '';

  const lines = allStakeholders
    .map((s) => `- ${s.name} | ${s.role} | ${s.stance} | ${s.note}`)
    .join('\n');

  return `## Ecosystem Participants (${allStakeholders.length} named entities)\n\n${lines}`;
}

// ─── Step 1: Rich seed document ───────────────────────────────────────────────
// The ontology generator reads this and creates 10 entity TYPES (hardcoded in MiroFish).
// The graph builder ingests the text and creates individual entity NODES for each named entity.
// More named entities in the seed = more nodes = more agents.

function buildRichSeedDoc(
  market: ParsedMarket,
  contextBlock: string,
  stakeholdersSection: string,
): string {
  return `# Prediction Market Intelligence Seed

## Core Question
${market.question}

## Market Data
- Current YES probability (market consensus): ${(market.yesPrice * 100).toFixed(1)}%
- Trading volume: $${(market.volumeUsd / 1_000_000).toFixed(2)}M
- Liquidity depth: $${(market.liquidityUsd / 1_000).toFixed(0)}k
- Resolves: ${market.endDate} (${market.daysLeft} days remaining)
- Description: ${market.description?.slice(0, 600) || 'N/A'}

## Live Market Intelligence (last 24-48h)
${contextBlock}

${stakeholdersSection}

## Simulation Directive

Create a high-fidelity social simulation of the crypto prediction market community debating the above question.
Each named participant above should become an agent with a distinct persona shaped by their role and stance.

**Required agent diversity:**
- Institutional traders: fund managers, prop desks, ETF issuers with macro frameworks
- Retail degens: CT influencers, discord communities, anonymous high-conviction traders
- Quantitative analysts: probability model builders, base-rate anchors, statistical thinkers
- Fundamentals analysts: protocol researchers, developer activity trackers, TVL watchers
- Macro economists: TradFi crossovers, rate cycle watchers, global liquidity analysts
- Contrarians and bears: skeptics, regulatory hawks, academics critical of crypto
- Media personalities: journalists, podcast hosts, newsletter writers who shape narrative
- On-chain analysts: whale trackers, exchange flow specialists, derivatives data readers

**Debate dynamics:**
- Agents MUST reference the current market price of ${(market.yesPrice * 100).toFixed(1)}% and argue whether it is overpriced or underpriced
- Agents should form coalitions, challenge each other, and update positions based on evidence
- The simulation should surface where the true probability DIVERGES from market consensus
- Heated disagreements between bears and bulls make the signal richer

**The central question every agent must eventually answer:**
What is the true probability that this prediction market resolves YES?
Is the current market price of ${(market.yesPrice * 100).toFixed(1)}% too high, too low, or correct?`;
}

// ─── Step 2: Generate ontology ────────────────────────────────────────────────
// MiroFish always generates exactly 10 entity types from the seed.
// We write a strong simulation_requirement so those types are prediction-market-relevant.

async function generateOntology(seedText: string, marketId: string): Promise<string | null> {
  const formData = new FormData();
  formData.append('files', new Blob([seedText], { type: 'text/markdown' }), 'market-seed.md');
  formData.append('project_name', `alpha-${marketId}-${Date.now()}`);
  formData.append(
    'simulation_requirement',
    'Generate diverse crypto prediction market participant personas who vigorously debate market resolution probabilities. Entity types must cover: institutional traders, retail investors, domain experts, contrarians, quantitative analysts, media personalities, on-chain analysts, skeptics/bears, protocol teams, and market makers.',
  );

  const res = await mfetch('/api/graph/ontology/generate', { method: 'POST', body: formData }) as {
    success: boolean;
    data?: { project_id: string };
  };

  return res.success ? (res.data?.project_id ?? null) : null;
}

// ─── Step 3: Build knowledge graph ────────────────────────────────────────────
// Zep ingests text in 500-char chunks and extracts entity nodes matching the ontology.
// Each node = one future agent. A 3000-word seed with 100 named entities → ~80-150 nodes.

async function buildGraph(projectId: string): Promise<string | null> {
  const buildRes = await mfetch('/api/graph/build', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ project_id: projectId }),
  }) as { success: boolean; data?: { task_id: string } };

  if (!buildRes.success || !buildRes.data?.task_id) return null;
  const taskId = buildRes.data.task_id;

  let graphId: string | null = null;
  const done = await poll(async () => {
    const s = await mfetch(`/api/graph/task/${taskId}`, { method: 'GET' }) as {
      success: boolean;
      data?: { status: string; graph_id?: string };
    };
    if (s.data?.status === 'completed' && s.data.graph_id) {
      graphId = s.data.graph_id;
      return true;
    }
    return s.data?.status === 'failed';
  }, POLL_INTERVAL_MS, 3 * 60 * 1000);

  return done ? graphId : null;
}

// ─── Step 4: Create + prepare + start simulation ───────────────────────────────
// Prepare is the expensive step — it calls the LLM to generate a full persona for each
// entity node. parallel_profile_count=20 means 20 concurrent LLM calls per batch.
// The response includes expected_entities_count which tells us the true agent count.

async function initSimulation(
  projectId: string,
  graphId: string,
  rounds: number,
  parallel: number,
  prepTimeoutMs: number,
): Promise<{ simId: string; agentCount: number } | null> {
  // Create — project_id is required; the old code was missing it
  const createRes = await mfetch('/api/simulation/create', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      project_id:     projectId,
      graph_id:       graphId,
      enable_twitter: true,
      enable_reddit:  true,
    }),
  }) as { success: boolean; data?: { simulation_id: string } };

  if (!createRes.success) return null;
  const simId = createRes.data!.simulation_id;

  // Prepare — generates OASIS agent profiles for every entity node in the graph
  const prepareRes = await mfetch('/api/simulation/prepare', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      simulation_id:          simId,
      use_llm_for_profiles:   true,
      parallel_profile_count: parallel,
    }),
  }) as {
    success: boolean;
    data?: { task_id: string; expected_entities_count?: number };
  };

  if (!prepareRes.success) return null;
  const prepTaskId  = prepareRes.data?.task_id;
  const agentCount  = prepareRes.data?.expected_entities_count ?? 0;

  // Wait for all personas to be generated (batch size 15, so ceil(agentCount/15) LLM calls)
  const prepDone = await poll(async () => {
    const s = await mfetch('/api/simulation/prepare/status', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ task_id: prepTaskId }),
    }) as { success: boolean; data?: { status: string } };
    return s.data?.status === 'completed' || s.data?.status === 'failed';
  }, POLL_INTERVAL_MS, prepTimeoutMs);

  if (!prepDone) return null;

  // Start — parallel Twitter + Reddit simulation
  const startRes = await mfetch('/api/simulation/start', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      simulation_id: simId,
      platform:      'parallel',
      max_rounds:    rounds,
    }),
  }) as { success: boolean };

  if (!startRes.success) return null;

  return { simId, agentCount };
}

// ─── Step 5: Interview all agents mid-simulation ───────────────────────────────
// The interview IPC system writes command files to ipc_commands/ inside the running
// simulation process. The process must be alive (rounds still running) for this to work.
// We fire the interview at the 60% mark so there are still ~10 rounds left as buffer.
// Each agent gives one structured response with a probability estimate.

type InterviewEntry = { agentId: number; response: string; platform: string };

async function fireInterviewAll(simId: string, question: string): Promise<InterviewEntry[]> {
  const prompt =
    `You are participating in a social media simulation debating a prediction market question.

Question: "${question}"

Based on your character, expertise, and everything discussed in this simulation so far:

1. What is YOUR probability estimate that this resolves YES? (Give a number 0-100)
2. In one sentence, what is your strongest reason?

You MUST respond in this exact format (required for data collection):
PROBABILITY: [number]% - [one sentence reason]

Example: "PROBABILITY: 67% - The institutional ETF inflows and macro tailwinds make this highly likely within the timeframe."`;

  const res = await mfetch(
    '/api/simulation/interview/all',
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        simulation_id: simId,
        prompt,
        platform: 'twitter',  // single platform = one response per agent, simpler parsing
        timeout:  180,
      }),
    },
    260_000,  // 4+ min — all agents respond sequentially via IPC
  ) as {
    success: boolean;
    data?: {
      result?: {
        results?: Record<string, { agent_id: number; response: string; platform: string }>;
      };
    };
  };

  if (!res.success || !res.data?.result?.results) return [];

  return Object.values(res.data.result.results).map((r) => ({
    agentId:  r.agent_id,
    response: r.response,
    platform: r.platform,
  }));
}

// Poll the simulation run-status and fire interview once we reach the 60% mark.
// Continues polling after interview until simulation fully completes.
async function pollAndInterview(simId: string, question: string, maxRounds: number): Promise<InterviewEntry[]> {
  const interviewAtRound = Math.floor(maxRounds * 0.6);
  let interviewed = false;
  let interviews:  InterviewEntry[] = [];
  const deadline   = Date.now() + 15 * 60 * 1000;  // 15 min window for sim + interview

  while (Date.now() < deadline) {
    const status = await mfetch(`/api/simulation/${simId}/run-status`, {
      method: 'GET',
    }) as {
      success: boolean;
      data?: { status?: string; current_round?: number; total_rounds?: number };
    };

    const d            = status.data;
    const currentRound = d?.current_round ?? 0;
    const simStatus    = d?.status ?? '';
    const totalRounds  = d?.total_rounds ?? maxRounds;

    // Fire interview at 60% of rounds — sim is still running, IPC is alive
    if (!interviewed && currentRound >= interviewAtRound) {
      interviewed = true;
      interviews  = await fireInterviewAll(simId, question).catch(() => []);
    }

    // Simulation finished naturally
    if (
      simStatus === 'completed' ||
      simStatus === 'stopped'   ||
      currentRound >= totalRounds ||
      currentRound >= maxRounds
    ) break;

    await sleep(POLL_INTERVAL_MS);
  }

  // Safety: stop if still running and we timed out
  if (!interviewed) {
    // Never got to interview round — try a late interview before stopping
    interviews = await fireInterviewAll(simId, question).catch(() => []);
  }

  return interviews;
}

// ─── Step 6: Parse swarm statistics from interview responses ───────────────────

function extractProbability(text: string): number | null {
  // Primary: structured "PROBABILITY: XX%"
  const m = text.match(/PROBABILITY:\s*(\d+(?:\.\d+)?)\s*%/i);
  if (m) {
    const v = parseFloat(m[1]);
    if (v >= 0 && v <= 100) return v / 100;
  }
  // Fallback: first percentage mentioned (e.g. "I'd say around 73%")
  const fb = text.match(/\b(\d+(?:\.\d+)?)\s*%/);
  if (fb) {
    const v = parseFloat(fb[1]);
    if (v >= 0 && v <= 100) return v / 100;
  }
  return null;
}

function computeSwarmStats(
  interviews: InterviewEntry[],
  agentCount: number,
): SwarmStats | null {
  if (interviews.length === 0) return null;

  const parsed = interviews
    .map((i) => ({ prob: extractProbability(i.response), response: i.response }))
    .filter((x): x is { prob: number; response: string } => x.prob !== null);

  if (parsed.length < 3) return null;

  const vals   = parsed.map((x) => x.prob);
  const sorted = [...vals].sort((a, b) => a - b);
  const mean   = vals.reduce((a, b) => a + b, 0) / vals.length;
  const median = sorted[Math.floor(sorted.length / 2)];
  const stdDev = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length);

  const bulls   = parsed.filter((x) => x.prob > 0.6).sort((a, b) => b.prob - a.prob);
  const bears   = parsed.filter((x) => x.prob < 0.4).sort((a, b) => a.prob - b.prob);
  const neutral = parsed.length - bulls.length - bears.length;

  return {
    agentCount,
    sampleSize:      parsed.length,
    meanProb:        mean,
    medianProb:      median,
    stdDev,
    bullCount:       bulls.length,
    bearCount:       bears.length,
    neutralCount:    neutral,
    topBullResponse: (bulls[0]?.response ?? '').slice(0, 240),
    topBearResponse: (bears[0]?.response ?? '').slice(0, 240),
  };
}

// ─── Step 7: Generate report ──────────────────────────────────────────────────
// The ReACT report agent queries the Zep graph (InsightForge, Panorama Search)
// and generates a structured markdown analysis. The correct field is markdown_content.

async function generateReport(simId: string): Promise<string | null> {
  const genRes = await mfetch('/api/report/generate', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ simulation_id: simId }),
  }) as { success: boolean; data?: { report_id: string; task_id: string } };

  if (!genRes.success) return null;
  const { report_id: reportId, task_id: taskId } = genRes.data!;

  // Poll until report is written to disk
  await poll(async () => {
    const s = await mfetch('/api/report/generate/status', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ task_id: taskId }),
    }) as { success: boolean; data?: { status: string } };
    return s.data?.status === 'completed' || s.data?.status === 'failed';
  }, POLL_INTERVAL_MS, 5 * 60 * 1000);

  // Fetch the assembled markdown document
  const report = await mfetch(`/api/report/${reportId}`, { method: 'GET' }) as {
    success: boolean;
    data?: { markdown_content?: string; content?: string };
  };

  if (!report.success) return null;
  if (report.data?.markdown_content) return report.data.markdown_content;
  if (report.data?.content)          return report.data.content;

  // Last resort: concatenate individual section files
  const sections = await mfetch(`/api/report/${reportId}/sections`, { method: 'GET' }) as {
    success: boolean;
    data?: { sections: { content: string }[] };
  };
  if (sections.success && sections.data?.sections?.length) {
    return sections.data.sections.map((s) => s.content).join('\n\n');
  }

  return null;
}

// ─── Main export: full pipeline ───────────────────────────────────────────────

export async function runMiroFishAnalysis(
  market: ParsedMarket,
  contextBlock: string,
  depth: SwarmDepth = 'standard',
): Promise<MiroFishResult> {
  const cfg = DEPTH_CONFIG[depth];

  // Health check — fail silently if MiroFish isn't reachable on VPS
  try {
    await fetch(`${env.MIROFISH_URL}/api/graph/tasks`, { signal: AbortSignal.timeout(3_000) });
  } catch {
    return { report: null, swarmStats: null };
  }

  const deadline  = Date.now() + cfg.timeoutMs;
  const remaining = () => deadline - Date.now();

  try {
    // Step 0: Generate named stakeholders — count = cfg.stakeholders
    const stakeholders = await generateStakeholders(market.question, cfg.stakeholders);
    if (remaining() < 0) return { report: null, swarmStats: null };

    // Step 1: Build rich seed with named entities
    const seedDoc = buildRichSeedDoc(market, contextBlock, stakeholders);

    // Step 2: Ontology — MiroFish extracts 10 entity types from the seed
    const projectId = await generateOntology(seedDoc, market.id);
    if (!projectId || remaining() < 0) return { report: null, swarmStats: null };

    // Step 3: Graph — Zep ingests text chunks, extracts named entity nodes
    const graphId = await buildGraph(projectId);
    if (!graphId || remaining() < 0) return { report: null, swarmStats: null };

    // Step 4: Create + prepare + start — generates personas for every entity node
    const sim = await initSimulation(projectId, graphId, cfg.rounds, cfg.parallel, cfg.prepTimeoutMs);
    if (!sim || remaining() < 0) return { report: null, swarmStats: null };

    // Step 5: Poll simulation, interview all agents at the 60% mark
    const interviews  = await pollAndInterview(sim.simId, market.question, cfg.rounds);
    const swarmStats  = computeSwarmStats(interviews, sim.agentCount);

    if (remaining() < 60_000) {
      // Too close to deadline — skip report, return stats only
      return { report: null, swarmStats };
    }

    // Step 6: Report — ReACT agent synthesizes simulation data into markdown analysis
    const report = await generateReport(sim.simId).catch(() => null);

    return { report, swarmStats };
  } catch {
    return { report: null, swarmStats: null };
  }
}
