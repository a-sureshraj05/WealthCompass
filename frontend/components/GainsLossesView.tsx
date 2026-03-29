import React, { useState, useMemo, useRef, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';
import { RealizedGain, UnrealizedLot } from '../types';

type GainSortKey = 'ticker' | 'assetType' | 'brokerage' | 'buyDate' | 'sellDate' | 'quantity' | 'buyPrice' | 'price' | 'gain';
type SortDirection = 'asc' | 'desc' | null;

interface Props {
  realizedGains: RealizedGain[];
  unrealizedGains: UnrealizedLot[];
  selectedBrokerages: string[];
  setSelectedBrokerages: (v: string[]) => void;
  selectedTickers: string[];
  setSelectedTickers: (v: string[]) => void;
}

// Removed client-side UnrealizedLot interface definition, now imported from types.ts
// interface UnrealizedLot {
//   id: string;
//   ticker: string;
//   buyDate: string;
//   quantity: number;
//   buyPrice: number;
//   currentPrice: number;
//   gain: number;
//   isLongTerm: boolean;
//   brokerage: string;
// }

const COLORS = ['#6366f1', '#a855f7', '#ec4899', '#f97316', '#10b981', '#0ea5e9', '#64748b'];

const GainsLossesView: React.FC<Props> = ({ realizedGains: realizedGainsData, unrealizedGains: unrealizedGainsData, selectedBrokerages, setSelectedBrokerages, selectedTickers, setSelectedTickers }) => {
  const [activeSubTab, setActiveSubTab] = useState<'realized' | 'unrealized'>('realized');
  const [selectedYear, setSelectedYear] = useState<string>('Overall');
  
  // Tax Rate State
  const [stTaxRate, setStTaxRate] = useState<number>(30);
  const [ltTaxRate, setLtTaxRate] = useState<number>(15);
  
  const [isTickerMenuOpen, setIsTickerMenuOpen] = useState(false);
  const [isBrokerageMenuOpen, setIsBrokerageMenuOpen] = useState(false);

  // Sorting state
  const [sortKey, setSortKey] = useState<GainSortKey | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);

  const tickerMenuRef = useRef<HTMLDivElement>(null);
  const brokerageMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (tickerMenuRef.current && !tickerMenuRef.current.contains(event.target as Node)) {
        setIsTickerMenuOpen(false);
      }
      if (brokerageMenuRef.current && !brokerageMenuRef.current.contains(event.target as Node)) {
        setIsBrokerageMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);


  // Original client-side unrealizedLots calculation is removed.
  // const unrealizedLots = useMemo(() => { /* ... removed ... */ }, [transactions]);

  // YoY Chart Data for Realized
  const yoyData = useMemo(() => {
    if (activeSubTab !== 'realized') return []; // Only calculate for realized tab
    const years: Record<string, { year: string, shortTerm: number, longTerm: number }> = {};
    realizedGainsData.forEach(g => {
      const year = new Date(g.sellDate).getFullYear().toString();
      if (!years[year]) years[year] = { year, shortTerm: 0, longTerm: 0 };
      if (g.isLongTerm) years[year].longTerm += g.gain;
      else years[year].shortTerm += g.gain;
    });
    return Object.values(years).sort((a, b) => a.year.localeCompare(b.year));
  }, [realizedGainsData, activeSubTab]);

  // Pie Chart Data for Unrealized (uses new unrealizedGainsData)
  const unrealizedPieData = useMemo(() => {
    if (activeSubTab !== 'unrealized') return [];
    const tickers: Record<string, number> = {};
    unrealizedGainsData.forEach(lot => {
      tickers[lot.ticker] = (tickers[lot.ticker] || 0) + lot.quantity * lot.currentPrice;
    });
    return Object.entries(tickers)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [unrealizedGainsData, activeSubTab]);

  const uniqueTickers = useMemo(() => {
    const source = activeSubTab === 'realized' ? realizedGainsData : unrealizedGainsData; // Changed source
    const tickers = new Set(source.map(g => g.ticker));
    return Array.from(tickers).sort();
  }, [realizedGainsData, unrealizedGainsData, activeSubTab]); // Changed dependency

  const uniqueBrokerages = useMemo(() => {
    const source = activeSubTab === 'realized' ? realizedGainsData : unrealizedGainsData; // Changed source
    const brokers = new Set(source.map(g => g.brokerage));
    return Array.from(brokers).sort();
  }, [realizedGainsData, unrealizedGainsData, activeSubTab]); // Changed dependency

  const availableYears = useMemo(() => {
    const source = activeSubTab === 'realized' ? realizedGainsData : []; // Only consider realized for years
    const years = new Set(source.map(g => new Date(g.sellDate).getFullYear().toString()));
    return ['Overall', ...Array.from(years)].sort((a: string, b: string) => b.localeCompare(a));
  }, [realizedGainsData, activeSubTab]);

  const filteredData = useMemo(() => {
    const source = activeSubTab === 'realized' ? realizedGainsData : unrealizedGainsData;
    let result = source.filter(g => {
      const matchesTicker = selectedTickers.length === 0 || selectedTickers.includes(g.ticker);
      const matchesBrokerage = selectedBrokerages.length === 0 || selectedBrokerages.includes(g.brokerage);
      if (activeSubTab === 'realized') {
        const year = new Date((g as RealizedGain).sellDate).getFullYear().toString();
        const matchesYear = selectedYear === 'Overall' || year === selectedYear;
        return matchesTicker && matchesBrokerage && matchesYear;
      }
      return matchesTicker && matchesBrokerage;
    });

    if (sortKey && sortDirection) {
      result = [...result].sort((a, b) => {
        let valA: any;
        let valB: any;
        switch (sortKey) {
          case 'ticker': valA = a.ticker.toLowerCase(); valB = b.ticker.toLowerCase(); break;
          case 'assetType': valA = (a.assetType || '').toLowerCase(); valB = (b.assetType || '').toLowerCase(); break;
          case 'brokerage': valA = a.brokerage.toLowerCase(); valB = b.brokerage.toLowerCase(); break;
          case 'buyDate': valA = new Date(a.buyDate).getTime(); valB = new Date(b.buyDate).getTime(); break;
          case 'sellDate':
            valA = activeSubTab === 'realized' ? new Date((a as RealizedGain).sellDate).getTime() : 0;
            valB = activeSubTab === 'realized' ? new Date((b as RealizedGain).sellDate).getTime() : 0;
            break;
          case 'quantity': valA = a.quantity; valB = b.quantity; break;
          case 'buyPrice': valA = a.buyPrice; valB = b.buyPrice; break;
          case 'price':
            valA = activeSubTab === 'realized' ? (a as RealizedGain).sellPrice : (a as UnrealizedLot).currentPrice;
            valB = activeSubTab === 'realized' ? (b as RealizedGain).sellPrice : (b as UnrealizedLot).currentPrice;
            break;
          case 'gain': valA = a.gain; valB = b.gain; break;
          default: return 0;
        }
        if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
        if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      });
    } else {
      result = [...result].sort((a, b) => new Date(b.buyDate).getTime() - new Date(a.buyDate).getTime());
    }

    return result;
  }, [realizedGainsData, unrealizedGainsData, selectedTickers, selectedBrokerages, selectedYear, activeSubTab, sortKey, sortDirection]);

  const shortTerm = filteredData.filter(g => !g.isLongTerm);
  const longTerm = filteredData.filter(g => g.isLongTerm);

  const stats = useMemo(() => {
    const stTotal = shortTerm.reduce((sum, g) => sum + g.gain, 0);
    const ltTotal = longTerm.reduce((sum, g) => sum + g.gain, 0);
    return { stTotal, ltTotal };
  }, [shortTerm, longTerm]);

  const toggleTicker = (ticker: string) => {
    setSelectedTickers(selectedTickers.includes(ticker) ? selectedTickers.filter(t => t !== ticker) : [...selectedTickers, ticker]);
  };

  const toggleBrokerage = (broker: string) => {
    setSelectedBrokerages(selectedBrokerages.includes(broker) ? selectedBrokerages.filter(b => b !== broker) : [...selectedBrokerages, broker]);
  };

  const handleSort = (key: GainSortKey) => {
    if (sortKey === key) {
      if (sortDirection === 'asc') setSortDirection('desc');
      else if (sortDirection === 'desc') { setSortKey(null); setSortDirection(null); }
      else setSortDirection('asc');
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  const SortIndicator = ({ column }: { column: GainSortKey }) => {
    if (sortKey !== column) return <svg className="w-3 h-3 ml-1 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" /></svg>;
    return (
      <span className="ml-1 text-indigo-600">
        {sortDirection === 'asc' ? (
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 15l7-7 7 7" /></svg>
        ) : (
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" /></svg>
        )}
      </span>
    );
  };

  const GainTableSection = ({ title, data }: { title: string, data: (RealizedGain | UnrealizedLot)[] }) => (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest">{title}</h3>
        <span className="text-xs font-bold text-slate-500">{data.length} lots</span>
      </div>
      {data.length === 0 ? (
        <div className="py-8 text-center bg-slate-50 border border-dashed border-slate-200 rounded-2xl text-slate-400 text-xs">
          No entries in this category for the current filter.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
          <table className="w-full text-left min-w-[900px]">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-200">
                <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest cursor-pointer hover:text-indigo-600 transition-colors" onClick={() => handleSort('ticker')}>
                  <div className="flex items-center">Ticker <SortIndicator column="ticker" /></div>
                </th>
                <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest cursor-pointer hover:text-indigo-600 transition-colors" onClick={() => handleSort('assetType')}>
                  <div className="flex items-center">Asset Type <SortIndicator column="assetType" /></div>
                </th>
                <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest cursor-pointer hover:text-indigo-600 transition-colors" onClick={() => handleSort('brokerage')}>
                  <div className="flex items-center">Brokerage <SortIndicator column="brokerage" /></div>
                </th>
                <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest cursor-pointer hover:text-indigo-600 transition-colors" onClick={() => handleSort('buyDate')}>
                  <div className="flex items-center">Bought <SortIndicator column="buyDate" /></div>
                </th>
                {activeSubTab === 'realized' && (
                  <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest cursor-pointer hover:text-indigo-600 transition-colors" onClick={() => handleSort('sellDate')}>
                    <div className="flex items-center">Sold <SortIndicator column="sellDate" /></div>
                  </th>
                )}
                <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest cursor-pointer hover:text-indigo-600 transition-colors text-right" onClick={() => handleSort('quantity')}>
                  <div className="flex items-center justify-end">Qty <SortIndicator column="quantity" /></div>
                </th>
                <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest cursor-pointer hover:text-indigo-600 transition-colors text-right" onClick={() => handleSort('buyPrice')}>
                  <div className="flex items-center justify-end">Cost/Sh <SortIndicator column="buyPrice" /></div>
                </th>
                <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest cursor-pointer hover:text-indigo-600 transition-colors text-right" onClick={() => handleSort('price')}>
                  <div className="flex items-center justify-end">{activeSubTab === 'realized' ? 'Sold/Sh' : 'Mkt/Sh'} <SortIndicator column="price" /></div>
                </th>
                <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest cursor-pointer hover:text-indigo-600 transition-colors text-right" onClick={() => handleSort('gain')}>
                  <div className="flex items-center justify-end">Total Gain <SortIndicator column="gain" /></div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((g: RealizedGain | UnrealizedLot) => (
                <tr key={g.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center px-2 py-1 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-bold uppercase tracking-tight">
                      {g.ticker}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-tight ${
                      (g.assetType || '').toLowerCase() === 'options' ? 'bg-purple-100 text-purple-700' :
                      (g.assetType || '').toLowerCase() === 'equity' ? 'bg-blue-100 text-blue-700' :
                      'bg-slate-100 text-slate-600'
                    }`}>{g.assetType || '—'}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-tight ${
                      g.brokerage.toLowerCase().includes('robinhood') ? 'bg-orange-100 text-orange-700' :
                      g.brokerage.toLowerCase().includes('schwab') ? 'bg-fuchsia-100 text-fuchsia-800' :
                      'bg-slate-100 text-slate-600'
                    }`}>{g.brokerage}</span>
                  </td>
                  <td className="px-4 py-3 text-[11px] text-slate-500 font-medium">{new Date(g.buyDate).toLocaleDateString('en-CA')}</td>
                  {activeSubTab === 'realized' && <td className="px-4 py-3 text-[11px] text-slate-500 font-medium">{new Date((g as RealizedGain).sellDate).toLocaleDateString('en-CA')}</td>}
                  <td className="px-4 py-3 text-right text-[11px] text-slate-900 font-bold">{g.quantity.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right text-[11px] text-slate-500">${g.buyPrice.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right text-[11px] text-slate-500">${(activeSubTab === 'realized' ? (g as RealizedGain).sellPrice : (g as UnrealizedLot).currentPrice).toFixed(2)}</td>
                  <td className={`px-4 py-3 text-right text-[11px] font-black ${g.gain >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    <span className="font-medium">{g.gain >= 0 ? '+' : '-'}</span>${Math.abs(g.gain).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Sub-Tabs Selector */}
      <div className="flex items-center p-1 bg-slate-100 rounded-2xl w-fit">
        <button
          onClick={() => setActiveSubTab('realized')}
          className={`px-6 py-2 rounded-xl text-sm font-bold transition-all ${
            activeSubTab === 'realized' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Realized
        </button>
        <button
          onClick={() => setActiveSubTab('unrealized')}
          className={`px-6 py-2 rounded-xl text-sm font-bold transition-all ${
            activeSubTab === 'unrealized' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Unrealized
        </button>
      </div>

      {/* Analytics Charts Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {activeSubTab === 'realized' ? (
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
            <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-6">Yearly Realized Profit Split</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={yoyData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="year" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={(val) => `$${val}`} />
                  <Tooltip 
                    cursor={{ fill: '#f8fafc' }}
                    formatter={(value: number) => `${value < 0 ? '-' : ''}$${Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 'bold', paddingTop: '10px' }} />
                  <Bar dataKey="shortTerm" name="Short Term" fill="#10b981" stackId="a" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="longTerm" name="Long Term" fill="#6366f1" stackId="a" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : (
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
            <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-6">Holdings Distribution by Market Value</h3>
            <div className="h-64">
              {unrealizedPieData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={unrealizedPieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {unrealizedPieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value: number) => `${value < 0 ? '-' : ''}$${Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    />
                    <Legend verticalAlign="bottom" align="center" iconType="circle" wrapperStyle={{ fontSize: '10px' }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-400 text-xs font-medium italic">
                  No data to visualize
                </div>
              )}
            </div>
          </div>
        )}

        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-center">
          <div className="space-y-6">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Estimated Tax Liability</div>
                <div className="text-3xl font-black text-slate-900">
                  ${((stats.stTotal * (stTaxRate / 100)) + (stats.ltTotal * (ltTaxRate / 100))).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
              <div className="flex gap-2">
                <div className="relative">
                  <label className="block text-[8px] font-black text-emerald-600 uppercase mb-1">ST Rate %</label>
                  <input 
                    type="number" 
                    value={stTaxRate} 
                    onChange={(e) => setStTaxRate(Number(e.target.value))}
                    className="w-16 px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
                <div className="relative">
                  <label className="block text-[8px] font-black text-indigo-600 uppercase mb-1">LT Rate %</label>
                  <input 
                    type="number" 
                    value={ltTaxRate} 
                    onChange={(e) => setLtTaxRate(Number(e.target.value))}
                    className="w-16 px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
              </div>
            </div>
            
            <div className="text-[10px] text-slate-500 italic">
              Calculation: (ST Gain × {stTaxRate}%) + (LT Gain × {ltTaxRate}%)
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Efficiency</div>
                <div className="text-lg font-black text-indigo-600">
                  {stats.stTotal + stats.ltTotal !== 0 ? ((stats.ltTotal / (stats.stTotal + stats.ltTotal)) * 100).toFixed(2) : '0.00'}%
                </div>
                <div className="text-[9px] text-slate-500 font-bold uppercase mt-1">Long Term Share</div>
              </div>
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Lot Count</div>
                <div className="text-lg font-black text-slate-900">{filteredData.length}</div>
                <div className="text-[9px] text-slate-500 font-bold uppercase mt-1">Processed Trades</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Filter Card */}
        <div className="lg:col-span-3 bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-wrap items-center gap-6 z-30">
          <div className="flex items-center space-x-2">
            <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            <span className="text-sm font-bold text-slate-700 whitespace-nowrap">Filter {activeSubTab === 'realized' ? 'Tax Data' : 'Holdings'}</span>
          </div>

<div className="flex flex-wrap items-center gap-4 flex-1">
            {activeSubTab === 'realized' && (
              <div className="relative group">
                <label className="absolute -top-2 left-2 bg-white px-1 text-[9px] font-black text-indigo-500 uppercase tracking-tighter">Tax Year</label>
                <select 
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  className="appearance-none pl-3 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer min-w-[120px]"
                >
                  {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-slate-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 9l-7 7-7-7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
              </div>
            )}

            <div className="relative" ref={brokerageMenuRef}>
              <label className="absolute -top-2 left-2 bg-white px-1 text-[9px] font-black text-indigo-500 uppercase tracking-tighter z-10">Brokerage</label>
              <button
                onClick={() => setIsBrokerageMenuOpen(!isBrokerageMenuOpen)}
                className="flex items-center justify-between pl-3 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer min-w-[140px] text-left"
              >
                <span className="truncate max-w-[100px]">
                  {selectedBrokerages.length === 0 ? 'All Brokers' : selectedBrokerages.length === 1 ? selectedBrokerages[0] : `${selectedBrokerages.length} Brokers`}
                </span>
                <svg className={`w-4 h-4 text-slate-400 transition-transform ${isBrokerageMenuOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M19 9l-7 7-7-7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              {isBrokerageMenuOpen && (
                <div className="absolute top-full left-0 mt-2 w-56 bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="p-2 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <span className="text-[10px] font-black text-slate-400 uppercase px-2">Brokerages</span>
                    {selectedBrokerages.length > 0 && <button onClick={() => setSelectedBrokerages([])} className="text-[10px] font-bold text-indigo-600 px-2">Clear</button>}
                  </div>
                  <div className="max-h-60 overflow-y-auto p-2 space-y-1">
                    {uniqueBrokerages.map(broker => (
                      <label key={broker} className="flex items-center px-3 py-2 rounded-lg hover:bg-slate-50 cursor-pointer">
                        <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" checked={selectedBrokerages.includes(broker)} onChange={() => toggleBrokerage(broker)} />
                        <span className="ml-3 text-sm font-bold text-slate-700">{broker}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="relative" ref={tickerMenuRef}>
              <label className="absolute -top-2 left-2 bg-white px-1 text-[9px] font-black text-indigo-500 uppercase tracking-tighter z-10">Ticker</label>
              <button
                onClick={() => setIsTickerMenuOpen(!isTickerMenuOpen)}
                className="flex items-center justify-between pl-3 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer min-w-[140px] text-left"
              >
                <span className="truncate max-w-[100px]">
                  {selectedTickers.length === 0 ? 'All Tickers' : selectedTickers.length === 1 ? selectedTickers[0] : `${selectedTickers.length} Tickers`}
                </span>
                <svg className={`w-4 h-4 text-slate-400 transition-transform ${isTickerMenuOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M19 9l-7 7-7-7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              {isTickerMenuOpen && (
                <div className="absolute top-full left-0 mt-2 w-56 bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="p-2 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <span className="text-[10px] font-black text-slate-400 uppercase px-2">Assets</span>
                    {selectedTickers.length > 0 && <button onClick={() => setSelectedTickers([])} className="text-[10px] font-bold text-indigo-600 px-2">Clear</button>}
                  </div>
                  <div className="max-h-60 overflow-y-auto p-2 space-y-1">
                    {uniqueTickers.map(ticker => (
                      <label key={ticker} className="flex items-center px-3 py-2 rounded-lg hover:bg-slate-50 cursor-pointer">
                        <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" checked={selectedTickers.includes(ticker)} onChange={() => toggleTicker(ticker)} />
                        <span className="ml-3 text-sm font-bold text-slate-700">{ticker}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Total Summary Card */}
        <div className="bg-indigo-600 p-5 rounded-3xl shadow-lg shadow-indigo-600/20 text-white flex items-center justify-between">
          <div>
            <div className="text-[10px] font-black text-indigo-200 uppercase tracking-widest mb-1">
              Total {activeSubTab === 'realized' ? 'Realized' : 'Unrealized'} Gain
            </div>
            <div className="text-2xl font-black">
              {(stats.stTotal + stats.ltTotal) < 0 ? '-' : ''}${Math.abs(stats.stTotal + stats.ltTotal).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          <div className="w-10 h-10 bg-indigo-500 rounded-xl flex items-center justify-center">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8">
        {/* Short Term Section */}
        <div className="space-y-4">
          <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 flex items-center justify-between">
            <div>
              <h4 className="text-[11px] font-black text-emerald-700 uppercase tracking-widest">Short-Term Summary</h4>
              <p className="text-[10px] text-emerald-600 font-medium">{activeSubTab === 'realized' ? 'Closed positions' : 'Open lots'} held ≤ 1 year</p>
            </div>
            <div className={`text-xl font-black ${stats.stTotal >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
              <span className="font-medium">{stats.stTotal >= 0 ? '+' : '-'}</span>${Math.abs(stats.stTotal).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          <GainTableSection title="Short-Term" data={shortTerm} />
        </div>

        {/* Long Term Section */}
        <div className="space-y-4">
          <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100 flex items-center justify-between">
            <div>
              <h4 className="text-[11px] font-black text-indigo-700 uppercase tracking-widest">Long-Term Summary</h4>
              <p className="text-[10px] text-indigo-600 font-medium">{activeSubTab === 'realized' ? 'Closed positions' : 'Open lots'} held {'>'} 1 year</p>
            </div>
            <div className={`text-xl font-black ${stats.ltTotal >= 0 ? 'text-indigo-700' : 'text-rose-700'}`}>
              <span className="font-medium">{stats.ltTotal >= 0 ? '+' : '-'}</span>${Math.abs(stats.ltTotal).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          <GainTableSection title="Long-Term" data={longTerm} />
        </div>
      </div>
    </div>
  );
};

export default GainsLossesView;
