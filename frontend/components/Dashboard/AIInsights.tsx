import React, { useState, useEffect, useCallback } from 'react';
import { StockHolding } from '../../types';
import { fetchInsightsCached, generateInsights } from '../../services/apiService';

interface Props {
  holdings: StockHolding[];
}

/**
 * AI portfolio insights.
 *
 * The load/generate split is deliberate and load-bearing: mounting reads the
 * cache (free, instant), and only the button spends money. An earlier version
 * generated from a useEffect on `holdings`, which would bill once per page load
 * per visitor — untenable on an instance whose credentials are published.
 */
const AIInsights: React.FC<Props> = ({ holdings }) => {
  const [insights, setInsights] = useState<string>('');
  const [generatedAt, setGeneratedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string>('');

  // Cache read only. Deliberately does not depend on `holdings` — re-reading
  // whenever a price tick changes the array would be pointless, and making this
  // effect generate anything would reintroduce per-load billing.
  useEffect(() => {
    let cancelled = false;
    fetchInsightsCached()
      .then(data => {
        if (cancelled) return;
        setInsights(data.text ?? '');
        setGeneratedAt(data.generated_at);
      })
      .catch(() => {
        if (!cancelled) setInsights('');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    setError('');
    try {
      const data = await generateInsights();
      if (data.available === false) {
        setError(data.reason ?? 'Insights are unavailable.');
      } else {
        setInsights(data.text ?? '');
        setGeneratedAt(data.generated_at);
      }
    } catch (err: any) {
      setError(err.message || 'Could not generate insights.');
    } finally {
      setGenerating(false);
    }
  }, []);

  const insightLines = insights
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);

  const hasHoldings = holdings.length > 0;
  const busy = loading || generating;

  const buttonLabel = generating
    ? 'Analyzing…'
    : insightLines.length > 0
      ? 'Regenerate Insights'
      : 'View Detailed Insights';

  return (
    <div
      className="bg-white border border-[#D2D2D7] rounded p-6 flex flex-col"
      style={{ boxShadow: '0px 2px 4px rgba(0,0,0,0.05)' }}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-[#0F52BA]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          <h3 className="text-sm font-semibold text-[#1D1D1F]">AI Wealth Intelligence</h3>
        </div>
        <svg className="w-4 h-4 text-[#0F52BA]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
        </svg>
      </div>

      {busy ? (
        <div className="space-y-3 flex-1">
          {[1, 2, 3].map(i => (
            <div key={i} className="border border-[#D2D2D7] rounded p-3 space-y-1.5 animate-pulse">
              <div className="h-3 bg-[#F5F5F7] rounded w-full" />
              <div className="h-3 bg-[#F5F5F7] rounded w-4/5" />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex-1 space-y-2">
          {error && (
            <div className="border border-amber-200 bg-amber-50 rounded p-3">
              <p className="text-xs text-amber-900 leading-relaxed">{error}</p>
            </div>
          )}

          {insightLines.length > 0 ? (
            insightLines.map((line, i) => (
              <div key={i} className="border border-[#D2D2D7] rounded p-3">
                <p className="text-xs text-slate-600 leading-relaxed">{line}</p>
              </div>
            ))
          ) : !error && (
            <div className="border border-dashed border-[#D2D2D7] rounded p-3">
              <p className="text-xs text-slate-500 leading-relaxed">
                {hasHoldings
                  ? 'No insights generated yet. Use the button below to analyze your current portfolio.'
                  : 'Add holdings to generate AI insights.'}
              </p>
            </div>
          )}
        </div>
      )}

      <button
        onClick={handleGenerate}
        disabled={busy || !hasHoldings}
        className="mt-4 pt-4 border-t border-[#D2D2D7] text-[11px] font-semibold text-[#0F52BA] uppercase tracking-[0.05em] text-right hover:text-[#0A3E8F] transition-colors w-full disabled:text-slate-400 disabled:cursor-not-allowed"
      >
        {buttonLabel}
      </button>

      {generatedAt && !busy && (
        <p className="mt-1.5 text-[10px] text-slate-400 text-right">
          Generated {new Date(generatedAt * 1000).toLocaleString()}
        </p>
      )}
    </div>
  );
};

export default AIInsights;
