
import React, { useState } from 'react';
import { PortfolioStats } from '../types';

interface Props {
  stats: PortfolioStats;
  cashByBrokerage?: Record<string, number>;
}

const fmt = (n: number) =>
  `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const SummaryCards: React.FC<Props> = ({ stats, cashByBrokerage = {} }) => {
  const [showTooltip, setShowTooltip] = useState(false);

  const cards = [
    {
      label: 'Portfolio Value',
      value: `${stats.totalValue < 0 ? '-' : ''}$${Math.abs(stats.totalValue).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      sub: `Assets $${stats.investmentValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} + Cash`,
      subColor: 'text-slate-400',
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

      {/* Cash Balance card with per-brokerage tooltip */}
      <div
        className="relative bg-white border border-[#D2D2D7] rounded p-6 cursor-default"
        style={{ boxShadow: '0px 2px 4px rgba(0,0,0,0.05)' }}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-[0.05em] mb-3 flex items-center gap-1">
          Cash Balance
          <span className="text-[9px] text-slate-300 normal-case tracking-normal font-normal">hover for breakdown</span>
        </p>
        <p className={`text-2xl font-bold leading-tight ${stats.buyingPower < 0 ? 'text-rose-600' : 'text-[#1D1D1F]'}`}>
          {fmt(stats.buyingPower)}
        </p>
        <p className={`text-xs font-medium mt-1.5 ${stats.buyingPower < 0 ? 'text-rose-500' : 'text-slate-400'}`}>
          {stats.buyingPower < 0 ? 'Margin in use' : 'Available to invest'}
        </p>

        {showTooltip && Object.keys(cashByBrokerage).length > 0 && (
          <div className="absolute bottom-full left-0 mb-2 w-full z-50">
            <div className="bg-[#1D1D1F] rounded-lg p-3 shadow-xl">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">By Brokerage</p>
              {Object.entries(cashByBrokerage).map(([brokerage, amount]) => (
                <div key={brokerage} className="flex items-center justify-between gap-4 py-1">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                    brokerage.toLowerCase().includes('robinhood') ? 'bg-[#0F52BA] text-white' :
                    brokerage.toLowerCase().includes('schwab') ? 'bg-[#6E6E73] text-white' :
                    'bg-slate-600 text-white'
                  }`}>{brokerage}</span>
                  <span className={`text-[11px] font-black tabular-nums ${amount < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {fmt(amount)}
                  </span>
                </div>
              ))}
            </div>
            {/* Arrow */}
            <div className="w-3 h-3 bg-[#1D1D1F] rotate-45 ml-6 -mt-1.5 rounded-sm" />
          </div>
        )}
      </div>
    </div>
  );
};

export default SummaryCards;
