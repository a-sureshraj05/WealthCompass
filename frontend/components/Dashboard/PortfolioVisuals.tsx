
import React from 'react';
import { StockHolding } from '../types';
import { brokerageColor } from '../../utils/finance';

interface Props {
  holdings: StockHolding[];
  cashByBrokerage?: Record<string, number>;
  numbersVisible?: boolean;
  onToggleNumbers?: () => void;
}

const COLORS = ['#0F52BA', '#34C759', '#FF9500', '#FF2D55', '#AF52DE', '#5AC8FA', '#6E6E73', '#FF6B35', '#00C7BE', '#30B0C7'];

const EyeBtn: React.FC<{ visible: boolean; onToggle: () => void }> = ({ visible, onToggle }) => (
  <button
    onClick={onToggle}
    className="text-slate-300 hover:text-slate-500 transition-colors"
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

const PortfolioVisuals: React.FC<Props> = ({ holdings, cashByBrokerage = {}, numbersVisible = true, onToggleNumbers }) => {
  const mask = '••••••';
  const tickerAllocationData = React.useMemo(() => {
    const tickers: Record<string, number> = {};
    holdings.forEach(h => {
      tickers[h.ticker] = (tickers[h.ticker] || 0) + h.marketValue;
    });
    const entries = Object.entries(tickers).map(([ticker, value]) => ({ ticker, value }));
    const total = entries.reduce((s, e) => s + e.value, 0);
    return entries
      .map(e => ({ ...e, pct: total > 0 ? (e.value / total) * 100 : 0 }))
      .sort((a, b) => b.pct - a.pct);
  }, [holdings]);

  const brokerageData = React.useMemo(() => {
    const brokers: Record<string, number> = {};
    holdings.forEach(h => {
      brokers[h.brokerage] = (brokers[h.brokerage] || 0) + h.marketValue;
    });
    Object.entries(cashByBrokerage).forEach(([key, cash]) => {
      const brokerage = key.includes(' · ') ? key.split(' · ')[0] : key;
      brokers[brokerage] = (brokers[brokerage] || 0) + cash;
    });
    const entries = Object.entries(brokers).map(([name, value]) => ({ name, value }));
    const total = entries.reduce((s, e) => s + e.value, 0);
    return entries.map(e => ({ ...e, pct: total > 0 ? (e.value / total) * 100 : 0 }));
  }, [holdings, cashByBrokerage]);

  if (holdings.length === 0) {
    return (
      <div
        className="bg-white border border-[#D2D2D7] rounded p-12 flex flex-col items-center justify-center text-slate-400"
        style={{ boxShadow: '0px 2px 4px rgba(0,0,0,0.05)' }}
      >
        <svg className="w-12 h-12 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
        </svg>
        <p className="text-sm font-medium">No data to visualize</p>
        <p className="text-xs mt-1">Import your first brokerage statement to see visuals.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full">
      {/* Company Allocation */}
      <div className="bg-white border border-[#D2D2D7] rounded p-6 flex flex-col" style={{ boxShadow: '0px 2px 4px rgba(0,0,0,0.05)' }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-[#1D1D1F]">Company Allocation</h3>
          <div className="flex items-center gap-2">
            {onToggleNumbers && <EyeBtn visible={numbersVisible} onToggle={onToggleNumbers} />}
            <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
            </svg>
          </div>
        </div>

        <div className="flex-1 space-y-2.5 overflow-y-auto max-h-[300px] pr-1">
          {tickerAllocationData.map((d, i) => (
            <div key={d.ticker}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                  <span className="text-xs font-semibold text-[#1D1D1F]">{d.ticker}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-slate-400 tabular-nums">
                    {numbersVisible ? `$${d.value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : mask}
                  </span>
                  <span className="text-xs font-semibold text-[#1D1D1F] w-9 text-right tabular-nums">
                    {numbersVisible ? `${d.pct.toFixed(1)}%` : mask}
                  </span>
                </div>
              </div>
              <div className="h-1 bg-[#F5F5F7] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${d.pct}%`, backgroundColor: COLORS[i % COLORS.length] }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Brokerage Distribution */}
      <div className="bg-white border border-[#D2D2D7] rounded p-6 flex flex-col" style={{ boxShadow: '0px 2px 4px rgba(0,0,0,0.05)' }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-[#1D1D1F]">Brokerage Distribution</h3>
          <div className="flex items-center gap-2">
            {onToggleNumbers && <EyeBtn visible={numbersVisible} onToggle={onToggleNumbers} />}
            <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
            </svg>
          </div>
        </div>

        <div className="flex-1 space-y-5">
          {brokerageData.map((b, i) => (
            <div key={b.name}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: brokerageColor(b.name, i) }} />
                  <span className="text-sm font-medium text-[#1D1D1F]">{b.name}</span>
                </div>
                <span className={`text-sm font-semibold ${b.value < 0 ? 'text-rose-600' : 'text-[#1D1D1F]'}`}>
                  {numbersVisible ? `${b.value < 0 ? '-' : ''}$${Math.abs(b.value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : mask}
                </span>
              </div>
              <div className="h-1.5 bg-[#F5F5F7] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.max(0, b.pct)}%`, backgroundColor: brokerageColor(b.name, i) }}
                />
              </div>
            </div>
          ))}
        </div>

        {brokerageData.length > 0 && (
          <p className="text-[11px] text-slate-400 mt-4 pt-4 border-t border-[#D2D2D7]">
            Last synced: just now
          </p>
        )}
      </div>
    </div>
  );
};

export default PortfolioVisuals;
