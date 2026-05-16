import React, { useState, useEffect } from 'react';
import { StockHolding } from '../../types';
import { getPortfolioInsights, InsightItem } from '../../services/apiService';

interface Props {
  holdings: StockHolding[];
}

const CATEGORY_LABELS: Record<string, string> = {
  concentration: 'Concentration',
  tax: 'Tax',
  performance: 'Performance',
  options: 'Options',
  action: 'Action',
};

const TYPE_STYLES: Record<string, { bg: string; border: string; dot: string; text: string }> = {
  warning:  { bg: 'bg-amber-50',   border: 'border-amber-200',  dot: 'bg-amber-400',   text: 'text-amber-700' },
  negative: { bg: 'bg-rose-50',    border: 'border-rose-200',   dot: 'bg-rose-500',    text: 'text-rose-700' },
  positive: { bg: 'bg-emerald-50', border: 'border-emerald-200',dot: 'bg-emerald-500', text: 'text-emerald-700' },
  info:     { bg: 'bg-indigo-50',  border: 'border-indigo-200', dot: 'bg-indigo-400',  text: 'text-indigo-700' },
};

const CATEGORY_ICONS: Record<string, React.ReactElement> = {
  concentration: (
    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
    </svg>
  ),
  tax: (
    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
    </svg>
  ),
  performance: (
    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
    </svg>
  ),
  options: (
    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
  action: (
    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  ),
};

const AIInsights: React.FC<Props> = ({ holdings }) => {
  const [insights, setInsights] = useState<InsightItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = () => {
    if (holdings.length === 0) return;
    setLoading(true);
    setError('');
    getPortfolioInsights()
      .then(data => {
        setInsights(data);
        setLastUpdated(new Date());
      })
      .catch(e => setError(e.message || 'Failed to load insights'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [holdings.length > 0]);

  return (
    <div className="bg-white p-6 rounded-2xl border shadow-sm relative overflow-hidden h-full">
      <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-full -mr-16 -mt-16" />

      <div className="relative">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-slate-900">AI Wealth Intelligence</h3>
          </div>
          {!loading && holdings.length > 0 && (
            <button
              onClick={load}
              className="text-[10px] font-bold text-indigo-500 hover:text-indigo-700 uppercase tracking-widest transition-colors"
            >
              Refresh
            </button>
          )}
        </div>

        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="rounded-xl border border-slate-100 p-3 animate-pulse">
                <div className="h-3 bg-slate-100 rounded-full w-1/3 mb-2"></div>
                <div className="h-3 bg-slate-100 rounded-full w-full mb-1"></div>
                <div className="h-3 bg-slate-100 rounded-full w-4/5"></div>
              </div>
            ))}
          </div>
        )}

        {/* No holdings */}
        {!loading && holdings.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-6">Add assets to see AI wealth insights.</p>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
            {error}
          </div>
        )}

        {/* Insights */}
        {!loading && !error && insights.length > 0 && (
          <div className="space-y-2.5">
            {insights.map((insight, i) => {
              const style = TYPE_STYLES[insight.type] || TYPE_STYLES.info;
              const icon = CATEGORY_ICONS[insight.category];
              return (
                <div key={i} className={`rounded-xl border px-3.5 py-3 ${style.bg} ${style.border}`}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className={`w-4 h-4 rounded-md flex items-center justify-center ${style.text} opacity-80`}>
                      {icon}
                    </span>
                    <span className={`text-[9px] font-black uppercase tracking-widest ${style.text}`}>
                      {CATEGORY_LABELS[insight.category] || insight.category}
                    </span>
                    <span className={`w-1.5 h-1.5 rounded-full ml-auto ${style.dot}`}></span>
                  </div>
                  <p className="text-[11px] font-bold text-slate-800 mb-0.5">{insight.title}</p>
                  <p className="text-[11px] text-slate-600 leading-relaxed">{insight.message}</p>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer */}
        {!loading && insights.length > 0 && (
          <div className="pt-4 flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-widest border-t mt-3">
            <span>{lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : 'Updated just now'}</span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
              Active Advisor
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default AIInsights;
