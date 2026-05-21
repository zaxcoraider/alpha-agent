import { streamText } from 'ai';
import { dgrid } from '@/lib/llm/client';
import { MODELS } from '@/lib/llm/models';

export async function POST(req: Request) {
  const { title, tldr, type, body, chains, tickers, actionItems } = await req.json() as {
    title: string;
    tldr: string;
    type: string;
    body: string;
    chains: string[];
    tickers: string[];
    actionItems: string[];
  };

  const typeLabel =
    type === 'build'     ? 'Build Opportunity' :
    type === 'trade'     ? 'Trade Setup'        :
    type === 'narrative' ? 'Narrative Play'     : 'Alpha Idea';

  const result = streamText({
    model:       dgrid(MODELS.reasoner),
    maxTokens:   2000,
    abortSignal: AbortSignal.timeout(90_000),
    system: `You are a senior crypto strategist and developer. Write detailed, actionable briefs that combine market intelligence with technical and business depth. Be concrete — no generic advice.`,
    prompt: `Write a full detailed brief for this ${typeLabel}.

Title: ${title}
TL;DR: ${tldr}
Context: ${body}
Chains: ${chains.join(', ') || 'any'}
Tokens/Projects: ${tickers.join(', ') || 'n/a'}
Initial action items: ${actionItems.join('; ')}

## Required sections (use markdown headers):

### Overview
2-3 paragraphs on what this opportunity is, why it's emerging now, and why the timing is right.

### Market Signal Analysis
What specific on-chain or social signals support this idea? What data points make this compelling?

${type === 'build' ? `### Technical Architecture
Stack recommendation, key components, estimated build time, MVP scope vs full vision.

### Monetization & Business Model
How does this make money? What's the token/fee mechanic? Revenue potential estimate.

### Competitive Landscape
Who else is doing this? What's the moat?

### 30-Day Roadmap
Week 1-2: foundation. Week 3-4: MVP. What to ship first.` : ''}

${type === 'trade' ? `### Trade Setup
Entry levels, position sizing (% of portfolio), stop loss, take profit targets.

### Catalyst Timeline
What needs to happen for this to play out? Key dates / events.

### Risk Management
What kills this trade? How to manage downside.

### On-Chain Checklist
What to verify before entering (contract safety, liquidity, whale activity).` : ''}

${type === 'narrative' ? `### Narrative Mechanics
How does this narrative spread? Who are the key amplifiers?

### Positioning Strategy
How to get exposure before the narrative peaks. Which tokens lead vs lag?

### Narrative Timeline
Early signal → mainstream CT → retail → peak. Where are we now?

### Exit Signal
What indicates the narrative has peaked and it's time to reduce exposure?` : ''}

### Risk Factors
Top 3-5 risks specific to this opportunity.

### Action Plan
Numbered concrete steps to capitalize on this, starting today.`,
  });

  return result.toDataStreamResponse();
}
