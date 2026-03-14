
import React from 'react';
import { PortfolioStats } from '../types';

interface Props {
  stats: PortfolioStats;
}

const SummaryCards: React.FC<Props> = ({ stats }) => {
  const cards = [
    {
      label: 'Portfolio Value',
      value: `$${stats.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      sub: stats.totalGain >= 0 ? `+$${stats.totalGain.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Total Gain` : `-$${Math.abs(stats.totalGain).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Total Loss`,
      subColor: stats.totalGain >= 0 ? 'text-emerald-600' : 'text-rose-600',
      icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
    },
    {
      label: 'Daily Gain/Loss',
      value: `${stats.dayChange >= 0 ? '+' : '-'}$${Math.abs(stats.dayChange).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      sub: `${stats.dayChangePercentage}% from yesterday`,
      subColor: stats.dayChange >= 0 ? 'text-emerald-600' : 'text-rose-600',
      icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z'
    },
    {
      label: 'Overall Return',
      value: `${stats.totalGain >= 0 ? '+' : '-'}$${Math.abs(stats.totalGain).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      sub: `${stats.gainPercentage >= 0 ? '+' : ''}${stats.gainPercentage.toFixed(2)}% on cost basis`,
      subColor: stats.totalGain >= 0 ? 'text-emerald-600' : 'text-rose-600',
      icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6'
    },
    {
      label: 'Buying Power',
      value: '$0.00',
      sub: 'Connect brokerages to sync',
      subColor: 'text-slate-500',
      icon: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z'
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
      {cards.map((card, idx) => (
        <div key={idx} className="bg-white p-6 rounded-2xl border shadow-sm hover:shadow-md transition-shadow group">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-semibold text-slate-500 uppercase tracking-wider">{card.label}</span>
            <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 group-hover:scale-110 transition-transform">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={card.icon} />
              </svg>
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-2xl font-bold text-slate-900">{card.value}</div>
            <div className={`text-xs font-medium ${card.subColor}`}>{card.sub}</div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default SummaryCards;
