'use client';

import { useChat } from '@ai-sdk/react';
import { useState, useRef, useEffect, useCallback, type FormEvent } from 'react';
import {
  Send, Bot, User, Copy, Download, Trash2, Plus,
  X, Check, MessageSquare, Layers, Settings, Zap,
  History, ChevronDown, TrendingUp, Cpu, Link, Sparkles,
  FileText, Play, RefreshCw, Globe,
} from 'lucide-react';
import { PROVIDER_GROUPS, MODELS } from '@/lib/llm/models';
import { cn } from '@/lib/utils/cn';

// ── Types ─────────────────────────────────────────────────────────────────────

type TopMode   = 'chat' | 'market' | 'strategist';
type ChatMode  = 'single' | 'group';
type SavedMsg  = { role: 'user' | 'assistant'; content: string };
type SavedConv = {
  id: string; title: string; mode: ChatMode;
  model?: string; quickMode?: string;
  messages: SavedMsg[]; updatedAt: number;
};
type GroupTurn = {
  id: string; userMsg: string;
  responses: Record<string, string>;
  done: Record<string, boolean>;
};
type Resource = { id: string; url: string; note: string };

// ── Quick modes ───────────────────────────────────────────────────────────────

const QUICK_MODES = [
  { key: 'market',     label: '🌐 Market Intel', prompt: 'You are Alpha Agent — a crypto market intelligence analyst. Focus on token analysis, market structure, on-chain signals, CT narratives, trade setups, and DeFi opportunities. Be specific, cite data when available, avoid generic advice.' },
  { key: 'defi',       label: '🏦 DeFi',         prompt: 'You are a DeFi protocol analyst. Analyze liquidity, yield, risks, and tokenomics with precision. Cite APY/APR, TVL, audit status, and chain-specific differences.' },
  { key: 'audit',      label: '🔍 Audit',         prompt: 'You are a smart contract security auditor. Identify vulnerabilities: reentrancy, access control, integer overflow, economic exploits. Categorize by critical/high/medium/low severity. Note EVM vs Solana model differences.' },
  { key: 'tokenomics', label: '📊 Tokenomics',    prompt: 'You are a tokenomics specialist. Analyze supply schedules, vesting cliffs, inflation, emission curves, token utility, and distribution. Flag team unlock red flags.' },
  { key: 'whitepaper', label: '📄 Whitepaper',    prompt: 'You are a crypto project analyst. Extract technical claims, consensus mechanism, tokenomics, team credibility, competitive moat, and red flags from project docs. Be skeptical.' },
  { key: 'trading',    label: '📈 Trading',       prompt: 'You are a crypto trading analyst. Focus on technical setups, key support/resistance, volume profile, funding rates, open interest, and macro catalysts. Always add risk/reward and invalidation levels.' },
  { key: 'chains',     label: '⛓️ Chains',        prompt: 'You are a blockchain infrastructure expert. Compare TPS, finality, gas costs, EVM compatibility, ecosystem maturity, and bridge risks across Solana, ETH, Polygon, Arbitrum, Base, OP, Monad, and others.' },
  { key: 'vps',        label: '🖥️ VPS',           prompt: 'You are a Linux/VPS expert. Help with Ubuntu, Docker, PM2, Nginx, SSL, Node.js, Postgres, and firewalls. Give copy-pasteable commands.' },
];

// ── Strategist templates ──────────────────────────────────────────────────────

const STRAT_TEMPLATES = [
  {
    key: 'hackathon',
    label: '🏆 Hackathon',
    brief: `I want to join a hackathon. Here are the details:

[PASTE HACKATHON DETAILS HERE — rules, prizes, tracks, deadline, judging criteria]

My background: I build multi-chain DApps (Solana/EVM), familiar with Next.js 15, TypeScript, Anchor, Foundry. I use Claude Code for vibe coding in the terminal.

Help me pick the best track, scope a winning project, and build a plan I can execute in [X days].`,
  },
  {
    key: 'defi',
    label: '🏦 DeFi Protocol',
    brief: `I want to build a DeFi protocol. Here's the idea:

[DESCRIBE YOUR DEFI IDEA — lending, DEX, yield, derivatives, etc.]

Target chain: [CHAIN]
Target users: [WHO]
Timeline: [HOW LONG]

Build me a complete plan including smart contract architecture, frontend, and how to make it stand out.`,
  },
  {
    key: 'nft',
    label: '🖼️ NFT Platform',
    brief: `I want to build an NFT project or platform. Idea:

[DESCRIBE — collection, marketplace, mint tool, etc.]

Chain preference: [CHAIN]
Timeline: [HOW LONG]

Plan the smart contracts, mint flow, marketplace if needed, and frontend.`,
  },
  {
    key: 'ai-crypto',
    label: '🤖 AI × Crypto',
    brief: `I want to build an AI-powered crypto tool. Idea:

[DESCRIBE — AI agent, prediction tool, on-chain AI, etc.]

The app should combine AI inference with on-chain actions or crypto data.
Timeline: [HOW LONG]

Plan the architecture: AI backend, on-chain integration, and user-facing product.`,
  },
  {
    key: 'dao',
    label: '🗳️ DAO / Gov',
    brief: `I want to build DAO tooling or governance infrastructure. Idea:

[DESCRIBE — voting system, treasury, proposal flow, etc.]

Chain: [CHAIN]
Timeline: [HOW LONG]

Plan the governance contracts, UI, and what makes this better than existing solutions.`,
  },
];

