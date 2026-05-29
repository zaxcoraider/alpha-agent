import { streamText } from 'ai';
import { dgrid, dgridNoTemp } from '@/lib/llm/client';
import { AGENT_MODELS } from '@/lib/llm/models';

export const runtime  = 'nodejs';
export const maxDuration = 120;

// Models that reject the `temperature` param entirely (Opus + OpenAI reasoning).
const NO_TEMP = [
  'anthropic/claude-opus-4.7', 'anthropic/claude-opus-4.6', 'anthropic/claude-opus-4.5', 'anthropic/claude-opus-4',
  'openai/o3', 'openai/o3-pro', 'openai/o3-mini', 'openai/o3-mini-high', 'openai/o3-deep-research',
  'openai/gpt-5.5', 'openai/gpt-5.5-pro', 'openai/gpt-5.3-codex',
];

export async function POST(req: Request) {
  const { brief, resources, model } = await req.json() as {
    brief:     string;
    resources: { url: string; note: string }[];
    model?:    string;
  };

  // Default to GPT-5.3 Codex — the best agentic coder for Strategist build plans.
  // User can still override via the model param from the UI.
  const modelId     = typeof model === 'string' && model.length > 0 ? model : AGENT_MODELS.strategist;
  const supportsTemp = !NO_TEMP.includes(modelId);
  const resourcesBlock = resources.length > 0
    ? '\n\nRESOURCES / LINKS:\n' + resources.map((r, i) =>
        `${i + 1}. ${r.url}${r.note ? ` — ${r.note}` : ''}`
      ).join('\n')
    : '';

  const result = streamText({
    model:       supportsTemp ? dgrid(modelId) : dgridNoTemp(modelId),
    maxTokens:   4096,
    abortSignal: AbortSignal.timeout(110_000),
    system: `You are Alpha Strategist — a senior crypto builder and hackathon veteran who helps developers plan and ship DApps fast using Claude Code (AI pair-programming in the terminal).

You specialize in:
- Multi-chain DApps: Solana/Anchor, EVM/Solidity/Foundry/Hardhat, Move/Sui, CosmWasm
- Hackathon strategy: scoping to win, what judges reward, demo structure
- Vibe coding with Claude Code — scaffolding full projects fast with AI
- DeFi, NFT, prediction markets, DAO tooling, AI x crypto
- Next.js 15 App Router, TypeScript, Tailwind, shadcn/ui frontends

Your output is a complete, immediately actionable build plan. Be opinionated — pick the best option and justify it concisely. Every section should help the developer open their terminal and start building.`,
    prompt: `PROJECT BRIEF:
${brief}${resourcesBlock}

Write a complete build plan using the sections below. Use markdown.

## 🎯 Concept — What Exactly to Build
2-3 sentences. Ruthlessly cut scope to what ships in the timeframe. One clear value prop.

## ⛓️ Chain & Protocol
Which chain and why. Consider: hackathon prizes, tooling maturity, judge familiarity, tx costs, existing infra. One recommendation with trade-offs noted.

## 🛠️ Tech Stack
| Layer | Choice | Why |
|-------|--------|-----|
| Smart Contract | | |
| Frontend | | |
| Wallet/Auth | | |
| Data/State | | |
| Testing | | |
| Deploy | | |

## 🏗️ Architecture (text diagram)
Show the key data flows and how pieces connect. Keep it simple.

## 📅 Build Phases
### Phase 1 — Foundation
Checklist of tasks with time estimate.

### Phase 2 — Core Features
Checklist.

### Phase 3 — Polish & Submit
Checklist.

## 🤖 Claude Code Starter Prompts
These go directly into the terminal. Make them complete and copy-pasteable.

### Prompt 1 — Project Scaffold
\`\`\`
[full Claude Code prompt to scaffold the project from zero]
\`\`\`

### Prompt 2 — Smart Contract
\`\`\`
[full prompt for the core contract — include chain, framework, key functions]
\`\`\`

### Prompt 3 — Frontend Integration
\`\`\`
[full prompt to wire up the UI to the contract]
\`\`\`

### Prompt 4 — CLAUDE.md for This Project
\`\`\`
[a complete CLAUDE.md file the developer can drop in their new project root]
\`\`\`

## 🎨 UI Strategy
Component library, design system, color direction, key screens to build. Which model to use for UI work and why.

## 🧠 Model Recommendations for This Build
| Task | Model | Why |
|------|-------|-----|
| Architecture planning | Claude Opus 4.7 | |
| Smart contract code | | |
| React/UI components | | |
| Quick iterations / small fixes | | |
| UI design direction | | |

## ⚠️ Top Risks
3-5 risks specific to this project and how to mitigate each.

## 🏆 Winning Strategy
What makes this demo pop? What to emphasize in the submission? What judges look for in this track.`,
  });

  return result.toDataStreamResponse();
}
