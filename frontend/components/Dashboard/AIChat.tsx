import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ChatMessage, sendChatMessage } from '../../services/apiService';

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * Portfolio chat, as a slide-over panel.
 *
 * The conversation is React state and nothing else — closing the panel discards
 * it. That is a deliberate design decision rather than an unfinished one: a
 * stored transcript of questions about someone's finances is a liability with no
 * corresponding benefit, and the backend is stateless to match.
 *
 * The portfolio itself is never sent from here. The backend builds a
 * percentage-scaled digest from the database on each request, so the browser
 * transmits only what the person typed.
 */

/**
 * The one thing the scaled digest cannot protect: what the user types.
 *
 * The portfolio goes out as percentages, but a free-text message does not — so
 * "should I sell $40,000 of NVDA" discloses exactly what the scaling exists to
 * prevent. This flags it and lets the person decide.
 *
 * It deliberately does NOT rewrite or block the message. Silently editing
 * someone's words to something they did not write would be worse than the leak,
 * and they may have good reason to include a figure.
 */
const CURRENCY_PATTERN = /(\$\s?\d|\d[\d,]*\s?(dollars|usd|k\b|million|m\b)|\b\d{4,}\b)/i;

/**
 * Render an assistant line, tolerating markdown the model was asked not to use.
 *
 * The prompt says plain text, and mostly that holds — but "mostly" renders as
 * literal `**TSLA**` in the bubble when it doesn't, which looks broken. Rather
 * than pull in a markdown library for a side panel, this handles the two things
 * that actually show up: bold spans become bold, and leftover heading marks and
 * backticks are dropped.
 *
 * Anything it doesn't recognise falls through as plain text, so an unexpected
 * construct degrades to readable rather than mangled.
 */
const renderLine = (line: string, key: number) => {
  const cleaned = line.replace(/^#{1,6}\s*/, '').replace(/`/g, '');
  const parts = cleaned.split(/\*\*(.+?)\*\*/g);
  return (
    <span key={key}>
      {parts.map((part, i) =>
        // split() puts captured groups at odd indices — those were bold.
        i % 2 === 1 ? <strong key={i} className="font-semibold">{part}</strong> : part
      )}
    </span>
  );
};

const renderContent = (content: string) =>
  content.split('\n').map((line, i, all) => (
    <React.Fragment key={i}>
      {renderLine(line, i)}
      {i < all.length - 1 && <br />}
    </React.Fragment>
  ));

const AIChat: React.FC<Props> = ({ open, onClose }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [remaining, setRemaining] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  const mayContainAmount = CURRENCY_PATTERN.test(input);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;

    const next: ChatMessage[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setError('');
    setSending(true);

    try {
      const data = await sendChatMessage(next);
      if (data.available === false) {
        setError(data.reason ?? 'AI chat is unavailable.');
        // Drop the optimistic user turn: leaving it would make the next send
        // replay a question that was never answered.
        setMessages(messages);
        setInput(text);
      } else {
        setMessages([...next, { role: 'assistant', content: data.reply ?? '' }]);
        setRemaining(data.remaining);
      }
    } catch (err: any) {
      setError(err.message || 'Could not send that message.');
      setMessages(messages);
      setInput(text);
    } finally {
      setSending(false);
    }
  }, [input, messages, sending]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <div
        className="absolute inset-0 bg-black/20"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative flex h-full w-full max-w-md flex-col bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-[#D2D2D7] px-5 py-4">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-[#0F52BA]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <h3 className="text-sm font-semibold text-[#1D1D1F]">Ask about your portfolio</h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Close chat"
            className="text-slate-400 hover:text-slate-700 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {messages.length === 0 && (
            <div className="rounded border border-dashed border-[#D2D2D7] p-4">
              <p className="text-xs text-slate-500 leading-relaxed">
                Ask about concentration, sector exposure, how your positions compare,
                or what the realized history looks like.
              </p>
              <p className="mt-2 text-[11px] text-slate-400 leading-relaxed">
                Your holdings are shared as percentages only — never dollar amounts.
                This conversation is not saved and disappears when you close the panel.
              </p>
            </div>
          )}

          {messages.map((m, i) => (
            <div
              key={i}
              className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
            >
              <div
                className={
                  m.role === 'user'
                    ? 'max-w-[85%] rounded-lg bg-[#0F52BA] px-3 py-2 text-xs leading-relaxed text-white'
                    : 'max-w-[85%] rounded-lg border border-[#D2D2D7] bg-[#F5F5F7] px-3 py-2 text-xs leading-relaxed text-slate-700'
                }
              >
                {m.role === 'assistant' ? renderContent(m.content) : m.content}
              </div>
            </div>
          ))}

          {sending && (
            <div className="flex justify-start">
              <div className="rounded-lg border border-[#D2D2D7] bg-[#F5F5F7] px-3 py-2">
                <div className="flex gap-1">
                  {[0, 150, 300].map(delay => (
                    <span
                      key={delay}
                      className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-pulse"
                      style={{ animationDelay: `${delay}ms` }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="rounded border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs leading-relaxed text-amber-900">{error}</p>
            </div>
          )}
        </div>

        <div className="border-t border-[#D2D2D7] px-5 py-4">
          {mayContainAmount && (
            <div className="mb-2 rounded border border-amber-200 bg-amber-50 px-3 py-2">
              <p className="text-[11px] leading-relaxed text-amber-900">
                That looks like it contains a specific amount. Your holdings are sent
                as percentages, but your own message is sent as written.
              </p>
            </div>
          )}

          <div className="flex gap-2">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              rows={2}
              maxLength={2000}
              placeholder="Ask a question…"
              disabled={sending}
              className="flex-1 resize-none rounded-md border border-slate-200 px-3 py-2 text-xs text-slate-900 placeholder-slate-300 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#0F52BA] disabled:bg-slate-50"
            />
            <button
              onClick={handleSend}
              disabled={sending || !input.trim()}
              className="self-end rounded-md bg-[#0F52BA] px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-[#0A3E8F] disabled:opacity-40"
            >
              Send
            </button>
          </div>

          <p className="mt-2 text-[10px] leading-relaxed text-slate-400">
            Describes your portfolio; does not give financial advice.
            {remaining !== null && ` ${remaining} message${remaining === 1 ? '' : 's'} left this hour.`}
          </p>
        </div>
      </div>
    </div>
  );
};

export default AIChat;