// ── Model guide (Strategist sidebar) ─────────────────────────────────────────

const MODEL_GUIDE = [
  { task: 'Architecture planning',    model: 'Claude Opus 4.7',     badge: 'text-orange-400', why: 'Best reasoning for system design' },
  { task: 'Smart contracts (EVM)',     model: 'DeepSeek R1',         badge: 'text-cyan-400',   why: 'Top math + Solidity logic' },
  { task: 'Smart contracts (Solana)', model: 'Claude Sonnet 4.6',   badge: 'text-orange-300', why: 'Best Anchor + Rust understanding' },
  { task: 'React / UI components',    model: 'Claude Sonnet 4.6',   badge: 'text-orange-300', why: 'Fast, excellent Tailwind/shadcn' },
  { task: 'UI design direction',      model: 'Gemini 2.5 Pro',      badge: 'text-blue-400',   why: 'Best visual reasoning' },
  { task: 'Quick iterations',         model: 'DeepSeek V4 Flash',   badge: 'text-cyan-300',   why: 'Fastest for small changes' },
  { task: 'Testing / auditing',       model: 'DeepSeek R1',         badge: 'text-cyan-400',   why: 'Systematic + catches edge cases' },
];

// ── LocalStorage ──────────────────────────────────────────────────────────────

const LS_KEY = 'alpha_chat_v1';
function loadConvs(): SavedConv[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? '[]'); } catch { return []; }
}
function saveConvs(cs: SavedConv[]) { localStorage.setItem(LS_KEY, JSON.stringify(cs.slice(0, 20))); }
function upsertConv(conv: SavedConv) {
  const all = loadConvs();
  const i   = all.findIndex((c) => c.id === conv.id);
  if (i >= 0) all[i] = conv; else all.unshift(conv);
  saveConvs(all);
}

// ── Model picker ──────────────────────────────────────────────────────────────

