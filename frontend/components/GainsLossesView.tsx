import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';
import { Transaction, RealizedGain, UnrealizedLot } from '../types'; // Added UnrealizedLot
import { fetchRealizedGains, triggerRealizedGainsProcess, fetchUnrealizedGains } from '../services/apiService'; // Added fetchUnrealizedGains

interface Props {
  transactions: Transaction[];
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

const GainsLossesView: React.FC<Props> = ({ transactions }) => {
  const [activeSubTab, setActiveSubTab] = useState<'realized' | 'unrealized'>('realized');
  const [selectedTickers, setSelectedTickers] = useState<string[]>([]);
  const [selectedBrokerages, setSelectedBrokerages] = useState<string[]>([]);
  const [selectedYear, setSelectedYear] = useState<string>('Overall');
  
  // Tax Rate State
  const [stTaxRate, setStTaxRate] = useState<number>(30);
  const [ltTaxRate, setLtTaxRate] = useState<number>(15);
  
  const [isTickerMenuOpen, setIsTickerMenuOpen] = useState(false);
  const [isBrokerageMenuOpen, setIsBrokerageMenuOpen] = useState(false);
  
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

  const [realizedGainsData, setRealizedGainsData] = useState<RealizedGain[]>([]);
  const [unrealizedGainsData, setUnrealizedGainsData] = useState<UnrealizedLot[]>([]); // New state for unrealized data
  const [isLoading, setIsLoading] = useState(false); // Combined loading state

  const getRealizedGains = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchRealizedGains();
      setRealizedGainsData(data);
    } catch (error) {
      console.error("Error fetching realized gains:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getUnrealizedGains = useCallback(async () => { // New function to fetch unrealized gains
    setIsLoading(true);
    try {
      const data = await fetchUnrealizedGains();
      setUnrealizedGainsData(data);
    } catch (error) {
      console.error("Error fetching unrealized gains:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleRefreshGains = useCallback(async () => { // Modified refresh handler
    setIsLoading(true);
    try {
      await triggerRealizedGainsProcess(); // This processes both realized and unrealized on backend
      await getRealizedGains(); // Re-fetch realized after processing
      await getUnrealizedGains(); // Re-fetch unrealized after processing
    } catch (error) {
      console.error("Error refreshing gains:", error);
    } finally {
      setIsLoading(false);
    }
  }, [getRealizedGains, getUnrealizedGains]);

  useEffect(() => {
    getRealizedGains();
    getUnrealizedGains(); // Fetch unrealized gains on mount
  }, [getRealizedGains, getUnrealizedGains]);

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
    unrealizedGainsData.forEach(lot => { // Changed from unrealizedLots to unrealizedGainsData
      tickers[lot.ticker] = (tickers[lot.ticker] || 0) + lot.gain;
    });
    return Object.entries(tickers)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [unrealizedGainsData, activeSubTab]); // Changed dependency

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
    const source = activeSubTab === 'realized' ? realizedGainsData : unrealizedGainsData; // Changed source
    return source.filter(g => {
      const matchesTicker = selectedTickers.length === 0 || selectedTickers.includes(g.ticker);
      const matchesBrokerage = selectedBrokerages.length === 0 || selectedBrokerages.includes(g.brokerage);
      
      if (activeSubTab === 'realized') {
        const year = new Date((g as RealizedGain).sellDate).getFullYear().toString();
        const matchesYear = selectedYear === 'Overall' || year === selectedYear;
        return matchesTicker && matchesBrokerage && matchesYear;
      }
      return matchesTicker && matchesBrokerage;
    });
  }, [realizedGainsData, unrealizedGainsData, selectedTickers, selectedBrokerages, selectedYear, activeSubTab]); // Changed dependency

  const shortTerm = filteredData.filter(g => !g.isLongTerm);
  const longTerm = filteredData.filter(g => g.isLongTerm);

  const stats = useMemo(() => {
    const stTotal = shortTerm.reduce((sum, g) => sum + g.gain, 0);
    const ltTotal = longTerm.reduce((sum, g) => sum + g.gain, 0);
    return { stTotal, ltTotal };
  }, [shortTerm, longTerm]);

  const toggleTicker = (ticker: string) => {
    setSelectedTickers(prev => prev.includes(ticker) ? prev.filter(t => t !== ticker) : [...prev, ticker]);
  };

  const toggleBrokerage = (broker: string) => {
    setSelectedBrokerages(prev => prev.includes(broker) ? prev.filter(b => b !== broker) : [...prev, broker]);
  };

  const GainTableSection = ({ title, data }: { title: string, data: any[] }) => (
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
          <table className="w-full text-left min-w-[800px]">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-200">
                <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Symbol</th>
                <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Brokerage</th>
                <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Acquired</th>
                {activeSubTab === 'realized' && <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Sold</th>}
                <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Qty</th>
                <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Cost/Sh</th>
                <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">{activeSubTab === 'realized' ? 'Sold/Sh' : 'Mkt/Sh'}</th>
                <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Total Gain</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredData.map((g: RealizedGain | UnrealizedLot) => (
                <tr key={g.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center px-2 py-1 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-bold uppercase tracking-tight">
                      {g.ticker}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-[11px] font-bold text-slate-600">{g.brokerage}</span>
                  </td>
                  <td className="px-4 py-3 text-[11px] text-slate-500 font-medium">{g.buyDate}</td>
                  {activeSubTab === 'realized' && <td className="px-4 py-3 text-[11px] text-slate-500 font-medium">{(g as RealizedGain).sellDate}</td>}
                  <td className="px-4 py-3 text-right text-[11px] text-slate-900 font-bold">{g.quantity}</td>
                  <td className="px-4 py-3 text-right text-[11px] text-slate-500">${g.buyPrice.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right text-[11px] text-slate-500">${(activeSubTab === 'realized' ? (g as RealizedGain).sellPrice : (g as UnrealizedLot).currentPrice).toFixed(2)}</td>
                  <td className={`px-4 py-3 text-right text-[11px] font-black ${g.gain >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {g.gain >= 0 ? '+' : ''}${g.gain.toLocaleString(undefined, { minimumFractionDigits: 2 })}
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
                    formatter={(value: number) => `$${value.toLocaleString()}`}
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
            <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-6">Unrealized Gain Distribution</h3>
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
                      formatter={(value: number) => `$${value.toLocaleString()}`}
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
                  ${((stats.stTotal * (stTaxRate / 100)) + (stats.ltTotal * (ltTaxRate / 100))).toLocaleString(undefined, { minimumFractionDigits: 2 })}
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
                  {stats.stTotal + stats.ltTotal !== 0 ? ((stats.ltTotal / (stats.stTotal + stats.ltTotal)) * 100).toFixed(1) : '0'}%
                </div>
                <div className="text-[9px] text-slate-500 font-bold uppercase mt-1">Long Term Share</div>
              </div>
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Lot Count</div>
                <div className="text-lg font-black text-slate-900">{isLoading ? 'Loading...' : filteredData.length}</div>
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

          <button 
            onClick={handleRefreshGains}
            className="ml-4 px-3 py-1.5 bg-blue-500 text-white rounded-md text-xs font-bold hover:bg-blue-600 transition-colors"
          >
            Refresh Gains {isLoading && <span className="ml-2 inline-block h-3 w-3 animate-spin rounded-full border-2 border-solid border-white border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]" role="status"></span>}
          </button>

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
              <label className="absolute -top-2 left-2 bg-white px-1 text-[9px] font-black text-indigo-500 uppercase tracking-tighter z-10">Symbol</label>
              <button
                onClick={() => setIsTickerMenuOpen(!isTickerMenuOpen)}
                className="flex items-center justify-between pl-3 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer min-w-[140px] text-left"
              >
                <span className="truncate max-w-[100px]">
                  {selectedTickers.length === 0 ? 'All Symbols' : selectedTickers.length === 1 ? selectedTickers[0] : `${selectedTickers.length} Symbols`}
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
              ${(stats.stTotal + stats.ltTotal).toLocaleString(undefined, { minimumFractionDigits: 2 })}
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
              {stats.stTotal >= 0 ? '+' : ''}${stats.stTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
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
              {stats.ltTotal >= 0 ? '+' : ''}${stats.ltTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
          </div>
          <GainTableSection title="Long-Term" data={longTerm} />
        </div>
      </div>
    </div>
  );
};

export default GainsLossesView;
