'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { AssistantCitation, AssistantMessageDto } from '@odp/shared';
import { api, ApiError } from '@/lib/api';
import { RequireAuth } from '@/components/RequireAuth';
import { Badge, Button, Card, Spinner } from '@/components/ui';

export default function AssistantPage() {
  return (
    <RequireAuth>
      <Assistant />
    </RequireAuth>
  );
}

function Assistant() {
  const [messages, setMessages] = useState<AssistantMessageDto[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [prompts, setPrompts] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.assistant.prompts().then((res) => setPrompts(res.prompts)).catch(() => undefined);
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, thinking]);

  const ask = async (question: string): Promise<void> => {
    if (!question.trim() || thinking) return;
    setError(null);
    setInput('');

    // Show the user's turn immediately.
    setMessages((current) => [
      ...current,
      {
        id: `local-${Date.now()}`,
        role: 'user',
        content: question,
        citations: [],
        createdAt: new Date().toISOString(),
      },
    ]);
    setThinking(true);

    try {
      const reply = await api.assistant.ask(question, conversationId);
      setConversationId(reply.conversationId);
      setMessages((current) => [...current, reply.message]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The assistant could not answer just now.');
    } finally {
      setThinking(false);
    }
  };

  return (
    <div className="mx-auto flex h-[calc(100dvh-9rem)] max-w-3xl flex-col">
      <header className="pb-4">
        <h1 className="text-2xl font-bold">AI career assistant</h1>
        <p className="mt-1 text-sm text-muted">
          Answers come from the opportunities actually in the database — never invented listings.
        </p>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto pb-4">
        {messages.length === 0 && (
          <Card className="p-5">
            <p className="text-sm font-medium">Try asking:</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {prompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => void ask(prompt)}
                  className="rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-left text-sm text-muted transition-colors hover:border-brand hover:text-fg"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </Card>
        )}

        {messages.map((message) => (
          <div key={message.id} className={message.role === 'user' ? 'flex justify-end' : ''}>
            {message.role === 'user' ? (
              <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-brand px-4 py-2.5 text-sm text-brand-fg">
                {message.content}
              </p>
            ) : (
              <div className="space-y-3">
                <div className="card p-4">
                  <Markdownish content={message.content} />
                </div>
                {message.citations.length > 0 && <Citations citations={message.citations} />}
              </div>
            )}
          </div>
        ))}

        {thinking && (
          <div className="card flex items-center gap-2 p-4 text-sm text-muted">
            <Spinner className="h-4 w-4" />
            Searching the opportunity database…
          </div>
        )}

        {error && (
          <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>
        )}

        <div ref={endRef} />
      </div>

      <form
        className="flex gap-2 border-t border-border bg-bg pt-3"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(input);
        }}
      >
        <input
          className="input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about opportunities, eligibility or what to learn next"
          aria-label="Ask the assistant"
          disabled={thinking}
        />
        <Button type="submit" disabled={thinking || !input.trim()}>Ask</Button>
      </form>
    </div>
  );
}

function Citations({ citations }: { citations: AssistantCitation[] }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Sources</p>
      {citations.map((citation, index) => (
        <Card key={citation.opportunityId} className="flex flex-wrap items-center gap-2 p-2.5 text-xs">
          <span className="font-bold text-brand">[{index + 1}]</span>
          <Link href={`/opportunities/${citation.opportunityId}`} className="font-medium hover:text-brand">
            {citation.title}
          </Link>
          <span className="text-muted">· {citation.organization}</span>
          <Badge tone={citation.eligibility === 'Eligible' ? 'success' : citation.eligibility === 'Needs review' ? 'warning' : 'neutral'}>
            {citation.eligibility}
          </Badge>
          <span className="text-subtle">Closes {citation.deadline}</span>
          <a
            href={citation.applicationUrl}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="ml-auto text-brand hover:underline"
          >
            Apply →
          </a>
        </Card>
      ))}
    </div>
  );
}

/**
 * Minimal renderer for the bold/bullet/heading subset the assistant emits.
 * Deliberately not a full markdown parser — the input is our own and this
 * avoids shipping a library plus its XSS surface.
 */
function Markdownish({ content }: { content: string }) {
  const lines = content.split('\n');

  return (
    <div className="space-y-1.5 text-sm leading-relaxed">
      {lines.map((line, index) => {
        if (!line.trim()) return <div key={index} className="h-1.5" />;

        const withBold = line.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
          part.startsWith('**') && part.endsWith('**') ? (
            <strong key={i} className="font-semibold text-fg">{part.slice(2, -2)}</strong>
          ) : (
            <span key={i}>{part}</span>
          ),
        );

        if (line.startsWith('• ')) {
          return (
            <p key={index} className="flex gap-2 pl-1 text-muted">
              <span className="text-brand" aria-hidden="true">•</span>
              <span>{withBold}</span>
            </p>
          );
        }
        if (/^\d+\.\s/.test(line)) {
          return <p key={index} className="pl-1 text-muted">{withBold}</p>;
        }
        return <p key={index} className="text-muted">{withBold}</p>;
      })}
    </div>
  );
}
