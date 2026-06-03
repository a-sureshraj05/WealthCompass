import React, { useState, useMemo, useRef, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';
import { RealizedGain, UnrealizedLot } from '../types';
import TickerLogo from './TickerLogo';
import SortIndicator from './SortIndicator';
import { useClickOutside } from '../hooks/useClickOutside';
import { formatCurrency, formatDate } from '../utils/finance';

type GainSortKey = 'ticker' | 'assetType' | 'brokerage' | 'buyDate' | 'sellDate' | 'quantity' | 'buyPrice' | 'price' | 'gain' | 'proceeds' | 'costBasis';
type SortDirection = 'asc' | 'desc' | null;

interface Props {
  realizedGains: RealizedGain[];
  unrealizedGains: UnrealizedLot[];
  selectedBrokerages: string[];
  setSelectedBrokerages: (v: string[]) => void;
  selectedTickers: string[];
  setSelectedTickers: (v: string[]) => void;
}

const fmt = formatCurrency;
const fmtDate = formatDate;

const GainsLossesView: React.FC<Props> = ({ realizedGains: realizedGainsData, unrealizedGains: unrealizedGainsData, selectedBrokerages, setSelectedBrokerages, selectedTickers, setSelectedTickers }) => {
  const [activeSubTab, setActiveSubTab] = useState<'realized' | 'unrealized'>('realized');
  const [selectedYear, setSelectedYear] = useState<string>('Overall');

  useEffect(() => {
    if (realizedGainsData.length === 0) return;
    const years = [...new Set(realizedGainsData.map(g => new Date(g.sellDate).getFullYear()))];
    const latest = Math.max(...years).toString();
    setSelectedYear(latest);
  }, [realizedGainsData]);

  const [stTaxRate, setStTaxRate] = useState<number>(37);
  const [ltTaxRate, setLtTaxRate] = useState<number>(20);

  const [isTickerMenuOpen, setIsTickerMenuOpen] = useState(false);
  const [isBrokerageMenuOpen, setIsBrokerageMenuOpen] = useState(false);
  const [isAssetTypeMenuOpen, setIsAssetTypeMenuOpen] = useState(false);
  const [selectedAssetTypes, setSelectedAssetTypes] = useState<string[]>([]);

  const [sortKey, setSortKey] = useState<GainSortKey | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [stExpanded, setStExpanded] = useState(false);
  const [ltExpanded, setLtExpanded] = useState(false);
  const [expandedAssetTypes, setExpandedAssetTypes] = useState<Set<string>>(new Set());
  const [expandedTickers, setExpandedTickers] = useState<Set<string>>(new Set());

  const toggleAssetTypeExpand = (key: string) => {
    setExpandedAssetTypes(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const toggleTickerExpand = (key: string) => {
    setExpandedTickers(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const tickerMenuRef = useRef<HTMLDivElement>(null);
  const brokerageMenuRef = useRef<HTMLDivElement>(null);
  const assetTypeMenuRef = useRef<HTMLDivElement>(null);

  useClickOutside(
    [tickerMenuRef, brokerageMenuRef, assetTypeMenuRef],
    [setIsTickerMenuOpen, setIsBrokerageMenuOpen, setIsAssetTypeMenuOpen],
  );

  const yoyData = useMemo(() => {
    if (activeSubTab !== 'realized') return [];
    const years: Record<string, { year: string; shortTerm: number; longTerm: number }> = {};
    realizedGainsData.forEach(g => {
      const year = new Date(g.sellDate).getFullYear().toString();
      if (!years[year]) years[year] = { year, shortTerm: 0, longTerm: 0 };
      if (g.isLongTerm) years[year].longTerm += g.gain;
      else years[year].shortTerm += g.gain;
    });
    return Object.values(years).sort((a, b) => a.year.localeCompare(b.year));
  }, [realizedGainsData, activeSubTab]);

  const unrealizedBarData = useMemo(() => {
    if (activeSubTab !== 'unrealized') return [];
    const tickers: Record<string, { ticker: string; shortTerm: number; longTerm: number; total: number }> = {};
    unrealizedGainsData.forEach(lot => {
      if (!tickers[lot.ticker]) tickers[lot.ticker] = { ticker: lot.ticker, shortTerm: 0, longTerm: 0, total: 0 };
      if (lot.isLongTerm) tickers[lot.ticker].longTerm += lot.gain;
      else tickers[lot.ticker].shortTerm += lot.gain;
    });
    return Object.values(tickers).map(t => ({ ...t, total: t.shortTerm + t.longTerm })).sort((a, b) => b.total - a.total);
  }, [unrealizedGainsData, activeSubTab]);

  const waterfallData = useMemo(() => {
    const source = activeSubTab === 'realized' ? yoyData : unrealizedBarData;
    const items = source.map((d: any) => ({
      label: d.year ?? d.ticker,
      shortTerm: d.shortTerm ?? 0,
      longTerm: d.longTerm ?? 0,
      net: (d.shortTerm ?? 0) + (d.longTerm ?? 0),
    }));
    const totalST = items.reduce((s, d) => s + d.shortTerm, 0);
    const totalLT = items.reduce((s, d) => s + d.longTerm, 0);
    items.push({ label: 'Total', shortTerm: totalST, longTerm: totalLT, net: totalST + totalLT });
    return items;
  }, [yoyData, unrealizedBarData, activeSubTab]);

  const uniqueTickers = useMemo(() => {
    const source = activeSubTab === 'realized' ? realizedGainsData : unrealizedGainsData;
    return Array.from(new Set(source.map((g: RealizedGain | UnrealizedLot) => g.ticker))).sort();
  }, [realizedGainsData, unrealizedGainsData, activeSubTab]);

  const uniqueBrokerages = useMemo(() => {
    const source = activeSubTab === 'realized' ? realizedGainsData : unrealizedGainsData;
    return Array.from(new Set(source.map((g: RealizedGain | UnrealizedLot) => g.brokerage))).sort();
  }, [realizedGainsData, unrealizedGainsData, activeSubTab]);

  const uniqueAssetTypes = useMemo(() => {
    const source = activeSubTab === 'realized' ? realizedGainsData : unrealizedGainsData;
    return Array.from(new Set(source.map((g: RealizedGain | UnrealizedLot) => g.assetType || '').filter(Boolean))).sort();
  }, [realizedGainsData, unrealizedGainsData, activeSubTab]);

  const availableYears = useMemo(() => {
    const years = new Set(realizedGainsData.map(g => new Date(g.sellDate).getFullYear().toString()));
    return ['Overall', ...Array.from(years)].sort((a, b) => b.localeCompare(a));
  }, [realizedGainsData]);

  const filteredData = useMemo(() => {
    const source = activeSubTab === 'realized' ? realizedGainsData : unrealizedGainsData;
    let result = source.filter(g => {
      const matchesTicker = selectedTickers.length === 0 || selectedTickers.includes(g.ticker);
      const matchesBrokerage = selectedBrokerages.length === 0 || selectedBrokerages.includes(g.brokerage);
      const matchesAssetType = selectedAssetTypes.length === 0 || selectedAssetTypes.includes(g.assetType || '');
      if (activeSubTab === 'realized') {
        const year = new Date((g as RealizedGain).sellDate).getFullYear().toString();
        return matchesTicker && matchesBrokerage && matchesAssetType && (selectedYear === 'Overall' || year === selectedYear);
      }
      return matchesTicker && matchesBrokerage && matchesAssetType;
    });

    if (sortKey && sortDirection) {
      result = [...result].sort((a, b) => {
        let valA: any, valB: any;
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
          case 'proceeds':
            valA = activeSubTab === 'realized' ? a.quantity * (a as RealizedGain).sellPrice : a.quantity * (a as UnrealizedLot).currentPrice;
            valB = activeSubTab === 'realized' ? b.quantity * (b as RealizedGain).sellPrice : b.quantity * (b as UnrealizedLot).currentPrice;
            break;
          case 'costBasis': valA = a.quantity * a.buyPrice; valB = b.quantity * b.buyPrice; break;
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
  }, [realizedGainsData, unrealizedGainsData, selectedTickers, selectedBrokerages, selectedAssetTypes, selectedYear, activeSubTab, sortKey, sortDirection]);

  const shortTerm = filteredData.filter(g => !g.isLongTerm);
  const longTerm = filteredData.filter(g => g.isLongTerm);

  const stats = useMemo(() => {
    const stTotal = shortTerm.reduce((sum, g) => sum + g.gain, 0);
    const ltTotal = longTerm.reduce((sum, g) => sum + g.gain, 0);
    const taxEst = (stTotal > 0 ? stTotal * (stTaxRate / 100) : 0) + (ltTotal > 0 ? ltTotal * (ltTaxRate / 100) : 0);
    const ltShare = stTotal + ltTotal !== 0 ? (ltTotal / (stTotal + ltTotal)) * 100 : 0;
    return { stTotal, ltTotal, taxEst, ltShare };
  }, [shortTerm, longTerm, stTaxRate, ltTaxRate]);

  const toggleTicker = (ticker: string) => setSelectedTickers(selectedTickers.includes(ticker) ? selectedTickers.filter(t => t !== ticker) : [...selectedTickers, ticker]);
  const toggleBrokerage = (broker: string) => setSelectedBrokerages(selectedBrokerages.includes(broker) ? selectedBrokerages.filter(b => b !== broker) : [...selectedBrokerages, broker]);
  const toggleAssetType = (type: string) => setSelectedAssetTypes(selectedAssetTypes.includes(type) ? selectedAssetTypes.filter(t => t !== type) : [...selectedAssetTypes, type]);

  const handleSort = (key: GainSortKey) => {
    if (sortKey === key) {
      if (sortDirection === 'asc') setSortDirection('desc');
      else if (sortDirection === 'desc') { setSortKey(null); setSortDirection(null); }
      else setSortDirection('asc');
    } else { setSortKey(key); setSortDirection('asc'); }
  };

  const SI = ({ column }: { column: GainSortKey }) => (
    <SortIndicator column={column} sortKey={sortKey} sortDirection={sortDirection} />
  );


  const GainTableSection = ({ title, data, isLT, prefix }: { title: string; data: (RealizedGain | UnrealizedLot)[]; isLT: boolean; prefix: string }) => {
    const optMult = (at: string) => (at || '').toLowerCase() === 'options' ? 100 : 1;

    // Level 2: assetType → Level 3: ticker → lots
    type TickerEntry = { lots: (RealizedGain | UnrealizedLot)[]; totalQty: number; totalCost: number; totalProceeds: number; totalGain: number; brokerages: string[] };
    type AssetTypeEntry = { tickers: Map<string, TickerEntry>; tickerOrder: string[]; totalQty: number; totalCost: number; totalProceeds: number; totalGain: number };

    const atMap = new Map<string, AssetTypeEntry>();
    const atOrder: string[] = [];

    data.forEach(g => {
      const at = g.assetType || 'Equity';
      const m = optMult(at);
      const proc = activeSubTab === 'realized'
        ? g.quantity * (g as RealizedGain).sellPrice * m
        : g.quantity * (g as UnrealizedLot).currentPrice * m;
      const cost = g.quantity * g.buyPrice * m;

      if (!atMap.has(at)) {
        atMap.set(at, { tickers: new Map(), tickerOrder: [], totalQty: 0, totalCost: 0, totalProceeds: 0, totalGain: 0 });
        atOrder.push(at);
      }
      const atEntry = atMap.get(at)!;
      atEntry.totalQty += g.quantity;
      atEntry.totalCost += cost;
      atEntry.totalProceeds += proc;
      atEntry.totalGain += g.gain;

      if (!atEntry.tickers.has(g.ticker)) {
        atEntry.tickers.set(g.ticker, { lots: [], totalQty: 0, totalCost: 0, totalProceeds: 0, totalGain: 0, brokerages: [] });
        atEntry.tickerOrder.push(g.ticker);
      }
      const tEntry = atEntry.tickers.get(g.ticker)!;
      tEntry.lots.push(g);
      tEntry.totalQty += g.quantity;
      tEntry.totalCost += cost;
      tEntry.totalProceeds += proc;
      tEntry.totalGain += g.gain;
      if (!tEntry.brokerages.includes(g.brokerage)) tEntry.brokerages.push(g.brokerage);
    });

    // Sort tickers within each assetType when a sort key is active
    const sortedAtOrder = [...atOrder].sort((a, b) => {
      // Equity before Options
      if (a === 'Equity' && b !== 'Equity') return -1;
      if (b === 'Equity' && a !== 'Equity') return 1;
      return a.localeCompare(b);
    });

    const badge = (b: string) => (
      <span key={b} className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-tight ${
        b.toLowerCase().includes('robinhood') ? 'bg-[#0F52BA] text-white' :
        b.toLowerCase().includes('schwab') ? 'bg-[#6E6E73] text-white' :
        'bg-[#E5E5EA] text-[#6E6E73]'
      }`}>{b}</span>
    );

    if (data.length === 0) return (
      <div className="rounded border border-[#D2D2D7] bg-white px-6 py-10 text-center text-slate-400 text-xs italic">
        No {title.toLowerCase()} entries for the current filter.
      </div>
    );

    return (
      <div className="overflow-hidden rounded border border-[#D2D2D7] bg-white overflow-x-auto">
        <table className="w-full text-left min-w-[760px]">
          <thead>
            <tr className="bg-[#F5F5F7] border-b border-[#D2D2D7]">
              {([
                { key: 'ticker', label: 'Asset / Ticker', align: 'left' },
                { key: 'brokerage', label: 'Brokerage', align: 'left' },
                { key: 'quantity', label: 'Qty', align: 'right' },
                { key: 'proceeds', label: activeSubTab === 'realized' ? 'Proceeds' : 'Mkt Value', align: 'right' },
                { key: 'costBasis', label: 'Cost Basis', align: 'right' },
                { key: 'gain', label: activeSubTab === 'realized' ? 'Realized G/L' : 'Unrealized G/L', align: 'right' },
              ] as { key: GainSortKey; label: string; align: string }[]).map(({ key, label, align }) => (
                <th key={key} className={`px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest cursor-pointer hover:text-[#0F52BA] transition-colors ${align === 'right' ? 'text-right' : ''}`} onClick={() => handleSort(key)}>
                  <div className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : ''}`}>{label}<SI column={key} /></div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedAtOrder.map(at => {
              const atEntry = atMap.get(at)!;
              const atKey = `${prefix}-${at}`;
              const atExpanded = expandedAssetTypes.has(atKey);
              const isOptions = at.toLowerCase() === 'options';
              const qtyUnit = isOptions ? 'contract' : 'share';

              // Sort tickers within this assetType
              const sortedTickers: [string, TickerEntry][] = atEntry.tickerOrder.map(t => [t, atEntry.tickers.get(t)!]);
              if (sortKey && sortDirection) {
                sortedTickers.sort(([, a], [, b]) => {
                  let va: any, vb: any;
                  if (sortKey === 'ticker') { va = sortedTickers.findIndex(([t]) => atEntry.tickers.get(t) === a); vb = 0; return 0; }
                  if (sortKey === 'quantity') { va = a.totalQty; vb = b.totalQty; }
                  else if (sortKey === 'proceeds') { va = a.totalProceeds; vb = b.totalProceeds; }
                  else if (sortKey === 'costBasis') { va = a.totalCost; vb = b.totalCost; }
                  else if (sortKey === 'gain') { va = a.totalGain; vb = b.totalGain; }
                  else if (sortKey === 'brokerage') { va = a.brokerages[0] || ''; vb = b.brokerages[0] || ''; }
                  else return 0;
                  if (va < vb) return sortDirection === 'asc' ? -1 : 1;
                  if (va > vb) return sortDirection === 'asc' ? 1 : -1;
                  return 0;
                });
              }

              return (
                <React.Fragment key={at}>
                  {/* ── Asset Type row (Level 2) ── */}
                  <tr
                    className="bg-[#F0F4FA] border-b border-[#D2D2D7] hover:bg-[#E8EEF8] transition-colors cursor-pointer select-none"
                    onClick={() => toggleAssetTypeExpand(atKey)}
                  >
                    <td className="px-4 py-2.5" colSpan={2}>
                      <div className="flex items-center gap-2">
                        <svg className={`w-3 h-3 text-[#0F52BA] transition-transform shrink-0 ${atExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                        </svg>
                        <span className="text-[11px] font-black text-[#0F52BA] uppercase tracking-widest">{at}</span>
                        <span className="text-[10px] text-slate-500 font-medium">
                          · {atEntry.totalQty % 1 === 0 ? atEntry.totalQty.toFixed(0) : atEntry.totalQty.toFixed(4)} {qtyUnit}{atEntry.totalQty !== 1 ? 's' : ''}
                          · {atEntry.tickerOrder.length} ticker{atEntry.tickerOrder.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right text-[10px] text-slate-500 font-semibold">
                      {atEntry.totalQty % 1 === 0 ? atEntry.totalQty.toFixed(0) : atEntry.totalQty.toFixed(4)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-[10px] text-slate-600 font-semibold">{fmt(atEntry.totalProceeds)}</td>
                    <td className="px-4 py-2.5 text-right text-[10px] text-slate-500">{fmt(atEntry.totalCost)}</td>
                    <td className={`px-4 py-2.5 text-right text-[10px] font-black ${atEntry.totalGain >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {atEntry.totalGain >= 0 ? '+' : '-'}${Math.abs(atEntry.totalGain).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>

                  {atExpanded && sortedTickers.map(([ticker, tEntry]) => {
                    const tkKey = `${prefix}-${at}-${ticker}`;
                    const tkExpanded = expandedTickers.has(tkKey);
                    return (
                      <React.Fragment key={ticker}>
                        {/* ── Ticker row (Level 3) ── */}
                        <tr
                          className="border-b border-[#D2D2D7] hover:bg-[#F5F5F7]/60 transition-colors cursor-pointer select-none"
                          onClick={() => toggleTickerExpand(tkKey)}
                        >
                          <td className="px-4 py-3 pl-8">
                            <div className="flex items-center gap-2.5">
                              <svg className={`w-3.5 h-3.5 text-slate-400 transition-transform shrink-0 ${tkExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                              </svg>
                              <TickerLogo ticker={ticker} size={28} assetType={at} />
                              <div>
                                <p className="text-xs font-bold text-[#1D1D1F] uppercase tracking-tight">{ticker}</p>
                                <p className="text-[10px] text-slate-400">{tEntry.lots.length} lot{tEntry.lots.length !== 1 ? 's' : ''}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">{tEntry.brokerages.map(b => badge(b))}</div>
                          </td>
                          <td className="px-4 py-3 text-right text-[11px] text-slate-900 font-bold">
                            {tEntry.totalQty % 1 === 0 ? tEntry.totalQty.toFixed(0) : tEntry.totalQty.toFixed(4)}
                          </td>
                          <td className="px-4 py-3 text-right text-[11px] text-slate-700 font-semibold">{fmt(tEntry.totalProceeds)}</td>
                          <td className="px-4 py-3 text-right text-[11px] text-slate-500">{fmt(tEntry.totalCost)}</td>
                          <td className={`px-4 py-3 text-right text-[11px] font-black ${tEntry.totalGain >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {tEntry.totalGain >= 0 ? '+' : '-'}${Math.abs(tEntry.totalGain).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        </tr>

                        {/* ── Individual lot rows (Level 4) ── */}
                        {tkExpanded && tEntry.lots.map((g, i) => {
                          const m = optMult(at);
                          const proc = activeSubTab === 'realized'
                            ? g.quantity * (g as RealizedGain).sellPrice * m
                            : g.quantity * (g as UnrealizedLot).currentPrice * m;
                          const cost = g.quantity * g.buyPrice * m;
                          const isLast = i === tEntry.lots.length - 1;
                          return (
                            <tr key={g.id} className={`bg-[#FAFAFA] hover:bg-[#F2F2F7] transition-colors ${isLast ? 'border-b border-[#D2D2D7]' : 'border-b border-[#EBEBEB]'}`}>
                              <td className="px-4 py-2 pl-16">
                                <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-medium">
                                  <span className="text-slate-300 text-xs">↳</span>
                                  <span>Opened {fmtDate(g.buyDate)}</span>
                                  {activeSubTab === 'realized' && (
                                    <span className="text-slate-400">→ Closed {fmtDate((g as RealizedGain).sellDate)}</span>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-2">{badge(g.brokerage)}</td>
                              <td className="px-4 py-2 text-right text-[10px] text-slate-700 font-medium">
                                {g.quantity.toFixed(g.quantity % 1 === 0 ? 0 : 4)}
                              </td>
                              <td className="px-4 py-2 text-right text-[10px] text-slate-600">{fmt(proc)}</td>
                              <td className="px-4 py-2 text-right text-[10px] text-slate-400">{fmt(cost)}</td>
                              <td className={`px-4 py-2 text-right text-[10px] font-bold ${g.gain >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                {g.gain >= 0 ? '+' : '-'}${Math.abs(g.gain).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
    );
  };

  const FilterDropdown = ({ label, refEl, isOpen, onToggle, count, onClear, children }: {
    label: string; refEl: React.RefObject<HTMLDivElement>; isOpen: boolean; onToggle: () => void;
    count: number; onClear: () => void; children: React.ReactNode;
  }) => (
    <div className="relative" ref={refEl}>
      <button
        onClick={onToggle}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-bold border transition-all ${
          count > 0 ? 'bg-[#0F52BA] text-white border-[#0F52BA]' : 'bg-white text-slate-600 border-[#D2D2D7] hover:border-[#0F52BA] hover:text-[#0F52BA]'
        }`}
      >
        <span className="uppercase tracking-wider">{label}</span>
        {count > 0 && <span className="ml-0.5 bg-white/20 rounded px-1">{count}</span>}
        {count > 0 ? (
          <span onClick={e => { e.stopPropagation(); onClear(); }} className="ml-1 hover:opacity-70">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
          </span>
        ) : (
          <svg className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 9l-7 7-7-7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        )}
      </button>
      {isOpen && (
        <div className="absolute top-full left-0 mt-1.5 w-52 bg-white border border-[#D2D2D7] rounded shadow-xl overflow-hidden z-50">
          <div className="max-h-56 overflow-y-auto p-1.5 space-y-0.5">{children}</div>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6">

      {/* Sub-tabs — underline style */}
      <div className="flex items-center border-b border-[#D2D2D7]">
        {(['realized', 'unrealized'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveSubTab(tab)}
            className={`px-5 py-2.5 text-sm font-bold capitalize tracking-wide transition-all border-b-2 -mb-px ${
              activeSubTab === tab
                ? 'border-[#0F52BA] text-[#0F52BA]'
                : 'border-transparent text-slate-400 hover:text-slate-700'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Chart + Tax Liability */}
      <div className="grid grid-cols-1 md:grid-cols-10 gap-6">
        {/* Chart */}
        <div className="md:col-span-7 bg-white p-6 rounded border border-[#D2D2D7]">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-5">
            {activeSubTab === 'realized' ? 'Yearly Realized Profit Split' : 'Unrealized Gain by Ticker'}
          </p>
          <div className="h-64">
            {waterfallData.length > 1 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={waterfallData} margin={{ top: 24, right: 8, left: 8, bottom: 5 }} barCategoryGap="30%">
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }}
                    tickFormatter={(v) => `${v < 0 ? '-' : ''}$${Math.abs(v) >= 1000 ? `${(Math.abs(v) / 1000).toFixed(0)}k` : Math.abs(v)}`} />
                  <ReferenceLine y={0} stroke="#D2D2D7" strokeWidth={1} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: '700', paddingTop: '8px' }}
                    formatter={(value) => <span style={{ color: value === 'Short Term' ? '#eab308' : '#10b981' }}>{value}</span>}
                  />
                  <Tooltip
                    cursor={{ fill: '#f8fafc' }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0]?.payload;
                      if (!d) return null;
                      return (
                        <div style={{ background: '#fff', border: '1px solid #E5E5E5', borderRadius: 8, padding: '10px 14px', fontSize: 11, boxShadow: '0 4px 16px rgba(0,0,0,0.10)' }}>
                          <p style={{ fontWeight: 800, color: '#1D1D1F', marginBottom: 6 }}>{d.label}</p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 4 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
                              <span style={{ color: '#eab308', fontWeight: 700 }}>ST</span>
                              <span style={{ color: d.shortTerm >= 0 ? '#10b981' : '#f43f5e', fontWeight: 700 }}>{fmt(d.shortTerm)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
                              <span style={{ color: '#10b981', fontWeight: 700 }}>LT</span>
                              <span style={{ color: d.longTerm >= 0 ? '#10b981' : '#f43f5e', fontWeight: 700 }}>{fmt(d.longTerm)}</span>
                            </div>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, borderTop: '1px solid #f1f5f9', paddingTop: 4 }}>
                            <span style={{ color: '#1D1D1F', fontWeight: 800 }}>Net</span>
                            <span style={{ color: d.net >= 0 ? '#10b981' : '#f43f5e', fontWeight: 800 }}>{fmt(d.net)}</span>
                          </div>
                        </div>
                      );
                    }}
                  />
                  {/* Short-term amber bar */}
                  <Bar dataKey="shortTerm" name="Short Term" stackId="a" fill="#eab308" radius={[0, 0, 0, 0]}>
                    {waterfallData.map((d, i) => (
                      <Cell key={i} fill="#eab308" fillOpacity={d.label === 'Total' ? 1 : 0.85} />
                    ))}
                  </Bar>
                  {/* Long-term emerald bar */}
                  <Bar dataKey="longTerm" name="Long Term" stackId="a" fill="#10b981" radius={[3, 3, 0, 0]}
                    label={{
                      content: (props: any) => {
                        const d = waterfallData[props.index];
                        if (!d || Math.abs(d.net) < 1) return null;
                        const abs = Math.abs(d.net);
                        const lbl = abs >= 1000 ? `${d.net >= 0 ? '+' : '-'}$${(abs / 1000).toFixed(1)}k` : `${d.net >= 0 ? '+' : '-'}$${abs.toFixed(0)}`;
                        const topOfStack = Math.min(props.y, props.y + props.height);
                        return <text x={props.x + props.width / 2} y={topOfStack - 5} textAnchor="middle" fontSize={9} fontWeight="bold" fill="#1e293b">{lbl}</text>;
                      }
                    }}
                  >
                    {waterfallData.map((d, i) => (
                      <Cell key={i} fill="#10b981" fillOpacity={d.label === 'Total' ? 1 : 0.85} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400 text-xs italic">No data to visualize</div>
            )}
          </div>
        </div>

        {/* Tax Liability Panel */}
        <div className="md:col-span-3 bg-white p-6 rounded border border-[#D2D2D7] flex flex-col gap-5">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Estimated Tax Liability</p>

          <div>
            <p className="text-3xl font-black text-[#0F52BA] leading-none">{fmt(stats.taxEst)}</p>
            <p className="text-[10px] text-slate-400 mt-1">USD · based on filtered {activeSubTab} gains</p>
            <div className="flex items-center gap-3 mt-3">
              <div className="flex-1 bg-yellow-50 border border-yellow-100 rounded px-2.5 py-2">
                <p className="text-[9px] font-black uppercase tracking-widest mb-0.5" style={{ color: '#eab308' }}>Short-Term</p>
                <p className="text-sm font-black" style={{ color: '#eab308' }}>{fmt(stats.stTotal > 0 ? stats.stTotal * (stTaxRate / 100) : 0)}</p>
              </div>
              <div className="flex-1 bg-emerald-50 border border-emerald-100 rounded px-2.5 py-2">
                <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest mb-0.5">Long-Term</p>
                <p className="text-sm font-black text-emerald-700">{fmt(stats.ltTotal > 0 ? stats.ltTotal * (ltTaxRate / 100) : 0)}</p>
              </div>
            </div>
          </div>

          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between py-2.5 border-t border-[#E5E5EA]">
              <span className="text-[11px] text-slate-500">Calculation Basis</span>
              <div className="flex items-center gap-2">
                <input type="number" value={stTaxRate} onChange={e => setStTaxRate(Number(e.target.value))}
                  className="w-12 px-1.5 py-1 bg-yellow-50 border border-yellow-200 rounded text-[11px] font-bold text-center focus:outline-none focus:ring-1 focus:ring-yellow-400" style={{ color: '#eab308' }} title="Short-term rate %" />
                <span className="text-[10px] text-slate-400">/</span>
                <input type="number" value={ltTaxRate} onChange={e => setLtTaxRate(Number(e.target.value))}
                  className="w-12 px-1.5 py-1 bg-emerald-50 border border-emerald-200 rounded text-[11px] font-bold text-emerald-700 text-center focus:outline-none focus:ring-1 focus:ring-emerald-400" title="Long-term rate %" />
                <span className="text-[10px] text-slate-400">%</span>
              </div>
            </div>
            <div className="flex items-center justify-between py-2.5 border-t border-[#E5E5EA]">
              <span className="text-[11px] text-slate-500">Efficiency Score</span>
              <span className="text-[11px] font-black" style={{ color: stats.ltShare >= 50 ? '#10b981' : '#eab308' }}>{stats.ltShare.toFixed(1)}%</span>
            </div>
            <div className="flex items-center justify-between py-2.5 border-t border-[#E5E5EA]">
              <span className="text-[11px] text-slate-500">Active Tax Lots</span>
              <span className="text-[11px] font-black text-slate-800">{filteredData.length.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Filter Bar + Summary strip */}
      <div className="bg-white rounded border border-[#D2D2D7] overflow-hidden">
        {/* Filters */}
        <div className="px-5 py-3 flex flex-wrap items-center gap-2 border-b border-[#E5E5EA]">
          <div className="flex items-center gap-1.5 mr-2">
            <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Filters</span>
          </div>

          {/* Tax Year chip */}
          {activeSubTab === 'realized' && (
            <div className="relative">
              <select
                value={selectedYear}
                onChange={e => setSelectedYear(e.target.value)}
                className="appearance-none pl-3 pr-7 py-1.5 bg-white border border-[#D2D2D7] rounded text-[11px] font-bold text-slate-600 uppercase tracking-wide focus:outline-none focus:ring-2 focus:ring-[#0F52BA] cursor-pointer hover:border-[#0F52BA] transition-colors"
              >
                {availableYears.map(y => <option key={y} value={y}>Tax Year: {y}</option>)}
              </select>
              <div className="absolute inset-y-0 right-2 flex items-center pointer-events-none">
                <svg className="w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 9l-7 7-7-7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </div>
            </div>
          )}

          <FilterDropdown label="Brokerage" refEl={brokerageMenuRef} isOpen={isBrokerageMenuOpen} onToggle={() => setIsBrokerageMenuOpen(v => !v)} count={selectedBrokerages.length} onClear={() => setSelectedBrokerages([])}>
            {uniqueBrokerages.map(b => (
              <label key={b} className="flex items-center gap-2.5 px-3 py-1.5 rounded hover:bg-slate-50 cursor-pointer">
                <input type="checkbox" className="w-3.5 h-3.5 rounded border-slate-300 text-[#0F52BA] focus:ring-[#0F52BA]" checked={selectedBrokerages.includes(b)} onChange={() => toggleBrokerage(b)} />
                <span className="text-xs font-medium text-slate-700">{b}</span>
              </label>
            ))}
          </FilterDropdown>

          <FilterDropdown label="Asset Type" refEl={assetTypeMenuRef} isOpen={isAssetTypeMenuOpen} onToggle={() => setIsAssetTypeMenuOpen(v => !v)} count={selectedAssetTypes.length} onClear={() => setSelectedAssetTypes([])}>
            {uniqueAssetTypes.map(t => (
              <label key={t} className="flex items-center gap-2.5 px-3 py-1.5 rounded hover:bg-slate-50 cursor-pointer">
                <input type="checkbox" className="w-3.5 h-3.5 rounded border-slate-300 text-[#0F52BA] focus:ring-[#0F52BA]" checked={selectedAssetTypes.includes(t)} onChange={() => toggleAssetType(t)} />
                <span className="text-xs font-medium text-slate-700 capitalize">{t}</span>
              </label>
            ))}
          </FilterDropdown>

          <FilterDropdown label="Ticker" refEl={tickerMenuRef} isOpen={isTickerMenuOpen} onToggle={() => setIsTickerMenuOpen(v => !v)} count={selectedTickers.length} onClear={() => setSelectedTickers([])}>
            {uniqueTickers.map(ticker => (
              <label key={ticker} className="flex items-center gap-2.5 px-3 py-1.5 rounded hover:bg-slate-50 cursor-pointer">
                <input type="checkbox" className="w-3.5 h-3.5 rounded border-slate-300 text-[#0F52BA] focus:ring-[#0F52BA]" checked={selectedTickers.includes(ticker)} onChange={() => toggleTicker(ticker)} />
                <span className="text-xs font-medium text-slate-700">{ticker}</span>
              </label>
            ))}
          </FilterDropdown>
        </div>

        {/* Summary strip */}
        <div className="px-5 py-3 bg-[#F5F5F7] flex flex-wrap items-center gap-6">
          <div>
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Total {activeSubTab === 'realized' ? 'Realized' : 'Unrealized'} Gain</p>
            <p className={`text-lg font-black ${(stats.stTotal + stats.ltTotal) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {(stats.stTotal + stats.ltTotal) >= 0 ? '+' : ''}{fmt(stats.stTotal + stats.ltTotal)}
            </p>
          </div>
          <div className="w-px h-8 bg-[#D2D2D7]" />
          <div>
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Short-Term</p>
            <p className={`text-sm font-bold ${stats.stTotal >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{fmt(stats.stTotal)}</p>
          </div>
          <div className="w-px h-8 bg-[#D2D2D7]" />
          <div>
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Long-Term</p>
            <p className={`text-sm font-bold ${stats.ltTotal >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{fmt(stats.ltTotal)}</p>
          </div>
          <div className="w-px h-8 bg-[#D2D2D7]" />
          <div>
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Tax Estimate</p>
            <p className="text-sm font-bold text-[#0F52BA]">{fmt(stats.taxEst)}</p>
          </div>
          <div className="ml-auto text-[10px] text-slate-400 font-medium">{filteredData.length} lots</div>
        </div>
      </div>

      {/* ST / LT Sections */}
      <div className="space-y-4">
        {/* Short Term */}
        <div className="space-y-3">
          <button
            onClick={() => setStExpanded(v => !v)}
            className="w-full p-4 bg-white rounded border border-[#D2D2D7] flex items-center justify-between hover:bg-[#F5F5F7] transition-colors"
          >
            <div className="flex items-center gap-3">
              <svg className={`w-4 h-4 text-slate-400 transition-transform ${stExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
              </svg>
              <div className="text-left">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: '#eab308' }} />
                  <h4 className="text-[11px] font-black text-slate-700 uppercase tracking-widest">Short-Term</h4>
                  <span className="text-[10px] text-slate-400 font-medium">· held ≤ 1 year · {shortTerm.length} lots</span>
                </div>
              </div>
            </div>
            <span className={`text-base font-black ${stats.stTotal >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {stats.stTotal >= 0 ? '+' : '-'}${Math.abs(stats.stTotal).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </button>
          {stExpanded && <GainTableSection title="Short-Term" data={shortTerm} isLT={false} prefix="ST" />}
        </div>

        {/* Long Term */}
        <div className="space-y-3">
          <button
            onClick={() => setLtExpanded(v => !v)}
            className="w-full p-4 bg-white rounded border border-[#D2D2D7] flex items-center justify-between hover:bg-[#F5F5F7] transition-colors"
          >
            <div className="flex items-center gap-3">
              <svg className={`w-4 h-4 text-slate-400 transition-transform ${ltExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
              </svg>
              <div className="text-left">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                  <h4 className="text-[11px] font-black text-slate-700 uppercase tracking-widest">Long-Term</h4>
                  <span className="text-[10px] text-slate-400 font-medium">· held &gt; 1 year · {longTerm.length} lots</span>
                </div>
              </div>
            </div>
            <span className={`text-base font-black ${stats.ltTotal >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {stats.ltTotal >= 0 ? '+' : '-'}${Math.abs(stats.ltTotal).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </button>
          {ltExpanded && <GainTableSection title="Long-Term" data={longTerm} isLT={true} prefix="LT" />}
        </div>
      </div>

    </div>
  );
};

export default GainsLossesView;