function ModelPicker({ value, onChange, placeholder = 'Select model' }: {
  value: string; onChange: (id: string) => void; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref             = useRef<HTMLDivElement>(null);
  const selected        = PROVIDER_GROUPS.flatMap((g) => g.models).find((m) => m.id === value);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs hover:bg-accent transition-colors min-w-[160px]"
      >
        <span className="flex-1 truncate text-left text-foreground">{selected?.label ?? placeholder}</span>
        <ChevronDown size={11} className="shrink-0 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 w-64 rounded-xl border border-border bg-card shadow-2xl overflow-hidden">
          <div className="max-h-80 overflow-y-auto">
            {PROVIDER_GROUPS.map((group) => (
              <div key={group.key}>
                <div className="px-3 py-1.5 bg-muted/30 border-b border-border/40">
                  <span className={cn('text-[10px] font-bold uppercase tracking-wider', group.badge)}>{group.provider}</span>
                </div>
                {group.models.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => { onChange(m.id); setOpen(false); }}
                    className={cn('w-full px-3 py-2 text-left flex items-start gap-2 hover:bg-accent transition-colors', m.id === value && 'bg-signal/10')}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate text-foreground">{m.label}</p>
                      <p className="text-[10px] text-muted-foreground">{m.desc}</p>
                    </div>
                    {m.id === value && <Check size={11} className="shrink-0 mt-0.5 text-signal" />}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ChatPage() {
  // ── Top mode
  const [topMode, setTopMode] = useState<TopMode>('chat');

  // ── Chat / Market state
  const [chatSubMode, setChatSubMode] = useState<ChatMode>('single');
  const [model,       setModel]       = useState<string>(MODELS.balanced);
  const [temperature, setTemp]        = useState(0.7);
  const [quickMode,   setQuickMode]   = useState<string | null>(null);
  const [showTemp,    setShowTemp]    = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [histories,   setHistories]   = useState<SavedConv[]>([]);
  const [convId,      setConvId]      = useState(() => crypto.randomUUID());
  const [copiedId,    setCopiedId]    = useState<string | null>(null);

  const [groupModels,  setGroupModels]  = useState<string[]>([MODELS.balanced, MODELS.grok]);
  const [groupTurns,   setGroupTurns]   = useState<GroupTurn[]>([]);
  const [groupInput,   setGroupInput]   = useState('');
  const [groupLoading, setGroupLoading] = useState(false);

  // ── Strategist state
  const [brief,        setBrief]        = useState('');
  const [resources,    setResources]    = useState<Resource[]>([]);
  const [stratModel,   setStratModel]   = useState<string>(MODELS.reasoner);
  const [plan,         setPlan]         = useState('');
  const [planLoading,  setPlanLoading]  = useState(false);
  const [planCopied,   setPlanCopied]   = useState(false);

  const singleRef  = useRef<HTMLTextAreaElement>(null);
  const groupRef   = useRef<HTMLTextAreaElement>(null);
  const briefRef   = useRef<HTMLTextAreaElement>(null);
  const endRef     = useRef<HTMLDivElement>(null);
  const groupEnd   = useRef<HTMLDivElement>(null);
  const planEnd    = useRef<HTMLDivElement>(null);

  const activePrompt = QUICK_MODES.find((m) => m.key === quickMode)?.prompt;
  const totalModels  = PROVIDER_GROUPS.reduce((n, g) => n + g.models.length, 0);

  const { messages, input, handleInputChange, handleSubmit, isLoading, setMessages, setInput } =
    useChat({ api: '/api/chat' });

  // Auto-set market quick mode when switching to Market tab
  useEffect(() => {
    if (topMode === 'market' && quickMode !== 'market') setQuickMode('market');
    if (topMode === 'chat' && quickMode === 'market')   setQuickMode(null);
  }, [topMode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setHistories(loadConvs()); }, []);

  useEffect(() => {
    if (messages.length < 2) return;
    const title = messages.find((m) => m.role === 'user')?.content.slice(0, 50) ?? 'Chat';
    upsertConv({ id: convId, title, mode: chatSubMode, model, quickMode: quickMode ?? undefined,
      messages: messages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      updatedAt: Date.now() });
    setHistories(loadConvs());
  }, [messages, convId, model, quickMode, chatSubMode]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useEffect(() => { groupEnd.current?.scrollIntoView({ behavior: 'smooth' }); }, [groupTurns]);
  useEffect(() => { planEnd.current?.scrollIntoView({ behavior: 'smooth' }); }, [plan]);

  useEffect(() => {
    const el = singleRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [input]);

  useEffect(() => {
    const el = groupRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [groupInput]);

  useEffect(() => {
    const el = briefRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 400)}px`;
  }, [brief]);

  // ── Chat helpers ──────────────────────────────────────────────────────────

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    handleSubmit(e, { body: { model, systemPrompt: activePrompt, temperature } });
  }

  function newChat() { setMessages([]); setConvId(crypto.randomUUID()); }

  function loadHistory(conv: SavedConv) {
    setConvId(conv.id);
    setMessages(conv.messages.map((m, i) => ({ id: String(i), role: m.role, content: m.content })));
    if (conv.model)     setModel(conv.model);
    if (conv.quickMode) setQuickMode(conv.quickMode);
    setShowHistory(false);
  }

  function copyMsg(content: string, id: string) {
    navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  }

  function exportChat(ext: 'md' | 'txt') {
    const lines: string[] = ext === 'md'
      ? [`# Chat Export\n*Model: ${model}${quickMode ? ` | Mode: ${quickMode}` : ''}*\n`,
         ...messages.map((m) => `${m.role === 'user' ? '**You**' : '**AI**'}\n\n${m.content}\n\n---`)]
      : messages.map((m) => `[${m.role === 'user' ? 'You' : 'AI'}]\n${m.content}\n`);
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const a    = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(blob),
      download: `chat-${new Date().toISOString().slice(0, 10)}.${ext}`,
    });
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function detectPaste(text: string): string {
    if (/^0x[0-9a-fA-F]{64}$/.test(text))                               return `Analyze this transaction hash: ${text}\n\n`;
    if (/^0x[0-9a-fA-F]{40}$/.test(text))                               return `Analyze this EVM address: ${text}\n\n`;
    if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(text) && !/\s/.test(text)) return `Analyze this Solana address: ${text}\n\n`;
    if (/^https?:\/\//.test(text))                                        return `Analyze: ${text}\n\n`;
    return text;
  }

  // ── Group helpers ─────────────────────────────────────────────────────────

  function addGroupModel(id: string) {
    if (groupModels.length >= 6 || groupModels.includes(id)) return;
    setGroupModels((p) => [...p, id]);
  }
  function removeGroupModel(id: string) {
    if (groupModels.length <= 2) return;
    setGroupModels((p) => p.filter((m) => m !== id));
  }

  async function sendGroup() {
    const msg = groupInput.trim();
    if (!msg || groupLoading) return;
    setGroupInput('');
    setGroupLoading(true);
    const prevMsgs = groupTurns.flatMap((t) => [
      { role: 'user' as const,      content: t.userMsg },
      { role: 'assistant' as const, content: Object.values(t.responses)[0] ?? '' },
    ]);
    const turnId = crypto.randomUUID();
    setGroupTurns((p) => [...p, {
      id: turnId, userMsg: msg,
      responses: Object.fromEntries(groupModels.map((m) => [m, ''])),
      done:      Object.fromEntries(groupModels.map((m) => [m, false])),
    }]);
    const allMsgs = [...prevMsgs, { role: 'user' as const, content: msg }];
    await Promise.all(groupModels.map((mid) => streamModel(mid, allMsgs, turnId)));
    setGroupLoading(false);
  }

  async function streamModel(modelId: string, msgs: { role: 'user' | 'assistant'; content: string }[], turnId: string) {
    try {
      const res = await fetch('/api/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ model: modelId, messages: msgs, systemPrompt: activePrompt, temperature }),
      });
      if (!res.body) throw new Error('no body');
      const reader = res.body.getReader();
      const dec    = new TextDecoder();
      let buf      = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (line.startsWith('0:')) {
            try {
              const chunk = JSON.parse(line.slice(2)) as string;
              setGroupTurns((p) => p.map((t) => t.id !== turnId ? t : {
                ...t, responses: { ...t.responses, [modelId]: t.responses[modelId] + chunk },
              }));
            } catch { /* skip malformed */ }
          }
        }
      }
    } catch {
      setGroupTurns((p) => p.map((t) => t.id !== turnId ? t : {
        ...t, responses: { ...t.responses, [modelId]: '[Error: failed to load response]' },
      }));
    } finally {
      setGroupTurns((p) => p.map((t) => t.id !== turnId ? t : { ...t, done: { ...t.done, [modelId]: true } }));
    }
  }

  // ── Strategist helpers ────────────────────────────────────────────────────

  function addResource() {
    setResources((p) => [...p, { id: crypto.randomUUID(), url: '', note: '' }]);
  }

  function updateResource(id: string, field: 'url' | 'note', val: string) {
    setResources((p) => p.map((r) => r.id === id ? { ...r, [field]: val } : r));
  }

  function removeResource(id: string) {
    setResources((p) => p.filter((r) => r.id !== id));
  }

  const buildPlan = useCallback(async () => {
    if (!brief.trim() || planLoading) return;
    setPlan('');
    setPlanLoading(true);
    try {
      const res = await fetch('/api/strategist', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          brief,
          resources: resources.filter((r) => r.url.trim()),
          model:     stratModel,
        }),
      });
      if (!res.body) return;
      const reader = res.body.getReader();
      const dec    = new TextDecoder();
      let buf      = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (line.startsWith('0:')) {
            try { setPlan((p) => p + (JSON.parse(line.slice(2)) as string)); } catch { /* skip */ }
          }
        }
      }
    } finally {
      setPlanLoading(false);
    }
  }, [brief, resources, stratModel, planLoading]);

  function copyPlan() {
    navigator.clipboard.writeText(plan);
    setPlanCopied(true);
    setTimeout(() => setPlanCopied(false), 1500);
  }

  // ── Model label helpers ───────────────────────────────────────────────────

  function getLabel(id: string) { return PROVIDER_GROUPS.flatMap((g) => g.models).find((m) => m.id === id)?.label ?? id.split('/').pop() ?? id; }
  function getProviderBadge(id: string) { return PROVIDER_GROUPS.find((g) => g.models.some((m) => m.id === id))?.badge ?? 'text-muted-foreground'; }
  function getProviderName(id: string)  { return PROVIDER_GROUPS.find((g) => g.models.some((m) => m.id === id))?.provider ?? ''; }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="h-[calc(100dvh-7rem)] md:h-[calc(100vh-3rem)] flex flex-col overflow-hidden">

      {/* ── Top header ── */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-border shrink-0">
        <div>
          <p className="text-[10px] font-mono tracking-[0.22em] uppercase text-signal mb-0.5">// Chat</p>
          <h1 className="text-xl font-bold tracking-tight">Chat</h1>
          <p className="text-xs text-muted-foreground font-mono">DGrid · {totalModels} models</p>
        </div>
        {/* Top mode tabs */}
        <div className="flex rounded-lg border border-border bg-muted/20 p-0.5 gap-0.5">
          {([
            { key: 'chat',       label: 'Chat',       icon: MessageSquare },
            { key: 'market',     label: 'Market',     icon: TrendingUp    },
            { key: 'strategist', label: 'Strategist', icon: Cpu           },
          ] as { key: TopMode; label: string; icon: React.ElementType }[]).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTopMode(key)}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all',
                topMode === key
                  ? key === 'strategist'
                    ? 'bg-purple-600/20 text-purple-300 shadow-sm border border-purple-500/20'
                    : key === 'market'
                      ? 'bg-signal/20 text-signal shadow-sm border border-signal/30'
                      : 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon size={11} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ════════════════════════════════════════
          CHAT + MARKET MODE
          ════════════════════════════════════════ */}
      {(topMode === 'chat' || topMode === 'market') && (
        <>
          {/* Quick mode chips */}
          <div className="flex items-center gap-2 py-2 overflow-x-auto shrink-0" style={{ scrollbarWidth: 'none' }}>
            <span className="text-[10px] text-muted-foreground/40 uppercase tracking-wider shrink-0 font-semibold">Mode</span>
            {QUICK_MODES.map((qm) => (
              <button
                key={qm.key}
                onClick={() => setQuickMode(quickMode === qm.key ? null : qm.key)}
                className={cn(
                  'shrink-0 rounded-sm px-3 py-1 text-xs transition-all whitespace-nowrap',
                  quickMode === qm.key
                    ? 'bg-signal/20 text-signal border border-signal/40'
                    : 'bg-muted/40 text-muted-foreground hover:bg-muted/70 border border-transparent',
                )}
              >
                {qm.label}
              </button>
            ))}
          </div>

          {/* Sub-mode (single/group) — only in Chat, not Market */}
          {topMode === 'chat' && (
            <div className="flex items-center gap-2 pb-2 shrink-0">
              <div className="flex rounded-md border border-border bg-muted/10 p-0.5 gap-0.5">
                {(['single', 'group'] as ChatMode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setChatSubMode(m)}
                    className={cn(
                      'flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium transition-all',
                      chatSubMode === m ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {m === 'single' ? <MessageSquare size={10} /> : <Layers size={10} />}
                    {m === 'single' ? 'Single' : 'Group'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {topMode === 'market' && (
            <div className="flex items-center gap-2 pb-2 shrink-0">
              <span className="flex items-center gap-1.5 text-xs text-signal bg-signal/10 rounded-sm px-3 py-1 border border-signal/30">
                <Globe size={11} /> Market Intelligence mode — ask about tokens, trends, DeFi, setups
              </span>
            </div>
          )}

          {/* ── Single mode ── */}
          {(topMode === 'market' || chatSubMode === 'single') && (
            <>
              {/* Toolbar */}
              <div className="flex items-center gap-2 pb-2 shrink-0 flex-wrap">
                <ModelPicker value={model} onChange={setModel} />

                {/* Temperature */}
                <div className="relative">
                  <button
                    onClick={() => setShowTemp((o) => !o)}
                    className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs hover:bg-accent transition-colors"
                  >
                    <Settings size={11} className="text-muted-foreground" />
                    <span className="text-muted-foreground">Temp</span>
                    <span className="font-mono text-foreground">{temperature.toFixed(1)}</span>
                  </button>
                  {showTemp && (
                    <div className="absolute top-full left-0 z-40 mt-1 rounded-xl border border-border bg-card p-3 shadow-xl w-52">
                      <div className="flex justify-between text-[10px] text-muted-foreground mb-2">
                        <span>Temperature</span>
                        <span className="font-mono text-foreground">{temperature.toFixed(1)}</span>
                      </div>
                      <input type="range" min={0} max={1} step={0.1} value={temperature}
                        onChange={(e) => setTemp(Number(e.target.value))}
                        className="w-full accent-signal" />
                      <div className="flex justify-between text-[9px] text-muted-foreground/40 mt-1">
                        <span>Precise</span><span>Creative</span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex-1" />

                <div className="flex items-center gap-1">
                  {/* History */}
                  <div className="relative">
                    <button onClick={() => setShowHistory((o) => !o)}
                      className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs hover:bg-accent transition-colors">
                      <History size={11} />
                      {histories.length > 0 && (
                        <span className="rounded-sm font-mono bg-signal/20 text-signal text-[9px] px-1.5">{histories.length}</span>
                      )}
                    </button>
                    {showHistory && (
                      <div className="absolute right-0 top-full z-50 mt-1 w-72 rounded-xl border border-border bg-card shadow-2xl overflow-hidden">
                        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                          <span className="text-xs font-semibold">Recent chats</span>
                          <button onClick={() => setShowHistory(false)} className="text-muted-foreground hover:text-foreground"><X size={12} /></button>
                        </div>
                        <div className="max-h-60 overflow-y-auto">
                          {histories.length === 0 ? (
                            <p className="px-3 py-6 text-xs text-muted-foreground text-center">No saved chats yet</p>
                          ) : histories.map((c) => (
                            <button key={c.id} onClick={() => loadHistory(c)}
                              className="w-full px-3 py-2.5 text-left hover:bg-accent transition-colors flex items-center gap-2 group border-b border-border/30 last:border-0">
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium truncate">{c.title}</p>
                                <p className="text-[10px] text-muted-foreground">{new Date(c.updatedAt).toLocaleDateString()}</p>
                              </div>
                              <button onClick={(e) => { e.stopPropagation(); const next = histories.filter((h) => h.id !== c.id); saveConvs(next); setHistories(next); }}
                                className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-red-400 transition-all">
                                <Trash2 size={10} />
                              </button>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <button onClick={newChat} className="flex items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs hover:bg-accent transition-colors">
                    <Plus size={11} /><span className="text-muted-foreground">New</span>
                  </button>
                  <button onClick={() => copyMsg(messages.map((m) => `${m.role === 'user' ? 'You' : 'AI'}: ${m.content}`).join('\n\n'), '__all')}
                    disabled={messages.length === 0}
                    className="rounded-lg border border-border bg-card p-1.5 hover:bg-accent transition-colors disabled:opacity-40">
                    {copiedId === '__all' ? <Check size={13} className="text-signal" /> : <Copy size={13} className="text-muted-foreground" />}
                  </button>
                  <div className="relative group/exp">
                    <button disabled={messages.length === 0} className="rounded-lg border border-border bg-card p-1.5 hover:bg-accent transition-colors disabled:opacity-40">
                      <Download size={13} className="text-muted-foreground" />
                    </button>
                    <div className="absolute right-0 top-full z-50 mt-1 hidden group-hover/exp:flex flex-col rounded-lg border border-border bg-card shadow-xl overflow-hidden">
                      <button onClick={() => exportChat('md')}  className="px-4 py-2 text-xs hover:bg-accent text-left whitespace-nowrap">.md</button>
                      <button onClick={() => exportChat('txt')} className="px-4 py-2 text-xs hover:bg-accent text-left whitespace-nowrap">.txt</button>
                    </div>
                  </div>
                  <button onClick={() => setMessages([])} disabled={messages.length === 0}
                    className="rounded-lg border border-border bg-card p-1.5 hover:bg-red-500/10 hover:border-red-500/30 transition-colors disabled:opacity-40">
                    <Trash2 size={13} className="text-muted-foreground" />
                  </button>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto min-h-0 space-y-4 py-2">
                {messages.length === 0 && (
                  <div className="h-full flex items-center justify-center">
                    <div className="text-center space-y-3 max-w-xs">
                      <div className={cn('flex h-12 w-12 items-center justify-center rounded-2xl mx-auto border',
                        topMode === 'market'
                          ? 'bg-signal/10 border-signal/30'
                          : 'bg-primary/10 border-primary/20')}>
                        {topMode === 'market' ? <TrendingUp size={20} className="text-signal" /> : <Zap size={20} className="text-primary" />}
                      </div>
                      <p className="text-sm font-semibold">{topMode === 'market' ? 'Market Intelligence' : 'Alpha Agent Chat'}</p>
                      <p className="text-xs text-muted-foreground">
                        {topMode === 'market'
                          ? 'Ask about tokens, trade setups, DeFi protocols, CT narratives, on-chain signals.'
                          : 'Ask anything. Paste a tx hash, address, or URL to auto-detect context.'}
                      </p>
                    </div>
                  </div>
                )}
                {messages.map((m) => (
                  <div key={m.id} className={cn('flex gap-2.5', m.role === 'user' ? 'flex-row-reverse' : 'flex-row')}>
                    <div className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
                      m.role === 'user' ? 'bg-primary/15 border border-primary/20' : 'bg-signal/10 border border-signal/30')}>
                      {m.role === 'user' ? <User size={13} className="text-primary" /> : <Bot size={13} className="text-signal" />}
                    </div>
                    <div className={cn('max-w-[78%] rounded-xl px-4 py-3 text-sm',
                      m.role === 'user' ? 'bg-primary/10 border border-primary/15' : 'bg-card border border-border')}>
                      <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{m.content}</pre>
                      {m.role === 'assistant' && (
                        <button onClick={() => copyMsg(m.content, m.id)}
                          className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground/40 hover:text-muted-foreground transition-colors">
                          {copiedId === m.id ? <><Check size={9} className="text-signal" />copied</> : <><Copy size={9} />copy</>}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex gap-2.5">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-signal/10 border border-signal/30">
                      <Bot size={13} className="text-signal" />
                    </div>
                    <div className="rounded-xl border border-border bg-card px-4 py-3">
                      <span className="flex gap-1">
                        {[0, 150, 300].map((d) => (
                          <span key={d} className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: `${d}ms` }} />
                        ))}
                      </span>
                    </div>
                  </div>
                )}
                <div ref={endRef} />
              </div>

              {/* Input */}
              <form onSubmit={onSubmit} className="flex gap-2 border-t border-border pt-3 shrink-0">
                <textarea ref={singleRef} value={input} onChange={handleInputChange}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!isLoading && input.trim()) e.currentTarget.form?.requestSubmit(); } }}
                  onPaste={(e) => {
                    if (input.trim()) return;
                    const text = e.clipboardData.getData('text');
                    const enhanced = detectPaste(text);
                    if (enhanced !== text) { e.preventDefault(); setInput(enhanced); }
                  }}
                  placeholder={topMode === 'market' ? 'Ask about a token, DeFi protocol, trade setup…' : 'Ask anything… (Shift+Enter for new line)'}
                  rows={1} disabled={isLoading}
                  className="flex-1 resize-none rounded-xl border border-border bg-card px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-signal/40 focus:border-signal/40 disabled:opacity-50 overflow-hidden"
                  style={{ minHeight: '42px', maxHeight: '140px' }}
                />
                <button type="submit" disabled={isLoading || !input.trim()}
                  className="flex items-center gap-1.5 rounded-xl border border-signal/40 bg-signal/15 text-signal hover:bg-signal/25 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2.5 text-sm font-semibold font-mono uppercase tracking-wide transition-colors shrink-0">
                  <Send size={14} />Send
                </button>
              </form>
            </>
          )}

          {/* ── Group mode (Chat only) ── */}
          {topMode === 'chat' && chatSubMode === 'group' && (
            <>
              <div className="flex items-center gap-2 pb-2 shrink-0 flex-wrap">
                <span className="text-xs text-muted-foreground shrink-0">Models ({groupModels.length}/6):</span>
                {groupModels.map((mid) => (
                  <span key={mid} className="flex items-center gap-1.5 rounded-sm bg-card border border-border px-2.5 py-1 text-xs">
                    <span className={cn('text-[10px] font-bold', getProviderBadge(mid))}>{getProviderName(mid).slice(0, 2)}</span>
                    {getLabel(mid)}
                    {groupModels.length > 2 && (
                      <button onClick={() => removeGroupModel(mid)} className="text-muted-foreground/50 hover:text-red-400 transition-colors"><X size={10} /></button>
                    )}
                  </span>
                ))}
                {groupModels.length < 6 && <ModelPicker value="" onChange={addGroupModel} placeholder="+ Add model" />}
              </div>

              <div className="flex-1 overflow-y-auto min-h-0 space-y-4 py-2">
                {groupTurns.length === 0 && (
                  <div className="h-full flex items-center justify-center">
                    <div className="text-center space-y-2">
                      <Layers size={32} className="mx-auto text-muted-foreground/20" />
                      <p className="text-sm text-muted-foreground">Compare {groupModels.length} models side by side</p>
                    </div>
                  </div>
                )}
                {groupTurns.map((turn) => (
                  <div key={turn.id} className="space-y-3">
                    <div className="flex justify-end">
                      <div className="max-w-[70%] rounded-xl bg-primary/10 border border-primary/15 px-4 py-2.5 text-sm">
                        <pre className="whitespace-pre-wrap font-sans">{turn.userMsg}</pre>
                      </div>
                    </div>
                    <div className="flex gap-3 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                      {groupModels.map((mid) => {
                        const text = turn.responses[mid] ?? '';
                        const done = turn.done[mid];
                        const key  = `${turn.id}-${mid}`;
                        return (
                          <div key={mid} className="min-w-[200px] flex-1 rounded-xl border border-border bg-card flex flex-col overflow-hidden">
                            <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50 bg-muted/10 shrink-0">
                              <span className={cn('text-[10px] font-bold', getProviderBadge(mid))}>{getProviderName(mid)}</span>
                              <span className="text-[10px] text-muted-foreground flex-1 truncate">{getLabel(mid)}</span>
                              {!done && text.length > 0 && <span className="h-1.5 w-1.5 rounded-full bg-signal animate-pulse shrink-0" />}
                            </div>
                            <div className="flex-1 overflow-y-auto p-3 max-h-64 min-h-[60px]">
                              {text ? (
                                <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-foreground">{text}</pre>
                              ) : (
                                <div className="flex gap-1 pt-1">
                                  {[0, 100, 200].map((d) => <span key={d} className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30 animate-bounce" style={{ animationDelay: `${d}ms` }} />)}
                                </div>
                              )}
                            </div>
                            {text && (
                              <div className="px-3 pb-2 border-t border-border/30 pt-1 shrink-0">
                                <button onClick={() => copyMsg(text, key)} className="flex items-center gap-1 text-[10px] text-muted-foreground/40 hover:text-muted-foreground transition-colors">
                                  {copiedId === key ? <><Check size={9} className="text-signal" />copied</> : <><Copy size={9} />copy</>}
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
                <div ref={groupEnd} />
              </div>

              <div className="flex gap-2 border-t border-border pt-3 shrink-0">
                <textarea ref={groupRef} value={groupInput} onChange={(e) => setGroupInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendGroup(); } }}
                  placeholder={`Ask all ${groupModels.length} models… (Shift+Enter for new line)`}
                  rows={1} disabled={groupLoading}
                  className="flex-1 resize-none rounded-xl border border-border bg-card px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-signal/40 focus:border-signal/40 disabled:opacity-50 overflow-hidden"
                  style={{ minHeight: '42px', maxHeight: '140px' }}
                />
                <button onClick={sendGroup} disabled={groupLoading || !groupInput.trim()}
                  className="flex items-center gap-1.5 rounded-xl border border-signal/40 bg-signal/15 text-signal hover:bg-signal/25 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2.5 text-sm font-semibold font-mono uppercase tracking-wide transition-colors shrink-0">
                  <Send size={14} />{groupLoading ? 'Sending…' : 'Ask All'}
                </button>
              </div>
            </>
          )}
        </>
      )}

      {/* ════════════════════════════════════════
          STRATEGIST MODE
          ════════════════════════════════════════ */}
      {topMode === 'strategist' && (
        <div className="flex-1 overflow-hidden flex flex-col lg:flex-row gap-4 pt-2 min-h-0">

          {/* ── Left panel: input ── */}
          <div className={cn('flex flex-col gap-3 overflow-y-auto', plan ? 'w-full lg:w-[340px] lg:shrink-0' : 'flex-1 max-w-2xl mx-auto')}>

            {/* Header */}
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-500/10 border border-purple-500/20">
                <Cpu size={15} className="text-purple-400" />
              </div>
              <div>
                <p className="text-sm font-semibold">Build Strategist</p>
                <p className="text-[10px] text-muted-foreground">Paste a hackathon brief → get a full plan + Claude Code prompts</p>
              </div>
            </div>

            {/* Template chips */}
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1.5">Quick templates</p>
              <div className="flex flex-wrap gap-1.5">
                {STRAT_TEMPLATES.map((t) => (
                  <button key={t.key} onClick={() => setBrief(t.brief)}
                    className="rounded-sm px-3 py-1 text-xs bg-purple-500/10 text-purple-300 border border-purple-500/20 hover:bg-purple-500/20 transition-colors whitespace-nowrap">
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Brief */}
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1 block">
                Project Brief
              </label>
              <textarea
                ref={briefRef}
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                placeholder="Paste your hackathon details, project idea, requirements, constraints, timeline…"
                className="w-full resize-none rounded-xl border border-border bg-card px-4 py-3 text-sm outline-none focus:ring-1 focus:ring-purple-500/40 focus:border-purple-500/30 leading-relaxed"
                style={{ minHeight: '160px', maxHeight: '400px' }}
              />
            </div>

            {/* Resources */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                  Resources / Links
                </label>
                <button onClick={addResource}
                  className="flex items-center gap-1 text-[10px] text-purple-400 hover:text-purple-300 transition-colors">
                  <Plus size={10} /> Add link
                </button>
              </div>
              {resources.length === 0 && (
                <p className="text-[10px] text-muted-foreground/50 italic">Optional — add hackathon page, docs, existing repos…</p>
              )}
              <div className="space-y-2">
                {resources.map((r) => (
                  <div key={r.id} className="flex flex-wrap gap-1.5">
                    <div className="flex items-center gap-1.5 flex-1 rounded-lg border border-border bg-card px-2.5 py-1.5">
                      <Link size={10} className="text-muted-foreground/50 shrink-0" />
                      <input
                        value={r.url}
                        onChange={(e) => updateResource(r.id, 'url', e.target.value)}
                        placeholder="https://…"
                        className="flex-1 bg-transparent text-xs outline-none min-w-0"
                      />
                    </div>
                    <input
                      value={r.note}
                      onChange={(e) => updateResource(r.id, 'note', e.target.value)}
                      placeholder="note (optional)"
                      className="w-28 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs outline-none"
                    />
                    <button onClick={() => removeResource(r.id)}
                      className="text-muted-foreground/50 hover:text-red-400 transition-colors px-1">
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Model + action */}
            <div className="flex items-center gap-2">
              <ModelPicker value={stratModel} onChange={setStratModel} />
              <button
                onClick={buildPlan}
                disabled={!brief.trim() || planLoading}
                className="flex items-center gap-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed px-5 py-2 text-sm font-semibold text-white transition-colors"
              >
                {planLoading
                  ? <><RefreshCw size={14} className="animate-spin" />Building…</>
                  : <><Play size={14} />Build Plan</>}
              </button>
              {plan && (
                <button onClick={() => { setPlan(''); setBrief(''); setResources([]); }}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                  Reset
                </button>
              )}
            </div>

            {/* Model guide (always visible in left panel) */}
            <div className="rounded-xl border border-border bg-card/50 p-3 mt-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-2 flex items-center gap-1">
                <Sparkles size={9} /> Model guide for building
              </p>
              <div className="space-y-1.5">
                {MODEL_GUIDE.map((g) => (
                  <div key={g.task} className="flex items-start gap-2">
                    <span className="text-[10px] text-muted-foreground w-28 shrink-0 leading-tight pt-0.5">{g.task}</span>
                    <div className="flex-1 min-w-0">
                      <span className={cn('text-[10px] font-semibold', g.badge)}>{g.model}</span>
                      <span className="text-[9px] text-muted-foreground/50 ml-1">— {g.why}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Right panel: streaming plan ── */}
          {plan && (
            <div className="flex-1 flex flex-col min-h-0 min-w-0">
              {/* Plan toolbar */}
              <div className="flex items-center gap-2 pb-2 shrink-0">
                <span className="text-xs font-semibold text-purple-300 flex items-center gap-1.5">
                  <FileText size={11} /> Build Plan
                  {planLoading && <RefreshCw size={10} className="animate-spin text-muted-foreground" />}
                </span>
                <div className="flex-1" />
                <button onClick={copyPlan}
                  className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs hover:bg-accent transition-colors">
                  {planCopied ? <><Check size={11} className="text-signal" />Copied!</> : <><Copy size={11} />Copy plan</>}
                </button>
                <button
                  onClick={() => {
                    const blob = new Blob([plan], { type: 'text/plain' });
                    const a = Object.assign(document.createElement('a'), {
                      href: URL.createObjectURL(blob),
                      download: `build-plan-${new Date().toISOString().slice(0, 10)}.md`,
                    });
                    a.click();
                    URL.revokeObjectURL(a.href);
                  }}
                  className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs hover:bg-accent transition-colors">
                  <Download size={11} /> .md
                </button>
              </div>

              {/* Plan output */}
              <div className="flex-1 overflow-y-auto min-h-0 rounded-xl border border-purple-500/20 bg-card p-4">
                <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-foreground">
                  {plan}
                </pre>
                {planLoading && (
                  <span className="inline-block h-3.5 w-0.5 bg-purple-400 animate-pulse ml-0.5 align-middle" />
                )}
                <div ref={planEnd} />
              </div>
            </div>
          )}

          {/* Empty state when no plan yet */}
          {!plan && !planLoading && (
            <div className="flex-1 hidden lg:flex items-center justify-center">
              <div className="text-center space-y-3 max-w-sm">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-purple-500/10 border border-purple-500/20 mx-auto">
                  <Cpu size={28} className="text-purple-400" />
                </div>
                <p className="text-sm font-semibold text-foreground">Your plan appears here</p>
                <p className="text-xs text-muted-foreground">
                  Fill in the brief on the left. Add hackathon links, paste the requirements, pick a model, hit Build Plan.
                  You&apos;ll get a full architecture, timeline, and Claude Code prompts ready to paste in your terminal.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
