import React, { useState, useMemo, useRef, useEffect } from 'react';
import { StockHolding, UnrealizedLot, RealizedGain } from '../types';
import { fetchAnalystData } from '../services/apiService';
import TickerLogo from './TickerLogo';

type SortKey = 'ticker' | 'quantity' | 'totalCost' | 'currentPrice' | 'marketValue' | 'gain';
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

const HoldingsView: React.FC<Props> = ({
  holdings, unrealizedGains, realizedGains, onRemove,
  selectedBrokerages, setSelectedBrokerages,
  selectedAssetTypes, setSelectedAssetTypes,
  selectedTickers, setSelectedTickers,
}) => {
  const [expandedTickers, setExpandedTickers] = useState<Set<string>>(new Set());
  const [expandedBrokerages, setExpandedBrokerages] = useState<Set<string>>(new Set());
  const [lotSortKey, setLotSortKey] = useState<'buyDate' | 'quantity' | 'buyPrice' | 'totalCost' | 'currentPrice' | 'marketValue' | 'gain'>('buyDate');
  const [lotSortDir, setLotSortDir] = useState<'asc' | 'desc'>('asc');
  const [isBrokerageMenuOpen, setIsBrokerageMenuOpen] = useState(false);
  const [isTickerMenuOpen, setIsTickerMenuOpen] = useState(false);
  const brokerageMenuRef = useRef<HTMLDivElement>(null);
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
    const handleClickOutside = (e: MouseEvent) => {
      if (brokerageMenuRef.current && !brokerageMenuRef.current.contains(e.target as Node)) setIsBrokerageMenuOpen(false);
      if (tickerMenuRef.current && !tickerMenuRef.current.contains(e.target as Node)) setIsTickerMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Realized gains summed by ticker
  const realizedByTicker = useMemo(() => {
    const map: Record<string, { gain: number; buyCost: number }> = {};
    realizedGains.forEach(g => {
      if (!map[g.ticker]) map[g.ticker] = { gain: 0, buyCost: 0 };
      map[g.ticker].gain += g.gain;
      map[g.ticker].buyCost += g.quantity * g.buyPrice;
    });
    return map;
  }, [realizedGains]);

  // Lots grouped by ticker
  const lotsByTicker = useMemo(() => {
    const map: Record<string, UnrealizedLot[]> = {};
    unrealizedGains.forEach(lot => {
      if (!map[lot.ticker]) map[lot.ticker] = [];
      map[lot.ticker].push(lot);
    });
    return map;
  }, [unrealizedGains]);

  const toggleTicker = (ticker: string) =>
    setExpandedTickers(prev => {
      const next = new Set(prev);
      next.has(ticker) ? next.delete(ticker) : next.add(ticker);
      return next;
    });

  const toggleBrokerageRow = (key: string) =>
    setExpandedBrokerages(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const allBrokerages = useMemo(() => Array.from(new Set(holdings.map(h => h.brokerage))).sort(), [holdings]);
  const allTickers = useMemo(() => Array.from(new Set(holdings.map(h => h.ticker))).sort(), [holdings]);

  const toggleBrokerage = (b: string) => setSelectedBrokerages(selectedBrokerages.includes(b) ? selectedBrokerages.filter(x => x !== b) : [...selectedBrokerages, b]);
  const toggleTickerFilter = (t: string) => setSelectedTickers(selectedTickers.includes(t) ? selectedTickers.filter(x => x !== t) : [...selectedTickers, t]);

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

  const handleLotSort = (key: typeof lotSortKey) => {
    if (lotSortKey === key) setLotSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setLotSortKey(key); setLotSortDir('asc'); }
  };

  const LotSortIndicator = ({ col }: { col: typeof lotSortKey }) => (
    <svg className={`w-2.5 h-2.5 ml-0.5 ${lotSortKey === col ? 'text-[#0F52BA]' : 'opacity-20'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      {lotSortKey !== col || lotSortDir === 'asc'
        ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 15l7-7 7 7" />
        : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" />
      }
    </svg>
  );

  const SortIndicator = ({ column }: { column: SortKey }) => {
    if (sortKey !== column) return <svg className="w-3 h-3 ml-1 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" /></svg>;
    return (
      <span className="ml-1 text-[#0F52BA]">
        {sortDirection === 'asc'
          ? <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 15l7-7 7 7" /></svg>
          : <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" /></svg>
        }
      </span>
    );
  };

  // Aggregate holdings by ticker
  const tickerRows = useMemo(() => {
    const filtered = holdings.filter(h => {
      const matchesBrokerage = selectedBrokerages.length === 0 || selectedBrokerages.includes(h.brokerage);
      const matchesTicker = selectedTickers.length === 0 || selectedTickers.includes(h.ticker);
      return matchesBrokerage && matchesTicker;
    });

    const grouped: Record<string, StockHolding[]> = {};
    filtered.forEach(h => {
      if (!grouped[h.ticker]) grouped[h.ticker] = [];
      grouped[h.ticker].push(h);
    });

    let rows = Object.entries(grouped).map(([ticker, tickerHoldings]) => {
      const totalQty = tickerHoldings.reduce((s, h) => s + h.quantity, 0);
      const totalCost = tickerHoldings.reduce((s, h) => s + h.totalCost, 0);
      const marketValue = tickerHoldings.reduce((s, h) => s + h.marketValue, 0);
      const currentPrice = tickerHoldings[0].currentPrice;
      const assetType = tickerHoldings[0].assetType || 'Equity';
      const avgCost = totalQty > 0 ? totalCost / totalQty : 0;
      const unrealizedGain = marketValue - totalCost;
      const r = realizedByTicker[ticker];
      const afterTaxRealized = r ? (r.gain > 0 ? r.gain * (keepPct / 100) : r.gain) : 0;
      const totalGain = unrealizedGain + afterTaxRealized;

      // Build brokerage sub-groups — Level 2 summary from holdings (same source as Level 1),
      // Level 3 lots from unrealizedGains for drill-down detail
      const holdingsByBrokerage: Record<string, StockHolding[]> = {};
      tickerHoldings.forEach(h => {
        if (!holdingsByBrokerage[h.brokerage]) holdingsByBrokerage[h.brokerage] = [];
        holdingsByBrokerage[h.brokerage].push(h);
      });
      const allLots = (lotsByTicker[ticker] || []).filter(l =>
        selectedBrokerages.length === 0 || selectedBrokerages.includes(l.brokerage)
      );
      const lotsByBrokerage: Record<string, UnrealizedLot[]> = {};
      allLots.forEach(l => {
        if (!lotsByBrokerage[l.brokerage]) lotsByBrokerage[l.brokerage] = [];
        lotsByBrokerage[l.brokerage].push(l);
      });
      const brokerageGroups = Object.keys(holdingsByBrokerage)
        .sort((a, b) => a.localeCompare(b))
        .map(brokerage => {
          const bHoldings = holdingsByBrokerage[brokerage];
          const bQty = bHoldings.reduce((s, h) => s + h.quantity, 0);
          const bCost = bHoldings.reduce((s, h) => s + h.totalCost, 0);
          const bMarket = bHoldings.reduce((s, h) => s + h.marketValue, 0);
          const lots = (lotsByBrokerage[brokerage] || []).sort((a, b) => {
            let diff = 0;
            switch (lotSortKey) {
              case 'buyDate':      diff = new Date(a.buyDate).getTime() - new Date(b.buyDate).getTime(); break;
              case 'quantity':     diff = a.quantity - b.quantity; break;
              case 'buyPrice':     diff = a.buyPrice - b.buyPrice; break;
              case 'totalCost':    diff = (a.quantity * a.buyPrice) - (b.quantity * b.buyPrice); break;
              case 'currentPrice': diff = a.currentPrice - b.currentPrice; break;
              case 'marketValue':  diff = (a.quantity * a.currentPrice) - (b.quantity * b.currentPrice); break;
              case 'gain':         diff = a.gain - b.gain; break;
            }
            return lotSortDir === 'asc' ? diff : -diff;
          });
          return { brokerage, totalQty: bQty, avgCost: bQty > 0 ? bCost / bQty : 0, totalCost: bCost, currentPrice, marketValue: bMarket, unrealizedGain: bMarket - bCost, lots, assetType };
        });

      return { ticker, totalQty, totalCost, avgCost, currentPrice, assetType, marketValue, unrealizedGain, afterTaxRealized, totalGain, brokerageGroups, ids: tickerHoldings.map(h => h.id) };
    });

    if (sortKey && sortDirection) {
      rows = [...rows].sort((a, b) => {
        let valA: any, valB: any;
        switch (sortKey) {
          case 'ticker':       valA = a.ticker.toLowerCase(); valB = b.ticker.toLowerCase(); break;
          case 'quantity':     valA = a.totalQty; valB = b.totalQty; break;
          case 'totalCost':    valA = a.totalCost; valB = b.totalCost; break;
          case 'currentPrice': valA = a.currentPrice; valB = b.currentPrice; break;
          case 'marketValue':  valA = a.marketValue; valB = b.marketValue; break;
          case 'gain':         valA = a.unrealizedGain; valB = b.unrealizedGain; break;
          default: return 0;
        }
        if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
        if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      });
    } else {
      rows = [...rows].sort((a, b) => a.ticker.localeCompare(b.ticker));
    }

    return rows;
  }, [holdings, unrealizedGains, realizedByTicker, lotsByTicker, selectedBrokerages, selectedTickers, sortKey, sortDirection, keepPct, lotSortKey, lotSortDir]);

  if (holdings.length === 0) {
    return (
      <div className="py-20 text-center bg-white border border-[#D2D2D7] rounded">
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
      <div className="bg-white p-5 rounded border border-[#D2D2D7] relative z-30">
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
              <label className="absolute -top-2 left-2 bg-white px-1 text-[9px] font-black text-[#0F52BA] uppercase tracking-tighter z-10">Brokerage</label>
              <button
                onClick={() => setIsBrokerageMenuOpen(!isBrokerageMenuOpen)}
                className="flex items-center justify-between pl-3 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-md text-sm font-medium text-slate-700 focus:ring-2 focus:ring-[#0F52BA] outline-none cursor-pointer min-w-[140px] text-left"
              >
                <span className="truncate max-w-[100px]">
                  {selectedBrokerages.length === 0 ? 'All Brokers' : selectedBrokerages.length === 1 ? selectedBrokerages[0] : `${selectedBrokerages.length} Brokers`}
                </span>
                <svg className={`w-4 h-4 text-slate-400 transition-transform ${isBrokerageMenuOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 9l-7 7-7-7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
              {isBrokerageMenuOpen && (
                <div className="absolute top-full left-0 mt-2 w-56 bg-white border border-slate-200 rounded shadow-xl overflow-hidden z-50">
                  <div className="p-2 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <span className="text-[10px] font-black text-slate-400 uppercase px-2">Select Brokerages</span>
                    {selectedBrokerages.length > 0 && <button onClick={() => setSelectedBrokerages([])} className="text-[10px] font-bold text-[#0F52BA] px-2">Clear</button>}
                  </div>
                  <div className="max-h-60 overflow-y-auto p-2 space-y-1">
                    {allBrokerages.map(b => (
                      <label key={b} className="flex items-center px-3 py-2 rounded hover:bg-slate-50 cursor-pointer transition-colors">
                        <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-[#0F52BA] focus:ring-[#0F52BA]" checked={selectedBrokerages.includes(b)} onChange={() => toggleBrokerage(b)} />
                        <span className="ml-3 text-sm font-bold text-slate-700">{b}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Ticker Filter */}
            <div className="relative" ref={tickerMenuRef}>
              <label className="absolute -top-2 left-2 bg-white px-1 text-[9px] font-black text-[#0F52BA] uppercase tracking-tighter z-10">Ticker</label>
              <button
                onClick={() => setIsTickerMenuOpen(!isTickerMenuOpen)}
                className="flex items-center justify-between pl-3 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-md text-sm font-medium text-slate-700 focus:ring-2 focus:ring-[#0F52BA] outline-none cursor-pointer min-w-[140px] text-left"
              >
                <span className="truncate max-w-[100px]">
                  {selectedTickers.length === 0 ? 'All Tickers' : selectedTickers.length === 1 ? selectedTickers[0] : `${selectedTickers.length} Tickers`}
                </span>
                <svg className={`w-4 h-4 text-slate-400 transition-transform ${isTickerMenuOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 9l-7 7-7-7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
              {isTickerMenuOpen && (
                <div className="absolute top-full left-0 mt-2 w-56 bg-white border border-slate-200 rounded shadow-xl overflow-hidden z-50">
                  <div className="p-2 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <span className="text-[10px] font-black text-slate-400 uppercase px-2">Select Tickers</span>
                    {selectedTickers.length > 0 && <button onClick={() => setSelectedTickers([])} className="text-[10px] font-bold text-[#0F52BA] px-2">Clear</button>}
                  </div>
                  <div className="max-h-60 overflow-y-auto p-2 space-y-1">
                    {allTickers.map(t => (
                      <label key={t} className="flex items-center px-3 py-2 rounded hover:bg-slate-50 cursor-pointer transition-colors">
                        <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-[#0F52BA] focus:ring-[#0F52BA]" checked={selectedTickers.includes(t)} onChange={() => toggleTickerFilter(t)} />
                        <span className="ml-3 text-sm font-bold text-slate-700">{t}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="w-px h-8 bg-slate-200 shrink-0" />

          {/* After-Tax Keep slider */}
          <div className="relative shrink-0">
            <div className="absolute -top-2 left-2 bg-white px-1 z-10 flex items-center gap-1">
              <span className="text-[9px] font-black text-[#0F52BA] uppercase tracking-tighter">After-Tax Keep</span>
              <div className="relative group">
                <svg className="w-3 h-3 text-slate-400 cursor-help" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="absolute left-0 bottom-5 w-56 bg-slate-900 text-white text-[11px] font-normal normal-case tracking-normal rounded-md px-3 py-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 leading-relaxed">
                  Applied to <span className="text-emerald-400 font-bold">profits only</span>. Losses are always counted at <span className="text-rose-400 font-bold">100%</span>.
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 pl-3 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-md">
              <input type="range" min={0} max={100} step={5} value={keepPct} onChange={e => setKeepPct(Number(e.target.value))} className="w-28 accent-[#0F52BA]00 cursor-pointer" />
              <span className="text-sm font-bold text-[#0F52BA] w-8 text-right">{keepPct}%</span>
            </div>
          </div>

          <button onClick={resetFilters} className="text-xs font-bold text-slate-400 hover:text-[#0F52BA] transition-colors uppercase tracking-widest px-2 shrink-0">
            Reset
          </button>
        </div>
      </div>

      {/* Table */}
      {tickerRows.length === 0 ? (
        <div className="py-20 text-center bg-white border border-[#D2D2D7] rounded">
          <div className="max-w-xs mx-auto space-y-4">
            <h4 className="text-slate-900 font-bold">No results found</h4>
            <p className="text-sm text-slate-400">No holdings match these criteria.</p>
            <button onClick={resetFilters} className="text-[#0F52BA] text-sm font-bold hover:underline">Clear all filters</button>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded border border-[#D2D2D7] bg-white overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-[#F5F5F7] border-b border-[#D2D2D7]">
                <th className="px-4 py-4 w-8">
                  <button
                    onClick={() => { if (expandedTickers.size > 0) { setExpandedTickers(new Set()); setExpandedBrokerages(new Set()); } else setExpandedTickers(new Set(tickerRows.map(r => r.ticker))); }}
                    className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-[#0F52BA] hover:bg-[#F5F5F7] transition-all"
                    title={expandedTickers.size > 0 ? 'Collapse all' : 'Expand all'}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      {expandedTickers.size > 0
                        ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
                        : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                      }
                    </svg>
                  </button>
                </th>
                <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap cursor-pointer hover:text-[#0F52BA]" onClick={() => handleSort('ticker')}>
                  <div className="flex items-center">Ticker <SortIndicator column="ticker" /></div>
                </th>
                <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap cursor-pointer hover:text-[#0F52BA] text-right" onClick={() => handleSort('quantity')}>
                  <div className="flex items-center justify-end">Quantity <SortIndicator column="quantity" /></div>
                </th>
                <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap text-right">Avg Cost</th>
                <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap cursor-pointer hover:text-[#0F52BA] text-right" onClick={() => handleSort('totalCost')}>
                  <div className="flex items-center justify-end">Total Cost <SortIndicator column="totalCost" /></div>
                </th>
                <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap cursor-pointer hover:text-[#0F52BA] text-right" onClick={() => handleSort('currentPrice')}>
                  <div className="flex items-center justify-end">Current Price <SortIndicator column="currentPrice" /></div>
                </th>
                <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap cursor-pointer hover:text-[#0F52BA] text-right" onClick={() => handleSort('marketValue')}>
                  <div className="flex items-center justify-end">Market Value <SortIndicator column="marketValue" /></div>
                </th>
                <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap cursor-pointer hover:text-[#0F52BA] text-right" onClick={() => handleSort('gain')}>
                  <div className="flex items-center justify-end">Unrealized <SortIndicator column="gain" /></div>
                </th>
                <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap text-right">Realized</th>
                <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap text-right">Total Gain</th>
                <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap text-right">Analyst Target</th>
                <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap text-right">Gain to Sell</th>
              </tr>
            </thead>
            <tbody>
              {tickerRows.map(row => {
                const isExpanded = expandedTickers.has(row.ticker);
                return (
                  <React.Fragment key={row.ticker}>

                    {/* Level 1 — Ticker */}
                    <tr className={`hover:bg-[#F5F5F7] transition-colors group border-t border-[#D2D2D7] ${isExpanded ? 'bg-slate-50/70' : ''}`}>
                      <td className="px-4 py-4">
                        {row.brokerageGroups.length > 0 && (
                          <button
                            onClick={() => toggleTicker(row.ticker)}
                            className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-[#0F52BA] hover:bg-[#F5F5F7] transition-all"
                          >
                            <svg className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                            </svg>
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <TickerLogo ticker={row.ticker} size={24} />
                          <span className="text-xs font-bold text-[#1D1D1F] uppercase tracking-tight">{row.ticker}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-right font-bold text-slate-800 text-sm">{row.totalQty.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className="px-4 py-4 text-right text-sm text-slate-500 font-medium">${row.avgCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className="px-4 py-4 text-right font-black text-slate-900 text-sm">${row.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className="px-4 py-4 text-right text-sm text-slate-500 font-medium">${row.currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className="px-4 py-4 text-right font-black text-slate-900 text-sm">${row.marketValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className="px-4 py-4 text-right">
                        <div className={`text-sm font-black ${row.unrealizedGain >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {row.unrealizedGain >= 0 ? '+' : '-'}${Math.abs(row.unrealizedGain).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        {row.avgCost > 0 && (
                          <div className={`text-xs font-bold ${row.unrealizedGain >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                            {row.unrealizedGain >= 0 ? '+' : ''}{((row.currentPrice - row.avgCost) / row.avgCost * 100).toFixed(1)}%
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-4 text-right">
                        {row.afterTaxRealized !== 0 ? (
                          <div className={`text-sm font-black ${row.afterTaxRealized >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {row.afterTaxRealized >= 0 ? '+' : '-'}${Math.abs(row.afterTaxRealized).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                        ) : <div className="text-xs text-slate-300">—</div>}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <div className={`text-sm font-black ${row.totalGain >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {row.totalGain >= 0 ? '+' : '-'}${Math.abs(row.totalGain).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-right">
                        {analystMedian[row.ticker] ? (() => {
                          const pct = ((analystMedian[row.ticker] - row.currentPrice) / row.currentPrice) * 100;
                          return (
                            <div>
                              <div className="text-sm font-bold text-[#0F52BA]">${analystMedian[row.ticker].toFixed(2)}</div>
                              <div className={`text-xs font-bold ${pct >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{pct >= 0 ? '+' : ''}{pct.toFixed(1)}%</div>
                            </div>
                          );
                        })() : <div className="text-xs text-slate-300">—</div>}
                      </td>
                      <td className="px-4 py-4 text-right">
                        {analystMedian[row.ticker] ? (() => {
                          const target = analystMedian[row.ticker];
                          const isOpts = (row.assetType || '').toLowerCase() === 'options';
                          // Options: avgCost = 100×premium/contract; equity: avgCost = cost/share
                          const g = isOpts
                            ? row.totalQty * (target * 100 - row.avgCost)
                            : row.totalQty * (target - row.avgCost);
                          return (
                            <div className={`text-sm font-black ${g >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {g >= 0 ? '+' : '-'}${Math.abs(g).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                          );
                        })() : <div className="text-xs text-slate-300">—</div>}
                      </td>
                    </tr>

                    {/* Level 2 — Brokerage rows */}
                    {isExpanded && row.brokerageGroups.map(bg => {
                      const brokerageKey = `${row.ticker}::${bg.brokerage}`;
                      const isBrokerageExpanded = expandedBrokerages.has(brokerageKey);
                      return (
                        <React.Fragment key={brokerageKey}>

                          {/* Level 2 row — brokerage aggregated */}
                          <tr className={`border-t border-[#D2D2D7] ${isBrokerageExpanded ? 'bg-[#0F52BA]/5' : 'bg-[#F5F5F7]'} hover:bg-[#0F52BA]/5 transition-colors`}>
                            <td className="pl-8 pr-4 py-3">
                              <button
                                onClick={() => toggleBrokerageRow(brokerageKey)}
                                className="w-5 h-5 flex items-center justify-center rounded-md text-[#D2D2D7] hover:text-[#0F52BA] hover:bg-[#E6EEFB] transition-all"
                              >
                                <svg className={`w-3 h-3 transition-transform ${isBrokerageExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                                </svg>
                              </button>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center px-2 py-1 rounded text-[10px] font-bold uppercase tracking-tight ${
                                bg.brokerage.toLowerCase().includes('robinhood') ? 'bg-[#0F52BA] text-white' :
                                bg.brokerage.toLowerCase().includes('schwab') ? 'bg-[#6E6E73] text-white' :
                                'bg-[#E5E5EA] text-[#6E6E73]'
                              }`}>{bg.brokerage}</span>
                            </td>
                            <td className="px-4 py-3 text-right text-[11px] font-medium text-slate-700">{bg.totalQty.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td className="px-4 py-3 text-right text-[11px] text-slate-500">${bg.avgCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td className="px-4 py-3 text-right text-[11px] font-semibold text-slate-700">${bg.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td className="px-4 py-3 text-right text-[11px] text-slate-500">${bg.currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td className="px-4 py-3 text-right text-[11px] font-semibold text-slate-700">${bg.marketValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td className={`px-4 py-3 text-right text-[11px] font-bold ${bg.unrealizedGain >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                              <div>{bg.unrealizedGain >= 0 ? '+' : '-'}${Math.abs(bg.unrealizedGain).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                              {bg.totalCost > 0 && <div className="text-[10px] font-bold">{bg.unrealizedGain >= 0 ? '+' : ''}{(bg.unrealizedGain / bg.totalCost * 100).toFixed(1)}%</div>}
                            </td>
                            <td></td>
                            <td></td>
                            <td className="px-4 py-3 text-right">
                              {analystMedian[row.ticker] ? (() => {
                                const target = analystMedian[row.ticker];
                                const pct = bg.currentPrice > 0 ? ((target - bg.currentPrice) / bg.currentPrice) * 100 : 0;
                                return (
                                  <div>
                                    <div className="text-[11px] font-bold text-[#0F52BA]">${target.toFixed(2)}</div>
                                    <div className={`text-[10px] font-bold ${pct >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{pct >= 0 ? '+' : ''}{pct.toFixed(1)}%</div>
                                  </div>
                                );
                              })() : <div className="text-[10px] text-slate-300">—</div>}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {analystMedian[row.ticker] ? (() => {
                                const target = analystMedian[row.ticker];
                                const isOpts = (row.assetType || '').toLowerCase() === 'options';
                                const g = isOpts
                                  ? bg.totalQty * (target * 100 - bg.avgCost)
                                  : bg.totalQty * (target - bg.avgCost);
                                return (
                                  <div className={`text-[11px] font-black ${g >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                    {g >= 0 ? '+' : '-'}${Math.abs(g).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </div>
                                );
                              })() : <div className="text-[10px] text-slate-300">—</div>}
                            </td>
                          </tr>

                          {/* Level 3 sub-header */}
                          {isBrokerageExpanded && (() => {
                            const th = (col: typeof lotSortKey, label: string) => (
                              <td className="px-4 py-1.5 text-[9px] font-black uppercase tracking-widest whitespace-nowrap text-right cursor-pointer select-none hover:text-[#0F52BA] transition-colors"
                                  style={{ color: lotSortKey === col ? '#0F52BA' : undefined }}
                                  onClick={() => handleLotSort(col)}>
                                <div className="flex items-center justify-end gap-0.5">{label}<LotSortIndicator col={col} /></div>
                              </td>
                            );
                            return (
                              <tr className="bg-[#E6EEFB]/30 border-t border-[#D2D2D7]/60">
                                <td></td>
                                <td className="px-4 py-1.5 text-[9px] font-black uppercase tracking-widest whitespace-nowrap cursor-pointer select-none hover:text-[#0F52BA] transition-colors"
                                    style={{ color: lotSortKey === 'buyDate' ? '#0F52BA' : undefined }}
                                    onClick={() => handleLotSort('buyDate')}>
                                  <div className="flex items-center gap-0.5">Buy Date<LotSortIndicator col="buyDate" /></div>
                                </td>
                                {th('quantity', 'Qty')}
                                {th('buyPrice', 'Buy Price')}
                                {th('totalCost', 'Total Cost')}
                                {th('currentPrice', 'Current Price')}
                                {th('marketValue', 'Market Value')}
                                {th('gain', 'Unrealized')}
                                <td className="px-4 py-1.5 text-[9px] font-black text-[#AEAEB2] uppercase tracking-widest whitespace-nowrap text-right">Term</td>
                                <td></td>
                                <td className="px-4 py-1.5 text-[9px] font-black text-[#AEAEB2] uppercase tracking-widest whitespace-nowrap text-right">Target</td>
                                <td className="px-4 py-1.5 text-[9px] font-black text-[#AEAEB2] uppercase tracking-widest whitespace-nowrap text-right">Gain to Sell</td>
                              </tr>
                            );
                          })()}

                          {/* Level 3 — Lot rows */}
                          {isBrokerageExpanded && bg.lots.map((lot: UnrealizedLot, idx: number) => {
                            const lotCost = lot.quantity * lot.buyPrice;
                            const lotMarket = lot.quantity * lot.currentPrice;
                            return (
                              <tr key={`${brokerageKey}-lot-${idx}`} className="bg-white border-t border-[#D2D2D7]/40">
                                <td className="px-4 py-2">
                                  <div className="flex justify-center pl-4">
                                    <div className="w-px h-full min-h-[16px] bg-[#D2D2D7]"></div>
                                  </div>
                                </td>
                                <td className="px-4 py-2 text-[11px] text-slate-500 font-bold whitespace-nowrap">{new Date(lot.buyDate).toLocaleDateString('en-CA')}</td>
                                <td className="px-4 py-2 text-right text-[11px] text-slate-600 font-medium">{lot.quantity.toFixed(2)}</td>
                                <td className="px-4 py-2 text-right text-[11px] text-slate-500">${lot.buyPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                <td className="px-4 py-2 text-right text-[11px] text-slate-500">${lotCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                <td className="px-4 py-2 text-right text-[11px] text-slate-500">${lot.currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                <td className="px-4 py-2 text-right text-[11px] text-slate-500">${lotMarket.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                <td className={`px-4 py-2 text-right text-[11px] font-black ${lot.gain >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                  <div>{lot.gain >= 0 ? '+' : '-'}${Math.abs(lot.gain).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                  {lot.buyPrice > 0 && <div className="text-[10px] font-bold">{lot.gain >= 0 ? '+' : ''}{((lot.currentPrice - lot.buyPrice) / lot.buyPrice * 100).toFixed(1)}%</div>}
                                </td>
                                <td className="px-4 py-2 text-right">
                                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${lot.isLongTerm ? 'bg-[#E6EEFB] text-[#0A3E8F]' : 'bg-[#E5E5EA] text-[#6E6E73]'}`}>
                                    {lot.isLongTerm ? 'LT' : 'ST'}
                                  </span>
                                </td>
                                <td></td>
                                <td className="px-4 py-2 text-right">
                                  {analystMedian[row.ticker] ? (
                                    <div className="text-[11px] font-bold text-[#0F52BA]">${analystMedian[row.ticker].toFixed(2)}</div>
                                  ) : <div className="text-[10px] text-slate-300">—</div>}
                                </td>
                                <td className="px-4 py-2 text-right">
                                  {analystMedian[row.ticker] ? (() => {
                                    const target = analystMedian[row.ticker];
                                    const isOpts = (lot.assetType || '').toLowerCase() === 'options';
                                    // lot.buyPrice is always per-share; multiply by 100 for options contracts
                                    const g = isOpts
                                      ? lot.quantity * 100 * (target - lot.buyPrice)
                                      : lot.quantity * (target - lot.buyPrice);
                                    return (
                                      <div className={`text-[11px] font-black ${g >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                        {g >= 0 ? '+' : '-'}${Math.abs(g).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                      </div>
                                    );
                                  })() : <div className="text-[10px] text-slate-300">—</div>}
                                </td>
                              </tr>
                            );
                          })}

                        </React.Fragment>
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
