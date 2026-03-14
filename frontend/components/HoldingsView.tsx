import React from 'react';
import { StockHolding } from '../types';

interface Props {
  holdings: StockHolding[];
  onRemove: (id: string) => void;
}

const HoldingsView: React.FC<Props> = ({ holdings, onRemove }) => {
  if (holdings.length === 0) {
    return (
      <div className="py-12 text-center text-slate-400 border-2 border-dashed rounded-xl border-slate-200">
        No holdings found. Import your data to get started.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full text-left">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Asset</th>
            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Quantity</th>
            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Avg Cost/Share</th>
            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Total Cost</th>
            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Current Price</th>
            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Market Value</th>
            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Brokerage</th>
            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {holdings.map((h) => {
            return (
              <tr key={h.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center font-bold text-slate-700 text-sm">
                      {h.ticker}
                    </div>
                    <div className="font-bold text-slate-900">{h.ticker}</div>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-slate-700 font-medium">{h.quantity}</td>
                <td className="px-6 py-4 text-sm text-slate-700 font-medium">${h.averageCostPerShare.toFixed(2)}</td>
                <td className="px-6 py-4 text-sm text-slate-700 font-medium">${h.totalCost.toFixed(2)}</td>
                <td className="px-6 py-4 text-sm text-slate-700 font-medium">${h.currentPrice.toFixed(2)}</td>
                <td className="px-6 py-4 text-sm text-slate-700 font-medium">${h.marketValue.toFixed(2)}</td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase ${
                    h.brokerage === 'Robinhood' ? 'bg-emerald-100 text-emerald-700' :
                    h.brokerage === 'Schwab' ? 'bg-indigo-100 text-indigo-700' :
                    'bg-slate-100 text-slate-700'
                  }`}>
                    {h.brokerage}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <button 
                    onClick={() => onRemove(h.id)}
                    className="p-1 text-slate-300 hover:text-rose-600 transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default HoldingsView;






