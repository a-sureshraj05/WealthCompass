import React, { useState, useMemo, useRef, useEffect } from 'react';
import { StockHolding, UnrealizedLot, RealizedGain } from '../types';
import { fetchAnalystData } from '../services/apiService';

type SortKey = 'brokerage' | 'assetType' | 'ticker' | 'quantity' | 'averageCostPerShare' | 'totalCost' | 'currentPrice' | 'marketValue' | 'gain';
type SortDirection = 'asc' | 'desc' | null;

interface Props {
  holdings: StockHolding[];
  unrealizedGains: UnrealizedLot[];
  realizedGains: RealizedGain[];
  onRemove: (id: string) => void;
  selectedBrokerages: string[];
  setSelectedBrokerages: (v: string[]) => void;
  selectedAssetTypes: string[];
  setSelectedAssetTypes: (v: string[]) => void;
  selectedTickers: string[];
  setSelectedTickers: (v: string[]) => void;
}

const HoldingsView: React.FC<Props> = ({ holdings, unrealizedGains, realizedGains, onRemove, selectedBrokerages, setSelectedBrokerages, selectedAssetTypes, setSelectedAssetTypes, selectedTickers, setSelectedTickers }) => {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const [isBrokerageMenuOpen, setIsBrokerageMenuOpen] = useState(false);
  const [isAssetTypeMenuOpen, setIsAssetTypeMenuOpen] = useState(false);
  const [isTickerMenuOpen, setIsTickerMenuOpen] = useState(false);

  const brokerageMenuRef = useRef<HTMLDivElement>(null);
  const assetTypeMenuRef = useRef<HTMLDivElement>(null);
  const tickerMenuRef = useRef<HTMLDivElement>(null);

  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [analystMedian, setAnalystMedian] = useState<Record<string, number>>({});
  const [keepPct, setKeepPct] = useState(50);

  useEffect(() => {
    if (holdings.length === 0) return;
    const tickers = [...new Set(holdings.map(h => h.ticker))];
    fetchAnalystData(tickers)
      .then(data => {
        const map: Record<string, number> = {};
        data.forEach(d => { if (d.targetMedian) map[d.ticker] = d.targetMedian; });
        setAnalystMedian(map);
      })
      .catch(console.error);
  }, [holdings]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (brokerageMenuRef.current && !brokerageMenuRef.current.contains(event.target as Node)) setIsBrokerageMenuOpen(false);
      if (assetTypeMenuRef.current && !assetTypeMenuRef.current.contains(event.target as Node)) setIsAssetTypeMenuOpen(false);
      if (tickerMenuRef.current && !tickerMenuRef.current.contains(event.target as Node)) setIsTickerMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const formatAssetType = (type: string) => {
    if (!type) return '';
    return type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
  };

  // Sum realized gain stats by (brokerage, ticker)
  const realizedByHolding = useMemo(() => {
    const map: Record<string, { gain: number; buyCost: number }> = {};
    realizedGains.forEach(g => {
      const key = `${g.brokerage}::${g.ticker}`;
      if (!map[key]) map[key] = { gain: 0, buyCost: 0 };
      map[key].gain += g.gain;
      map[key].buyCost += g.quantity * g.buyPrice;
    });
    return map;
  }, [realizedGains]);

  // Group unrealized lots by (brokerage, ticker) for quick lookup
  const lotsByHolding = useMemo(() => {
    const map: Record<string, UnrealizedLot[]> = {};
    unrealizedGains.forEach(lot => {
      const key = `${lot.brokerage}::${lot.ticker}`;
      if (!map[key]) map[key] = [];
      map[key].push(lot);
    });
    // Sort each group by buyDate ascending
    Object.values(map).forEach(lots => lots.sort((a, b) => new Date(a.buyDate).getTime() - new Date(b.buyDate).getTime()));
    return map;
  }, [unrealizedGains]);

  const toggleExpand = (id: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const expandAll = () => setExpandedRows(new Set(filteredHoldings.map(h => h.id)));
  const collapseAll = () => setExpandedRows(new Set());

  const allBrokerages = useMemo(() => Array.from(new Set(holdings.map(h => h.brokerage))).sort(), [holdings]);
  const allAssetTypes = useMemo(() => Array.from(new Set(holdings.map(h => (h.assetType || '').toUpperCase()).filter(Boolean))).sort(), [holdings]);
  const allTickers = useMemo(() => Array.from(new Set(holdings.map(h => h.ticker))).sort(), [holdings]);

  const toggleBrokerage = (b: string) => setSelectedBrokerages(selectedBrokerages.includes(b) ? selectedBrokerages.filter(x => x !== b) : [...selectedBrokerages, b]);
  const toggleAssetType = (t: string) => setSelectedAssetTypes(selectedAssetTypes.includes(t) ? selectedAssetTypes.filter(x => x !== t) : [...selectedAssetTypes, t]);
  const toggleTicker = (t: string) => setSelectedTickers(selectedTickers.includes(t) ? selectedTickers.filter(x => x !== t) : [...selectedTickers, t]);

  const resetFilters = () => {
    setSelectedBrokerages([]);
    setSelectedAssetTypes([]);
    setSelectedTickers([]);
    setSortKey(null);
    setSortDirection(null);
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      if (sortDirection === 'asc') setSortDirection('desc');
      else if (sortDirection === 'desc') { setSortKey(null); setSortDirection(null); }
      else setSortDirection('asc');
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  const SortIndicator = ({ column }: { column: SortKey }) => {
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

  const filteredHoldings = useMemo(() => {
    let result = holdings.filter(h => {
      const matchesBrokerage = selectedBrokerages.length === 0 || selectedBrokerages.includes(h.brokerage);
      const matchesAssetType = selectedAssetTypes.length === 0 || selectedAssetTypes.includes((h.assetType || '').toUpperCase());
      const matchesTicker = selectedTickers.length === 0 || selectedTickers.includes(h.ticker);
      return matchesBrokerage && matchesAssetType && matchesTicker;
    });

    if (sortKey && sortDirection) {
      result = [...result].sort((a, b) => {
        let valA: any;
        let valB: any;
        switch (sortKey) {
          case 'brokerage': valA = a.brokerage.toLowerCase(); valB = b.brokerage.toLowerCase(); break;
          case 'assetType': valA = (a.assetType || '').toLowerCase(); valB = (b.assetType || '').toLowerCase(); break;
          case 'ticker': valA = a.ticker.toLowerCase(); valB = b.ticker.toLowerCase(); break;
          case 'quantity': valA = a.quantity; valB = b.quantity; break;
          case 'averageCostPerShare': valA = a.averageCostPerShare; valB = b.averageCostPerShare; break;
          case 'totalCost': valA = a.totalCost; valB = b.totalCost; break;
          case 'currentPrice': valA = a.currentPrice; valB = b.currentPrice; break;
          case 'marketValue': valA = a.marketValue; valB = b.marketValue; break;
          case 'gain': valA = a.marketValue - a.totalCost; valB = b.marketValue - b.totalCost; break;
          default: return 0;
        }
        if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
        if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      });
    } else {
      result = [...result].sort((a, b) => a.ticker.localeCompare(b.ticker));
    }

    return result;
  }, [holdings, selectedBrokerages, selectedAssetTypes, selectedTickers, sortKey, sortDirection]);

  if (holdings.length === 0) {
    return (
      <div className="py-20 text-center bg-white border border-slate-200 rounded-3xl shadow-sm">
        <div className="max-w-xs mx-auto space-y-4">
          <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto text-slate-300">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" />
            </svg>
          </div>
          <h4 className="text-slate-900 font-bold">No holdings found</h4>
          <p className="text-sm text-slate-400">Import your data and process gains to see holdings.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter Bar */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative z-30">
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center space-x-2">
            <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            <span className="text-sm font-bold text-slate-700">Refine List</span>
          </div>

          <div className="flex flex-wrap items-center gap-4 flex-1">
            {/* Brokerage Filter */}
            <div className="relative" ref={brokerageMenuRef}>
              <label className="absolute -top-2 left-2 bg-white px-1 text-[9px] font-black text-indigo-500 uppercase tracking-tighter z-10">Brokerage</label>
              <button
                onClick={() => setIsBrokerageMenuOpen(!isBrokerageMenuOpen)}
                className="flex items-center justify-between pl-3 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer min-w-[140px] text-left"
              >
                <span className="truncate max-w-[100px]">
                  {selectedBrokerages.length === 0 ? 'All Brokers' : selectedBrokerages.length === 1 ? selectedBrokerages[0] : `${selectedBrokerages.length} Brokers`}
                </span>
                <svg className={`w-4 h-4 text-slate-400 transition-transform ${isBrokerageMenuOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 9l-7 7-7-7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
              {isBrokerageMenuOpen && (
                <div className="absolute top-full left-0 mt-2 w-56 bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 z-50">
                  <div className="p-2 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <span className="text-[10px] font-black text-slate-400 uppercase px-2">Select Brokerages</span>
                    {selectedBrokerages.length > 0 && <button onClick={() => setSelectedBrokerages([])} className="text-[10px] font-bold text-indigo-600 px-2">Clear</button>}
                  </div>
                  <div className="max-h-60 overflow-y-auto p-2 space-y-1">
                    {allBrokerages.map(b => (
                      <label key={b} className="flex items-center px-3 py-2 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors">
                        <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" checked={selectedBrokerages.includes(b)} onChange={() => toggleBrokerage(b)} />
                        <span className="ml-3 text-sm font-bold text-slate-700">{b}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Asset Type Filter */}
            <div className="relative" ref={assetTypeMenuRef}>
              <label className="absolute -top-2 left-2 bg-white px-1 text-[9px] font-black text-indigo-500 uppercase tracking-tighter z-10">Asset Type</label>
              <button
                onClick={() => setIsAssetTypeMenuOpen(!isAssetTypeMenuOpen)}
                className="flex items-center justify-between pl-3 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer min-w-[130px] text-left"
              >
                <span className="truncate max-w-[90px]">
                  {selectedAssetTypes.length === 0 ? 'All Types' : selectedAssetTypes.length === 1 ? formatAssetType(selectedAssetTypes[0]) : `${selectedAssetTypes.length} Types`}
                </span>
                <svg className={`w-4 h-4 text-slate-400 transition-transform ${isAssetTypeMenuOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 9l-7 7-7-7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
              {isAssetTypeMenuOpen && (
                <div className="absolute top-full left-0 mt-2 w-48 bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 z-50">
                  <div className="p-2 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <span className="text-[10px] font-black text-slate-400 uppercase px-2">Asset Types</span>
                    {selectedAssetTypes.length > 0 && <button onClick={() => setSelectedAssetTypes([])} className="text-[10px] font-bold text-indigo-600 px-2">Clear</button>}
                  </div>
                  <div className="p-2 space-y-1">
                    {allAssetTypes.map(t => (
                      <label key={t} className="flex items-center px-3 py-2 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors">
                        <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" checked={selectedAssetTypes.includes(t)} onChange={() => toggleAssetType(t)} />
                        <span className="ml-3 text-sm font-bold text-slate-700">{formatAssetType(t)}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Ticker Filter */}
            <div className="relative" ref={tickerMenuRef}>
              <label className="absolute -top-2 left-2 bg-white px-1 text-[9px] font-black text-indigo-500 uppercase tracking-tighter z-10">Ticker</label>
              <button
                onClick={() => setIsTickerMenuOpen(!isTickerMenuOpen)}
                className="flex items-center justify-between pl-3 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer min-w-[140px] text-left"
              >
                <span className="truncate max-w-[100px]">
                  {selectedTickers.length === 0 ? 'All Tickers' : selectedTickers.length === 1 ? selectedTickers[0] : `${selectedTickers.length} Tickers`}
                </span>
                <svg className={`w-4 h-4 text-slate-400 transition-transform ${isTickerMenuOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 9l-7 7-7-7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
              {isTickerMenuOpen && (
                <div className="absolute top-full left-0 mt-2 w-56 bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 z-50">
                  <div className="p-2 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <span className="text-[10px] font-black text-slate-400 uppercase px-2">Select Tickers</span>
                    {selectedTickers.length > 0 && <button onClick={() => setSelectedTickers([])} className="text-[10px] font-bold text-indigo-600 px-2">Clear</button>}
                  </div>
                  <div className="max-h-60 overflow-y-auto p-2 space-y-1">
                    {allTickers.map(t => (
                      <label key={t} className="flex items-center px-3 py-2 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors">
                        <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" checked={selectedTickers.includes(t)} onChange={() => toggleTicker(t)} />
                        <span className="ml-3 text-sm font-bold text-slate-700">{t}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="w-px h-8 bg-slate-200 shrink-0" />

          <div className="relative shrink-0">
            <div className="absolute -top-2 left-2 bg-white px-1 z-10 flex items-center gap-1">
              <span className="text-[9px] font-black text-indigo-500 uppercase tracking-tighter">After-Tax Keep</span>
              <div className="relative group">
                <svg className="w-3 h-3 text-slate-400 cursor-help" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="absolute left-0 bottom-5 w-56 bg-slate-900 text-white text-[11px] font-normal normal-case tracking-normal rounded-xl px-3 py-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 leading-relaxed">
                  Applied to <span className="text-emerald-400 font-bold">profits only</span>. Losses are always counted at <span className="text-rose-400 font-bold">100%</span>.
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 pl-3 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl">
              <input
                type="range"
                min={0} max={100} step={5}
                value={keepPct}
                onChange={e => setKeepPct(Number(e.target.value))}
                className="w-28 accent-indigo-600 cursor-pointer"
              />
              <span className="text-sm font-bold text-indigo-600 w-8 text-right">{keepPct}%</span>
            </div>
          </div>

          <button onClick={resetFilters} className="text-xs font-bold text-slate-400 hover:text-indigo-600 transition-colors uppercase tracking-widest px-2 shrink-0">
            Reset
          </button>
        </div>
      </div>

      {/* Table */}
      {filteredHoldings.length === 0 ? (
        <div className="py-20 text-center bg-white border border-slate-200 rounded-3xl shadow-sm">
          <div className="max-w-xs mx-auto space-y-4">
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto text-slate-300">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <h4 className="text-slate-900 font-bold">No results found</h4>
            <p className="text-sm text-slate-400">No holdings match these criteria.</p>
            <button onClick={resetFilters} className="text-indigo-600 text-sm font-bold hover:underline">Clear all filters</button>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-200">
                <th className="px-4 py-4 w-8">
                  <button
                    onClick={() => expandedRows.size > 0 ? collapseAll() : expandAll()}
                    className="w-6 h-6 flex items-center justify-center rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all"
                    title={expandedRows.size > 0 ? 'Collapse all' : 'Expand all'}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      {expandedRows.size > 0
                        ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
                        : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                      }
                    </svg>
                  </button>
                </th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest cursor-pointer hover:text-indigo-600 transition-colors" onClick={() => handleSort('brokerage')}>
                  <div className="flex items-center">Brokerage <SortIndicator column="brokerage" /></div>
                </th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest cursor-pointer hover:text-indigo-600 transition-colors" onClick={() => handleSort('assetType')}>
                  <div className="flex items-center">Asset Type <SortIndicator column="assetType" /></div>
                </th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest cursor-pointer hover:text-indigo-600 transition-colors" onClick={() => handleSort('ticker')}>
                  <div className="flex items-center">Ticker <SortIndicator column="ticker" /></div>
                </th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest cursor-pointer hover:text-indigo-600 transition-colors text-right" onClick={() => handleSort('quantity')}>
                  <div className="flex items-center justify-end">Quantity <SortIndicator column="quantity" /></div>
                </th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest cursor-pointer hover:text-indigo-600 transition-colors text-right" onClick={() => handleSort('averageCostPerShare')}>
                  <div className="flex items-center justify-end">Avg Cost/Sh <SortIndicator column="averageCostPerShare" /></div>
                </th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest cursor-pointer hover:text-indigo-600 transition-colors text-right" onClick={() => handleSort('totalCost')}>
                  <div className="flex items-center justify-end">Total Cost <SortIndicator column="totalCost" /></div>
                </th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest cursor-pointer hover:text-indigo-600 transition-colors text-right" onClick={() => handleSort('currentPrice')}>
                  <div className="flex items-center justify-end">Current Price <SortIndicator column="currentPrice" /></div>
                </th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">
                  Median Analyst Target
                </th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest cursor-pointer hover:text-indigo-600 transition-colors text-right" onClick={() => handleSort('marketValue')}>
                  <div className="flex items-center justify-end">Market Value <SortIndicator column="marketValue" /></div>
                </th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest cursor-pointer hover:text-indigo-600 transition-colors text-right" onClick={() => handleSort('gain')}>
                  <div className="flex items-center justify-end">Unrealized Gain <SortIndicator column="gain" /></div>
                </th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">
                  Realized Gain
                </th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">
                  Total Gain
                </th>
                <th className="px-6 py-4"></th>
              </tr>
            </thead>
            <tbody>
              {filteredHoldings.map((h) => {
                const gain = h.marketValue - h.totalCost;
                const rowKey = `${h.brokerage}::${h.ticker}`;
                const lots = lotsByHolding[rowKey] || [];
                const isExpanded = expandedRows.has(h.id);

                return (
                  <React.Fragment key={h.id}>
                    {/* Summary Row */}
                    <tr className={`hover:bg-slate-50 transition-colors group border-t border-slate-100 ${isExpanded ? 'bg-slate-50/70' : ''}`}>
                      <td className="px-4 py-4">
                        {lots.length > 0 && (
                          <button
                            onClick={() => toggleExpand(h.id)}
                            className="w-6 h-6 flex items-center justify-center rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all"
                          >
                            <svg className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                            </svg>
                          </button>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-tight ${
                          h.brokerage.toLowerCase().includes('robinhood') ? 'bg-orange-100 text-orange-700' :
                          h.brokerage.toLowerCase().includes('schwab') ? 'bg-fuchsia-100 text-fuchsia-800' :
                          'bg-slate-100 text-slate-600'
                        }`}>
                          {h.brokerage}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-tight ${
                          (h.assetType || '').toLowerCase() === 'options' ? 'bg-purple-100 text-purple-700' :
                          (h.assetType || '').toLowerCase() === 'equity' ? 'bg-blue-100 text-blue-700' :
                          'bg-slate-100 text-slate-600'
                        }`}>
                          {formatAssetType(h.assetType || '—')}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2 py-1 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-bold uppercase tracking-tight">
                          {h.ticker}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-700 font-bold text-right">{h.quantity.toFixed(2)}</td>
                      <td className="px-6 py-4 text-sm text-slate-500 font-medium text-right">${h.averageCostPerShare.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className="px-6 py-4 text-right">
                        <div className="text-sm font-black text-slate-900">${h.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-500 font-medium text-right">${h.currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className="px-6 py-4 text-right">
                        {analystMedian[h.ticker] ? (() => {
                          const pct = ((analystMedian[h.ticker] - h.currentPrice) / h.currentPrice) * 100;
                          return (
                            <div>
                              <div className="text-sm font-bold text-indigo-600">${analystMedian[h.ticker].toFixed(2)}</div>
                              <div className={`text-xs font-bold ${pct >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                {pct >= 0 ? '+' : ''}{pct.toFixed(1)}%
                              </div>
                            </div>
                          );
                        })() : (
                          <div className="text-xs text-slate-300">—</div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="text-sm font-black text-slate-900">${h.marketValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className={`text-sm font-black ${gain >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          <span className="text-xs font-bold">{gain >= 0 ? '+' : '-'}</span>${Math.abs(gain).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        {h.averageCostPerShare > 0 && (
                          <div className={`text-xs font-bold ${gain >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                            {gain >= 0 ? '+' : '-'}{Math.abs((h.currentPrice - h.averageCostPerShare) / h.averageCostPerShare * 100).toFixed(1)}%
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {(() => {
                          const r = realizedByHolding[rowKey];
                          if (!r) return <div className="text-xs text-slate-300">—</div>;
                          const displayGain = r.gain > 0 ? r.gain * (keepPct / 100) : r.gain;
                          const pct = r.buyCost > 0 ? (displayGain / r.buyCost) * 100 : null;
                          return (
                            <div>
                              <div className={`text-sm font-black ${displayGain >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                <span className="text-xs font-bold">{displayGain >= 0 ? '+' : '-'}</span>${Math.abs(displayGain).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </div>
                              {pct !== null && (
                                <div className={`text-xs font-bold ${pct >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                  {pct >= 0 ? '+' : ''}{pct.toFixed(1)}%
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {(() => {
                          const r = realizedByHolding[rowKey];
                          const afterTaxRealized = r ? (r.gain > 0 ? r.gain * (keepPct / 100) : r.gain) : 0;
                          const total = gain + afterTaxRealized;
                          const totalCostBasis = h.totalCost + (r?.buyCost ?? 0);
                          const pct = totalCostBasis > 0 ? (total / totalCostBasis) * 100 : null;
                          return (
                            <div>
                              <div className={`text-sm font-black ${total >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                <span className="text-xs font-bold">{total >= 0 ? '+' : '-'}</span>${Math.abs(total).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </div>
                              {pct !== null && (
                                <div className={`text-xs font-bold ${pct >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                  {pct >= 0 ? '+' : ''}{pct.toFixed(1)}%
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => onRemove(h.id)}
                          className="p-1.5 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </td>
                    </tr>

                    {/* Expanded Lot Rows */}
                    {isExpanded && lots.map((lot, idx) => {
                      const lotGain = lot.quantity * (lot.currentPrice - lot.buyPrice);
                      return (
                        <tr key={`${h.id}-lot-${idx}`} className="bg-indigo-50/40 border-t border-indigo-100/60">
                          <td className="px-4 py-3">
                            <div className="flex justify-center">
                              <div className="w-px h-full min-h-[20px] bg-slate-200"></div>
                            </div>
                          </td>
                          <td className="px-6 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-1.5 pl-2">
                              <div className="w-3 h-px bg-slate-300"></div>
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest ${
                                lot.isLongTerm ? 'bg-indigo-100 text-indigo-700' : 'bg-amber-100 text-amber-700'
                              }`}>
                                {lot.isLongTerm ? 'Long Term' : 'Short Term'}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-3">
                            <span className="text-[11px] text-slate-400 font-medium">Bought</span>
                          </td>
                          <td className="px-6 py-3 whitespace-nowrap">
                            <span className="text-[11px] text-slate-500 font-bold">{new Date(lot.buyDate).toLocaleDateString('en-CA')}</span>
                          </td>
                          <td className="px-6 py-3 text-right text-[11px] text-slate-600 font-medium">{lot.quantity.toFixed(2)}</td>
                          <td className="px-6 py-3 text-right text-[11px] text-slate-500">${lot.buyPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td className="px-6 py-3 text-right text-[11px] text-slate-500">${(lot.quantity * lot.buyPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td className="px-6 py-3 text-right text-[11px] text-slate-500">${lot.currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td className="px-6 py-3"></td>
                          <td className="px-6 py-3 text-right text-[11px] text-slate-500">${(lot.quantity * lot.currentPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td className={`px-6 py-3 text-right text-[11px] font-black ${lotGain >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            <span className="font-medium">{lotGain >= 0 ? '+' : '-'}</span>${Math.abs(lotGain).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            {lot.buyPrice > 0 && (
                              <div className="text-[10px] font-bold">
                                {lotGain >= 0 ? '+' : '-'}{Math.abs((lot.currentPrice - lot.buyPrice) / lot.buyPrice * 100).toFixed(1)}%
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-3"></td>
                          <td className="px-6 py-3"></td>
                          <td className="px-6 py-3"></td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default HoldingsView;
