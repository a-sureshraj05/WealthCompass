
import React, { useState } from 'react';
import { PortfolioStats } from '../../types';

type Direction = 'up' | 'down' | null;

// Gain/loss is a status pair, so red/green alone would be unreadable for the
// most common form of colourblindness — the arrow is the secondary encoding
// that makes direction survive without colour.
// These steps are darker than the usual emerald-600/#FF3B30: at 12px those
// score 3.8:1 and 3.6:1 against white, under the 4.5:1 AA floor for normal
// text. emerald-700 (5.5:1) and rose-600 (4.7:1) pass at every size used here.
const POSITIVE = 'text-emerald-700';
const NEGATIVE = 'text-rose-600';

/** Direction triangle. Decorative — the sign is announced via sr-only text. */
const TrendArrow: React.FC<{ direction: Exclude<Direction, null>; className?: string }> = ({ direction, className = 'w-4 h-4' }) => (
  <svg
    className={`${className} shrink-0`}
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
  >
    {direction === 'up'
      ? <path d="M12 5l7 11H5z" />
      : <path d="M12 19L5 8h14z" />}
  </svg>
);

interface Props {
  stats: PortfolioStats;
  cashByBrokerage?: Record<string, number>;
  numbersVisible?: boolean;
  onToggleNumbers?: () => void;
}

const EyeIcon: React.FC<{ visible: boolean; onToggle: () => void }> = ({ visible, onToggle }) => (
  <button
    onClick={onToggle}
    className="absolute top-3 right-3 text-slate-300 hover:text-slate-500 transition-colors"
    title={visible ? 'Hide numbers' : 'Show numbers'}
  >
    {visible ? (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
      </svg>
    ) : (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
      </svg>
    )}
  </button>
);

