import {
  pgTable, pgEnum, uuid, text, timestamp, jsonb,
  numeric, boolean, unique,
} from 'drizzle-orm/pg-core';

// ─── Enums ────────────────────────────────────────────────────────────────────

export const agentEnum = pgEnum('agent', [
  'news', 'nft', 'ideas', 'memes', 'x_events', 'dev_events', 'prediction',
]);

export const chainEnum = pgEnum('chain', [
  'sol', 'eth', 'polygon', 'arbitrum', 'base', 'optimism', 'bsc', 'sui', 'unknown',
]);

// ─── Scan runs ────────────────────────────────────────────────────────────────

export const scanRuns = pgTable('scan_runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  agent: agentEnum('agent').notNull(),
  trigger: text('trigger').notNull(), // 'cron' | 'manual'
  startedAt: timestamp('started_at').defaultNow(),
  finishedAt: timestamp('finished_at'),
  status: text('status').notNull(), // 'running' | 'ok' | 'error'
  error: text('error'),
  modelUsed: text('model_used'),
  costUsd: numeric('cost_usd', { precision: 10, scale: 6 }),
  itemsFound: numeric('items_found'),
});

// ─── Scan results ─────────────────────────────────────────────────────────────

export const scanResults = pgTable('scan_results', {
  id: uuid('id').defaultRandom().primaryKey(),
  runId: uuid('run_id').references(() => scanRuns.id),
  agent: agentEnum('agent').notNull(),
  externalId: text('external_id').notNull(), // dedup key per agent
  title: text('title').notNull(),
  summary: text('summary'),
  url: text('url'),
  score: numeric('score', { precision: 4, scale: 2 }), // 0-10 relevance
  chains: chainEnum('chains').array(),
  raw: jsonb('raw'),
  createdAt: timestamp('created_at').defaultNow(),
  bookmarked: boolean('bookmarked').default(false),
  dismissed: boolean('dismissed').default(false),
  notes: text('notes'),
}, (t) => [unique().on(t.agent, t.externalId)]);

// ─── Chat ─────────────────────────────────────────────────────────────────────

export const chatThreads = pgTable('chat_threads', {
  id: uuid('id').defaultRandom().primaryKey(),
  title: text('title').notNull().default('New chat'),
  systemPrompt: text('system_prompt'),
  model: text('model').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const chatMessages = pgTable('chat_messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  threadId: uuid('thread_id').references(() => chatThreads.id, { onDelete: 'cascade' }),
  role: text('role').notNull(), // 'user' | 'assistant' | 'system'
  content: text('content').notNull(),
  model: text('model'),
  tokensIn: numeric('tokens_in'),
  tokensOut: numeric('tokens_out'),
  costUsd: numeric('cost_usd', { precision: 10, scale: 6 }),
  createdAt: timestamp('created_at').defaultNow(),
});

// ─── Agent config ─────────────────────────────────────────────────────────────

export const agentConfigs = pgTable('agent_configs', {
  agent: agentEnum('agent').primaryKey(),
  enabled: boolean('enabled').default(true),
  cronExpression: text('cron_expression'),
  model: text('model'),
  promptOverrides: jsonb('prompt_overrides'),
  filters: jsonb('filters'),
  dailyBudgetUsd: numeric('daily_budget_usd'),
});

// ─── Watchlists ───────────────────────────────────────────────────────────────

export const watchlists = pgTable('watchlists', {
  id: uuid('id').defaultRandom().primaryKey(),
  kind: text('kind').notNull(), // 'kol_handles' | 'kol_wallets_evm' | 'kol_wallets_sol' | 'dev_repos'
  items: text('items').array(),
});
