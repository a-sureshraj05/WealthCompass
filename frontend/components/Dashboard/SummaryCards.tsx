
import React from 'react';
import { PortfolioStats } from '../types';

interface Props {
  stats: PortfolioStats;
}

const SummaryCards: React.FC<Props> = ({ stats }) => {
  const cards = [
    {
      label: 'Portfolio Value',
      value: `$${stats.investmentValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      sub: stats.totalGain >= 0
        ? `+$${stats.totalGain.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Gain`
        : `-$${Math.abs(stats.totalGain).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Loss`,
      subColor: stats.totalGain >= 0 ? 'text-emerald-600' : 'text-[#FF3B30]',
    },
    {
      label: 'Daily Gain/Loss',
      value: `${stats.dayChange >= 0 ? '+' : '-'}$${Math.abs(stats.dayChange).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      sub: `${stats.dayChangePercentage >= 0 ? '+' : ''}${stats.dayChangePercentage.toFixed(2)}%`,
      subColor: stats.dayChange >= 0 ? 'text-emerald-600' : 'text-[#FF3B30]',
    },
    {
      label: 'Overall Return',
      value: `${stats.totalGain >= 0 ? '+' : '-'}$${Math.abs(stats.totalGain).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      sub: `${stats.gainPercentage >= 0 ? '+' : ''}${stats.gainPercentage.toFixed(2)}% on cost basis`,
      subColor: stats.totalGain >= 0 ? 'text-emerald-600' : 'text-[#FF3B30]',
    },
    {
      label: 'Buying Power',
      value: `$${stats.buyingPower.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      sub: stats.buyingPower > 0 ? 'Cash & Sweeps' : 'No cash positions',
      subColor: 'text-slate-400',
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
      {cards.map((card, idx) => (
        <div
          key={idx}
          className="bg-white border border-[#D2D2D7] rounded p-6"
          style={{ boxShadow: '0px 2px 4px rgba(0,0,0,0.05)' }}
        >
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-[0.05em] mb-3">{card.label}</p>
          <p className="text-2xl font-bold text-[#1D1D1F] leading-tight">{card.value}</p>
          <p className={`text-xs font-medium mt-1.5 ${card.subColor}`}>{card.sub}</p>
        </div>
      ))}
    </div>
  );
};

export default SummaryCards;