/** Unsigned: every figure on these cards has an arrow carrying its sign. */
const fmtAbs = (n: number) =>
  `$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const SummaryCards: React.FC<Props> = ({ stats, cashByBrokerage = {}, numbersVisible = true, onToggleNumbers }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const mask = '••••••';

  const money = (n: number) =>
    `$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const cards = [
    {
      label: 'Portfolio Value',
      // A level, not a change — no direction, no polarity colour.
      direction: null as Direction,
      value: `${stats.totalValue < 0 ? '-' : ''}${money(stats.totalValue)}`,
      valueColor: 'text-[#1D1D1F]',
      sub: `Assets ${money(stats.investmentValue)} + Cash`,
      subColor: 'text-slate-400',
    },
    {
      label: 'Daily Gain/Loss',
      direction: (stats.dayChange >= 0 ? 'up' : 'down') as Direction,
      value: money(stats.dayChange),
      valueColor: stats.dayChange >= 0 ? POSITIVE : NEGATIVE,
      // No +/- here: the arrow above already carries the sign.
      sub: `${Math.abs(stats.dayChangePercentage).toFixed(2)}%`,
      subColor: stats.dayChange >= 0 ? POSITIVE : NEGATIVE,
    },
    {
      label: 'Overall Return',
      direction: (stats.totalGain >= 0 ? 'up' : 'down') as Direction,
      value: money(stats.totalGain),
      valueColor: stats.totalGain >= 0 ? POSITIVE : NEGATIVE,
      sub: `${Math.abs(stats.gainPercentage).toFixed(2)}% on cost basis`,
      subColor: stats.totalGain >= 0 ? POSITIVE : NEGATIVE,
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
      {cards.map((card, idx) => (
        <div
          key={idx}
          className="relative bg-white border border-[#D2D2D7] rounded p-6"
          style={{ boxShadow: '0px 2px 4px rgba(0,0,0,0.05)' }}
        >
          {onToggleNumbers && <EyeIcon visible={numbersVisible} onToggle={onToggleNumbers} />}
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-[0.05em] mb-3">{card.label}</p>
          <p className={`text-2xl font-bold leading-tight flex items-center gap-1.5 ${numbersVisible ? card.valueColor : 'text-[#1D1D1F]'}`}>
            {numbersVisible && card.direction && (
              <>
                <TrendArrow direction={card.direction} />
                <span className="sr-only">{card.direction === 'up' ? 'up' : 'down'}</span>
              </>
            )}
            {numbersVisible ? card.value : mask}
          </p>
          <p className={`text-xs font-medium mt-1.5 ${numbersVisible ? card.subColor : 'text-slate-400'}`}>{numbersVisible ? card.sub : mask}</p>
        </div>
      ))}

      {/* Cash Balance card with per-brokerage tooltip */}
      <div
        className="relative bg-white border border-[#D2D2D7] rounded p-6 cursor-default"
        style={{ boxShadow: '0px 2px 4px rgba(0,0,0,0.05)' }}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        {onToggleNumbers && <EyeIcon visible={numbersVisible} onToggle={onToggleNumbers} />}
        <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-[0.05em] mb-3 flex items-center gap-1">
          Cash Balance
          <span className="text-[9px] text-slate-300 normal-case tracking-normal font-normal">hover for breakdown</span>
        </p>
        {/* Arrows both ways here, matching the change cards: above or below
            zero, i.e. cash on hand versus margin drawn. */}
        <p className={`text-2xl font-bold leading-tight flex items-center gap-1.5 ${numbersVisible ? (stats.buyingPower < 0 ? NEGATIVE : POSITIVE) : 'text-[#1D1D1F]'}`}>
          {numbersVisible && (
            <>
              <TrendArrow direction={stats.buyingPower < 0 ? 'down' : 'up'} />
              <span className="sr-only">{stats.buyingPower < 0 ? 'negative' : 'positive'}</span>
            </>
          )}
          {numbersVisible ? fmtAbs(stats.buyingPower) : mask}
        </p>
        {/* rose-600 rather than rose-500: at 12px the latter is 3.7:1 on white,
            under the 4.5:1 AA floor for normal text. */}
        <p className={`text-xs font-medium mt-1.5 ${stats.buyingPower < 0 ? NEGATIVE : 'text-slate-400'}`}>
          {stats.buyingPower < 0 ? 'Margin in use' : 'Available to invest'}
        </p>

        {showTooltip && numbersVisible && Object.keys(cashByBrokerage).length > 0 && (() => {
          const aggregated: Record<string, number> = {};
          for (const [key, amount] of Object.entries(cashByBrokerage)) {
            const brokerage = key.includes(' · ') ? key.split(' · ')[0] : key;
            aggregated[brokerage] = (aggregated[brokerage] ?? 0) + amount;
          }
          return (
            <div className="absolute top-full left-0 mt-2 w-full z-50">
              {/* Arrow */}
              <div className="w-3 h-3 bg-[#1D1D1F] rotate-45 ml-6 -mb-1.5 rounded-sm" />
              <div className="bg-[#1D1D1F] rounded-lg p-3 shadow-xl">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">By Brokerage</p>
                {Object.entries(aggregated).sort(([a], [b]) => a.localeCompare(b)).map(([brokerage, amount]) => {
                  const k = brokerage.toLowerCase();
                  const badgeCls = k.includes('robinhood') ? 'bg-[#0F52BA] text-white'
                    : k.includes('schwab') ? 'bg-[#6E6E73] text-white'
                    : k.includes('fidelity') ? 'bg-[#417505] text-white'
                    : 'bg-slate-600 text-white';
                  return (
                    <div key={brokerage} className="flex items-center justify-between gap-4 py-1">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${badgeCls}`}>{brokerage}</span>
                      {/* Lighter steps here because the surface is dark: rose-400
                          is 6.3:1 and emerald-400 8.8:1 against #1D1D1F. The
                          card's darker steps would be unreadable on this. */}
                      <span className={`text-[11px] font-black tabular-nums shrink-0 flex items-center gap-1 ${amount < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                        <TrendArrow direction={amount < 0 ? 'down' : 'up'} className="w-2.5 h-2.5" />
                        <span className="sr-only">{amount < 0 ? 'negative' : 'positive'}</span>
                        {fmtAbs(amount)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
};

export default SummaryCards;
