
import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { StockHolding } from '../types';

interface Props {
  holdings: StockHolding[];
}

const COLORS = ['#6366f1', '#a855f7', '#ec4899', '#f97316', '#10b981', '#0ea5e9', '#64748b'];

const SectorTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const { name, value, tickers } = payload[0].payload;
  return (
    <div style={{ borderRadius: '12px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} className="bg-white border p-3 text-xs">
      <p className="font-bold text-slate-800 mb-1">{name}</p>
      <p className="text-slate-500 mb-2">${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
      <div className="flex flex-wrap gap-1">
        {tickers.map((t: string) => (
          <span key={t} className="bg-indigo-50 text-indigo-700 font-semibold px-1.5 py-0.5 rounded">{t}</span>
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
    return Object.entries(brokers).map(([name, value]) => ({ name, value }));
  }, [holdings]);

  if (holdings.length === 0) {
    return (
      <div className="bg-white p-12 rounded-2xl border flex flex-col items-center justify-center text-slate-400">
        <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
        </svg>
        <p className="text-lg font-medium">No data to visualize</p>
        <p className="text-sm">Import your first brokerage statement to see visuals.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full">
      <div className="bg-white p-6 rounded-2xl border shadow-sm flex flex-col">
        <h3 className="text-lg font-bold text-slate-900 mb-6">Sector Allocation</h3>
        <div className="flex-1 min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={allocationData}
                cx="50%"
                cy="42%"
                innerRadius={55}
                outerRadius={75}
                paddingAngle={5}
                dataKey="value"
              >
                {allocationData.map((_entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip content={<SectorTooltip />} />
              <Legend
                verticalAlign="bottom"
                align="center"
                iconType="circle"
                iconSize={7}
                wrapperStyle={{ fontSize: '12px', lineHeight: '20px', paddingTop: '8px' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl border shadow-sm flex flex-col">
        <h3 className="text-lg font-bold text-slate-900 mb-6">Brokerage Distribution</h3>
        <div className="flex-1 min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={brokerageData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
              <YAxis hide />
              <Tooltip
                cursor={{ fill: '#f8fafc' }}
                formatter={(value: number) => `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
              />
              <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                {brokerageData.map((_entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[(index + 3) % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default PortfolioVisuals;
