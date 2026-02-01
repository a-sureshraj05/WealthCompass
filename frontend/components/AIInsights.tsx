
import React, { useState, useEffect } from 'react';
import { StockHolding } from '../types';
import { getPortfolioInsights } from '../services/geminiService';

interface Props {
  holdings: StockHolding[];
}

const AIInsights: React.FC<Props> = ({ holdings }) => {
  const [insights, setInsights] = useState<string>('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (holdings.length > 0) {
      setLoading(true);
      getPortfolioInsights(holdings).then(text => {
        setInsights(text);
        setLoading(false);
      });
    } else {
      setInsights('Add assets to see AI wealth insights.');
    }
  }, [holdings]);

  return (
    <div className="bg-white p-6 rounded-2xl border shadow-sm relative overflow-hidden group">
      <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-full -mr-16 -mt-16 group-hover:bg-indigo-100 transition-colors" />
      
      <div className="relative">
        <div className="flex items-center space-x-2 mb-6">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-slate-900">AI Wealth Intelligence</h3>
        </div>

        {loading ? (
          <div className="space-y-4">
            <div className="h-4 bg-slate-100 rounded-full w-3/4 animate-pulse"></div>
            <div className="h-4 bg-slate-100 rounded-full w-full animate-pulse"></div>
            <div className="h-4 bg-slate-100 rounded-full w-5/6 animate-pulse"></div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
              {insights}
            </p>
            <div className="pt-4 flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-widest border-t">
              <span>Updated Just Now</span>
              <span className="flex items-center">
                <span className="w-2 h-2 bg-emerald-500 rounded-full mr-2"></span>
                Active Advisor
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AIInsights;
