
import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { StockHolding } from '../types';

interface Props {
  holdings: StockHolding[];
}

const COLORS = ['#0F52BA', '#2E6DB4', '#5AC8FA', '#34C759', '#FF9500', '#FF2D55', '#6E6E73'];

const SectorTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const { name, value, tickers } = payload[0].payload;
  return (
    <div className="bg-white border border-[#D2D2D7] rounded p-3 text-xs" style={{ boxShadow: '0px 2px 4px rgba(0,0,0,0.05)' }}>
      <p className="font-bold text-[#1D1D1F] mb-1">{name}</p>
      <p className="text-slate-500 mb-2">${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
      <div className="flex flex-wrap gap-1">
        {tickers.map((t: string) => (
          <span key={t} className="bg-[#E6EEFB] text-[#0A3E8F] font-semibold px-1.5 py-0.5 rounded">{t}</span>
        ))}
      </div>
    </div>
  );
};

const PortfolioVisuals: React.FC<Props> = ({ holdings }) => {
  const allocationData = React.useMemo(() => {
    const sectors: Record<string, { value: number; tickers: string[] }> = {};
    holdings.forEach(h => {
      const key = h.sector || h.assetType || 'Other';
      if (!sectors[key]) sectors[key] = { value: 0, tickers: [] };
      sectors[key].value += h.marketValue;
      if (!sectors[key].tickers.includes(h.ticker)) sectors[key].tickers.push(h.ticker);
    });
    return Object.entries(sectors).map(([name, { value, tickers }]) => ({ name, value, tickers }));
  }, [holdings]);

  const brokerageData = React.useMemo(() => {
    const brokers: Record<string, number> = {};
    holdings.forEach(h => {
      brokers[h.brokerage] = (brokers[h.brokerage] || 0) + (h.quantity * h.currentPrice);
    });
    const entries = Object.entries(brokers).map(([name, value]) => ({ name, value }));
    const total = entries.reduce((s, e) => s + e.value, 0);
    return entries.map(e => ({ ...e, pct: total > 0 ? (e.value / total) * 100 : 0 }));
  }, [holdings]);

  const totalAllocation = React.useMemo(() => {
    const total = allocationData.reduce((s, d) => s + d.value, 0);
    return allocationData.map(d => ({ ...d, pct: total > 0 ? (d.value / total) * 100 : 0 }));
  }, [allocationData]);

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
      {/* Sector Allocation */}
      <div className="bg-white border border-[#D2D2D7] rounded p-6 flex flex-col" style={{ boxShadow: '0px 2px 4px rgba(0,0,0,0.05)' }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-[#1D1D1F]">Sector Allocation</h3>
          <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
          </svg>
        </div>

        <div className="relative flex-1 min-h-[180px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={allocationData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={3}
                dataKey="value"
                startAngle={90}
                endAngle={-270}
              >
                {allocationData.map((_entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="none" />
                ))}
              </Pie>
              <Tooltip content={<SectorTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          {/* Center label */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-[0.05em]">Total</span>
            <span className="text-lg font-bold text-[#1D1D1F]">100%</span>
          </div>
        </div>

        {/* Legend */}
        <div className="mt-4 space-y-1.5">
          {totalAllocation.slice(0, 5).map((d, i) => (
            <div key={d.name} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                <span className="text-xs text-slate-600 truncate max-w-[140px]">{d.name}</span>
              </div>
              <span className="text-xs font-semibold text-[#1D1D1F]">{d.pct.toFixed(0)}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* Brokerage Distribution */}
      <div className="bg-white border border-[#D2D2D7] rounded p-6 flex flex-col" style={{ boxShadow: '0px 2px 4px rgba(0,0,0,0.05)' }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-[#1D1D1F]">Brokerage Distribution</h3>
          <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
          </svg>
        </div>

        <div className="flex-1 space-y-5">
          {brokerageData.map((b, i) => (
            <div key={b.name}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-medium text-[#1D1D1F]">{b.name}</span>
                <span className="text-sm font-semibold text-[#1D1D1F]">
                  ${b.value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </span>
              </div>
              <div className="h-1.5 bg-[#F5F5F7] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${b.pct}%`, backgroundColor: COLORS[i % COLORS.length] }}
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
