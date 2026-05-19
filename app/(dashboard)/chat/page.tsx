'use client';

import { useChat } from '@ai-sdk/react';
import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, ChevronDown } from 'lucide-react';
import { CHAT_MODEL_OPTIONS, type ModelId } from '@/lib/llm/models';
import { cn } from '@/lib/utils/cn';

export default function ChatPage() {
  const [selectedModel, setSelectedModel] = useState<ModelId>(CHAT_MODEL_OPTIONS[0].id);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { messages, input, handleInputChange, handleSubmit, isLoading, error } = useChat({
    api: '/api/chat',
    body: { model: selectedModel },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const selectedLabel = CHAT_MODEL_OPTIONS.find((m) => m.id === selectedModel)?.label ?? selectedModel;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-bold">Chat</h1>
          <p className="text-sm text-muted-foreground">Multi-model — powered by DGrid</p>
        </div>

        {/* Model selector */}
        <div className="relative">
          <button
            onClick={() => setDropdownOpen((o) => !o)}
            className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm hover:bg-accent"
          >
            {selectedLabel}
            <ChevronDown size={14} />
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 top-10 z-10 w-60 rounded-md border border-border bg-card shadow-lg">
              {CHAT_MODEL_OPTIONS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => { setSelectedModel(m.id); setDropdownOpen(false); }}
                  className={cn(
                    'w-full px-4 py-2 text-left text-sm hover:bg-accent',
                    m.id === selectedModel && 'bg-accent font-medium'
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Bot size={40} className="mx-auto mb-3 opacity-40" />
              <p className="text-sm">Ask about alpha, memes, hackathons, or anything crypto.</p>
            </div>
          </div>
        )}

        {messages.map((m) => (
          <div
            key={m.id}
            className={cn(
              'flex gap-3',
              m.role === 'user' ? 'flex-row-reverse' : 'flex-row'
            )}
          >
            <div className={cn(
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs',
              m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
            )}>
              {m.role === 'user' ? <User size={14} /> : <Bot size={14} />}
            </div>

            <div className={cn(
              'max-w-[75%] rounded-lg px-4 py-2 text-sm',
              m.role === 'user'
                ? 'bg-primary text-primary-foreground'
                : 'bg-card border border-border text-foreground'
            )}>
              <p className="whitespace-pre-wrap">{m.content}</p>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Bot size={14} />
            </div>
            <div className="rounded-lg border border-border bg-card px-4 py-2 text-sm text-muted-foreground">
              <span className="animate-pulse">Thinking…</span>
            </div>
          </div>
        )}

        {error && (
          <p className="text-center text-xs text-red-400">{error.message}</p>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="flex gap-2 border-t border-border pt-4"
      >
        <input
          value={input}
          onChange={handleInputChange}
          placeholder="Ask anything…"
          className="flex-1 rounded-md border border-border bg-card px-4 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
          disabled={isLoading}
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
        >
          <Send size={14} />
          Send
        </button>
      </form>
    </div>
  );
}
