import React, { useEffect, useState, useCallback } from 'react';
import {
  OptionsPosition,
  OptionsCalculator,
  fetchOptionsPositions,
  fetchOptionsCalculator,
  updateOptionsRetain,
} from '../services/apiService';

const fmt = (n: number, decimals = 2) =>
  n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

const fmtCurrency = (n: number) => `$${fmt(Math.abs(n))}`;

interface BrokerageGroup {
  brokerage: string;
  totalQty: number;
  retainQty: number;
  sellableQty: number;
  avgBuyPrice: number;
  totalValue: number;
  avgCurrentPrice: number;
  marketValue: number;
  unrealizedGain: number;
  positions: OptionsPosition[];
}

interface TickerCalc {
  ticker: string;
  brokerageGroups: BrokerageGroup[];
  totalQty: number;
  retainQty: number;
  sellableQty: number;
  avgBuyPrice: number;
  totalValue: number;
  avgCurrentPrice: number;
  marketValue: number;
  unrealizedGain: number;
  sellableCostBasis: number;
  realizedLosses: number;
  targetPrice: number | null;
  projectedGainPct: number | null;
  isCovered: boolean;
}

interface OptionsViewProps {
  selectedBrokerages?: string[];
  selectedTickers?: string[];
}

const OptionsView: React.FC<OptionsViewProps> = ({ selectedBrokerages = [], selectedTickers = [] }) => {
  const [positions, setPositions] = useState<OptionsPosition[]>([]);
  const [calculator, setCalculator] = useState<OptionsCalculator | null>(null);
  const [pendingRetain, setPendingRetain] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [taxRateInput, setTaxRateInput] = useState('40');
  const [expandedTickers, setExpandedTickers] = useState<Set<string>>(new Set());
  const [expandedBrokerages, setExpandedBrokerages] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [pos, calc] = await Promise.all([fetchOptionsPositions(), fetchOptionsCalculator()]);
      setPositions(pos);
      setCalculator(calc);
      const init: Record<number, string> = {};
      pos.forEach(p => { init[p.id] = String(p.retainQuantity); });
      setPendingRetain(init);
    } catch {
      setError('Failed to load options data. Make sure you have open options positions.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRetainChange = (id: number, val: string) =>
    setPendingRetain(prev => ({ ...prev, [id]: val }));

  const handleRetainSave = async (pos: OptionsPosition) => {
    const val = parseFloat(pendingRetain[pos.id] ?? '0');
    if (isNaN(val) || val < 0 || val > pos.quantity) return;
    setSaving(pos.id);
    try {
      await updateOptionsRetain(pos.brokerage, pos.ticker, pos.buyDate, val);
      await load();
    } finally {
      setSaving(null);
    }
  };

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

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-slate-400 text-sm font-medium">
      Loading options data...
    </div>
  );

  if (error) return (
    <div className="p-6 bg-rose-50 border border-rose-100 rounded-2xl text-rose-600 text-sm font-medium">
      {error}
    </div>
  );

  if (positions.length === 0) return (
    <div className="p-8 text-center text-slate-400 text-sm">No open options positions found.</div>
  );

  const taxRate = Math.max(0, Math.min(100, parseFloat(taxRateInput) || 0)) / 100;

  // Apply brokerage + ticker filters
  const filteredPositions = positions.filter(p => {
    const matchesBrokerage = selectedBrokerages.length === 0 || selectedBrokerages.includes(p.brokerage);
    const matchesTicker = selectedTickers.length === 0 || selectedTickers.includes(p.ticker);
    return matchesBrokerage && matchesTicker;
  });

  if (filteredPositions.length === 0) return (
    <div className="p-8 text-center text-slate-400 text-sm">No options positions match the selected filters.</div>
  );

  // Group positions by ticker
  const grouped: Record<string, OptionsPosition[]> = {};
  filteredPositions.forEach(p => {
    grouped[p.ticker] = grouped[p.ticker] || [];
    grouped[p.ticker].push(p);
  });

  const tickerCalcs: TickerCalc[] = Object.entries(grouped).map(([ticker, tickerPositions]) => {
    const totalQty = tickerPositions.reduce((s, p) => s + p.quantity, 0);
    const retainQty = tickerPositions.reduce((s, p) => s + p.retainQuantity, 0);
    const sellableQty = tickerPositions.reduce((s, p) => s + p.sellableQuantity, 0);
    const totalValue = tickerPositions.reduce((s, p) => s + p.quantity * 100 * p.buyPrice, 0);
    const marketValue = tickerPositions.reduce((s, p) => s + p.quantity * 100 * p.currentPrice, 0);
    const sellableCostBasis = tickerPositions.reduce((s, p) => s + p.sellableQuantity * 100 * p.buyPrice, 0);
    const avgBuyPrice = totalQty > 0 ? totalValue / (totalQty * 100) : 0;
    const avgCurrentPrice = totalQty > 0 ? marketValue / (totalQty * 100) : 0;
    const unrealizedGain = marketValue - totalValue;
    const realizedLosses = calculator?.realizedLosses ?? 0;

    const sellableShares = sellableQty * 100;
    const base = totalValue + realizedLosses;

    let targetPrice: number | null = null;
    if (sellableShares > 0 && taxRate < 1) {
      targetPrice = (base - taxRate * sellableCostBasis) / (sellableShares * (1 - taxRate));
    }

    const projectedGainPct = avgBuyPrice > 0 && targetPrice !== null
      ? (targetPrice / avgBuyPrice - 1) * 100
      : null;
    const isCovered = projectedGainPct !== null && projectedGainPct <= 0;

    // Build brokerage sub-groups
    const brokerageMap: Record<string, OptionsPosition[]> = {};
    tickerPositions.forEach(p => {
      brokerageMap[p.brokerage] = brokerageMap[p.brokerage] || [];
      brokerageMap[p.brokerage].push(p);
    });
    const brokerageGroups: BrokerageGroup[] = Object.entries(brokerageMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([brokerage, bPos]) => {
        const bTotalQty = bPos.reduce((s, p) => s + p.quantity, 0);
        const bTotalValue = bPos.reduce((s, p) => s + p.quantity * 100 * p.buyPrice, 0);
        const bMarketValue = bPos.reduce((s, p) => s + p.quantity * 100 * p.currentPrice, 0);
        return {
          brokerage,
          totalQty: bTotalQty,
          retainQty: bPos.reduce((s, p) => s + p.retainQuantity, 0),
          sellableQty: bPos.reduce((s, p) => s + p.sellableQuantity, 0),
          avgBuyPrice: bTotalQty > 0 ? bTotalValue / (bTotalQty * 100) : 0,
          totalValue: bTotalValue,
          avgCurrentPrice: bTotalQty > 0 ? bMarketValue / (bTotalQty * 100) : 0,
          marketValue: bMarketValue,
          unrealizedGain: bMarketValue - bTotalValue,
          positions: bPos,
        };
      });

    return {
      ticker, brokerageGroups,
      totalQty, retainQty, sellableQty,
      avgBuyPrice, totalValue, avgCurrentPrice, marketValue, unrealizedGain,
      sellableCostBasis, realizedLosses,
      targetPrice, projectedGainPct, isCovered,
    };
  });

  return (
    <div className="space-y-4">

      {/* Toolbar */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-slate-700">Tax Rate</span>
          <div className="flex items-center gap-1">
            <input
              type="number" min={0} max={100} step={1}
              value={taxRateInput}
              onChange={e => setTaxRateInput(e.target.value)}
              className="w-16 px-2 py-1 text-right border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 font-semibold text-indigo-700 bg-indigo-50"
            />
            <span className="text-slate-500 text-sm font-bold">%</span>
          </div>
          <span className="text-xs text-slate-400">Applied to projected gain from selling sellable contracts</span>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-slate-50/50 border-b border-slate-200">
              <th className="px-4 py-4 w-8">
                <button
                  onClick={() => { if (expandedTickers.size > 0) { setExpandedTickers(new Set()); setExpandedBrokerages(new Set()); } else setExpandedTickers(new Set(tickerCalcs.map(t => t.ticker))); }}
                  className="w-6 h-6 flex items-center justify-center rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all"
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
              <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Ticker</th>
              <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right whitespace-nowrap">Contracts</th>
              <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right whitespace-nowrap">Avg Price</th>
              <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right whitespace-nowrap">Total Value</th>
              <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right whitespace-nowrap">Current Price</th>
              <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right whitespace-nowrap">Market Value</th>
              <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right whitespace-nowrap">Unrealized</th>
              <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right whitespace-nowrap">Retained</th>
              <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right whitespace-nowrap">Sellable</th>
              <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right whitespace-nowrap">Gain to Sell</th>
              <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right whitespace-nowrap">Target Price</th>
            </tr>
          </thead>
          <tbody>
            {tickerCalcs.map(tc => {
              const isExpanded = expandedTickers.has(tc.ticker);
              return (
                <React.Fragment key={tc.ticker}>

                  {/* Level 1 — Ticker */}
                  <tr className={`hover:bg-slate-50 transition-colors group border-t border-slate-100 ${isExpanded ? 'bg-slate-50/70' : ''}`}>
                    <td className="px-4 py-4">
                      <button
                        onClick={() => toggleTicker(tc.ticker)}
                        className="w-6 h-6 flex items-center justify-center rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all"
                      >
                        <svg className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    </td>
                    <td className="px-4 py-4">
                      <span className="inline-flex items-center px-2 py-1 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-bold uppercase tracking-tight">
                        {tc.ticker}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right font-bold text-slate-800 text-sm">{fmt(tc.totalQty, 0)}</td>
                    <td className="px-4 py-4 text-right text-sm text-slate-500 font-medium">{fmtCurrency(tc.avgBuyPrice)}</td>
                    <td className="px-4 py-4 text-right font-black text-slate-900 text-sm">{fmtCurrency(tc.totalValue)}</td>
                    <td className="px-4 py-4 text-right text-sm text-slate-500 font-medium">{fmtCurrency(tc.avgCurrentPrice)}</td>
                    <td className="px-4 py-4 text-right font-black text-slate-900 text-sm">{fmtCurrency(tc.marketValue)}</td>
                    <td className="px-4 py-4 text-right">
                      <div className={`text-sm font-black ${tc.unrealizedGain >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {tc.unrealizedGain >= 0 ? '+' : '-'}{fmtCurrency(tc.unrealizedGain)}
                      </div>
                      {tc.avgBuyPrice > 0 && (
                        <div className={`text-xs font-bold ${tc.unrealizedGain >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                          {tc.unrealizedGain >= 0 ? '+' : ''}{((tc.avgCurrentPrice - tc.avgBuyPrice) / tc.avgBuyPrice * 100).toFixed(1)}%
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-4 text-right font-medium text-slate-600 text-sm">{fmt(tc.retainQty, 0)}</td>
                    <td className="px-4 py-4 text-right font-medium text-slate-600 text-sm">{fmt(tc.sellableQty, 0)}</td>
                    <td className="px-4 py-4 text-right">
                      {tc.projectedGainPct !== null ? (
                        <span className={`font-bold text-sm ${tc.isCovered ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {tc.isCovered ? '✓ Covered' : `+${fmt(tc.projectedGainPct)}%`}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">No sellable</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-right">
                      {tc.targetPrice !== null && !tc.isCovered ? (
                        <span className="font-bold text-indigo-700 text-sm">{fmtCurrency(tc.targetPrice)}</span>
                      ) : (
                        <span className="text-xs text-slate-300">—</span>
                      )}
                    </td>
                  </tr>

                  {/* Level 2 — Brokerage rows */}
                  {isExpanded && tc.brokerageGroups.map(bg => {
                    const brokerageKey = `${tc.ticker}::${bg.brokerage}`;
                    const isBrokerageExpanded = expandedBrokerages.has(brokerageKey);
                    return (
                      <React.Fragment key={brokerageKey}>

                        {/* Level 2 row — brokerage aggregated */}
                        <tr className={`border-t border-indigo-100 ${isBrokerageExpanded ? 'bg-indigo-50/60' : 'bg-indigo-50/30'} hover:bg-indigo-50/70 transition-colors`}>
                          <td className="pl-8 pr-4 py-3">
                            <button
                              onClick={() => toggleBrokerageRow(brokerageKey)}
                              className="w-5 h-5 flex items-center justify-center rounded-md text-indigo-300 hover:text-indigo-600 hover:bg-indigo-100 transition-all"
                            >
                              <svg className={`w-3 h-3 transition-transform ${isBrokerageExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                              </svg>
                            </button>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-tight ${
                              bg.brokerage.toLowerCase().includes('robinhood') ? 'bg-orange-100 text-orange-700' :
                              bg.brokerage.toLowerCase().includes('schwab') ? 'bg-fuchsia-100 text-fuchsia-800' :
                              'bg-slate-100 text-slate-600'
                            }`}>{bg.brokerage}</span>
                          </td>
                          <td className="px-4 py-3 text-right text-[11px] font-medium text-slate-700">{fmt(bg.totalQty, 0)}</td>
                          <td className="px-4 py-3 text-right text-[11px] text-slate-500">{fmtCurrency(bg.avgBuyPrice)}</td>
                          <td className="px-4 py-3 text-right text-[11px] font-semibold text-slate-700">{fmtCurrency(bg.totalValue)}</td>
                          <td className="px-4 py-3 text-right text-[11px] text-slate-500">{fmtCurrency(bg.avgCurrentPrice)}</td>
                          <td className="px-4 py-3 text-right text-[11px] font-semibold text-slate-700">{fmtCurrency(bg.marketValue)}</td>
                          <td className={`px-4 py-3 text-right text-[11px] font-bold ${bg.unrealizedGain >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            <div>{bg.unrealizedGain >= 0 ? '+' : '-'}{fmtCurrency(bg.unrealizedGain)}</div>
                            {bg.totalValue > 0 && <div className="text-[10px] font-bold">{bg.unrealizedGain >= 0 ? '+' : ''}{(bg.unrealizedGain / bg.totalValue * 100).toFixed(1)}%</div>}
                          </td>
                          <td className="px-4 py-3 text-right text-[11px] text-slate-500">{fmt(bg.retainQty, 0)}</td>
                          <td className="px-4 py-3 text-right text-[11px] font-semibold text-slate-700">{fmt(bg.sellableQty, 0)}</td>
                          <td></td><td></td>
                        </tr>

                        {/* Level 3 sub-header */}
                        {isBrokerageExpanded && (
                          <tr className="bg-indigo-100/60 border-t border-indigo-200/60">
                            <td></td>
                            <td className="px-4 py-1.5 text-[9px] font-black text-indigo-500 uppercase tracking-widest whitespace-nowrap">Buy Date</td>
                            <td className="px-4 py-1.5 text-[9px] font-black text-indigo-500 uppercase tracking-widest whitespace-nowrap text-right">Qty</td>
                            <td className="px-4 py-1.5 text-[9px] font-black text-indigo-500 uppercase tracking-widest whitespace-nowrap text-right">Avg Price</td>
                            <td className="px-4 py-1.5 text-[9px] font-black text-indigo-500 uppercase tracking-widest whitespace-nowrap text-right">Total Value</td>
                            <td className="px-4 py-1.5 text-[9px] font-black text-indigo-500 uppercase tracking-widest whitespace-nowrap text-right">Current Price</td>
                            <td className="px-4 py-1.5 text-[9px] font-black text-indigo-500 uppercase tracking-widest whitespace-nowrap text-right">Market Value</td>
                            <td className="px-4 py-1.5 text-[9px] font-black text-indigo-500 uppercase tracking-widest whitespace-nowrap text-right">Unrealized</td>
                            <td className="px-4 py-1.5 text-[9px] font-black text-indigo-500 uppercase tracking-widest whitespace-nowrap text-right">Retain</td>
                            <td className="px-4 py-1.5 text-[9px] font-black text-indigo-500 uppercase tracking-widest whitespace-nowrap text-right">Sellable</td>
                            <td></td>
                            <td></td>
                          </tr>
                        )}

                        {/* Level 3 — Position rows */}
                        {isBrokerageExpanded && bg.positions.map(pos => {
                          const posTotalValue = pos.quantity * 100 * pos.buyPrice;
                          const posMarketValue = pos.quantity * 100 * pos.currentPrice;
                          const posUnrealized = posMarketValue - posTotalValue;
                          return (
                            <tr key={pos.id} className="bg-indigo-50/20 border-t border-indigo-100/40">
                              <td className="px-4 py-2">
                                <div className="flex justify-center pl-4">
                                  <div className="w-px h-full min-h-[16px] bg-indigo-200"></div>
                                </div>
                              </td>
                              {/* Buy Date */}
                              <td className="px-4 py-2 text-[11px] text-slate-500 font-bold whitespace-nowrap">
                                {new Date(pos.buyDate).toLocaleDateString('en-CA')}
                              </td>
                              {/* Qty */}
                              <td className="px-4 py-2 text-right text-[11px] font-medium text-slate-700">{fmt(pos.quantity, 0)}</td>
                              {/* Avg Price (buy price per share) */}
                              <td className="px-4 py-2 text-right text-[11px] text-slate-500">{fmtCurrency(pos.buyPrice)}</td>
                              {/* Total Value */}
                              <td className="px-4 py-2 text-right text-[11px] text-slate-500">{fmtCurrency(posTotalValue)}</td>
                              {/* Current Price */}
                              <td className="px-4 py-2 text-right text-[11px] text-slate-500">{fmtCurrency(pos.currentPrice)}</td>
                              {/* Market Value */}
                              <td className="px-4 py-2 text-right text-[11px] text-slate-500">{fmtCurrency(posMarketValue)}</td>
                              {/* Unrealized */}
                              <td className={`px-4 py-2 text-right text-[11px] font-black ${posUnrealized >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                <div>{posUnrealized >= 0 ? '+' : '-'}{fmtCurrency(posUnrealized)}</div>
                                {pos.buyPrice > 0 && (
                                  <div className="text-[10px] font-bold">
                                    {posUnrealized >= 0 ? '+' : ''}{((pos.currentPrice - pos.buyPrice) / pos.buyPrice * 100).toFixed(1)}%
                                  </div>
                                )}
                              </td>
                              {/* Retain input */}
                              <td className="px-4 py-2">
                                <div className="flex justify-end">
                                  <input
                                    type="number" min={0} max={pos.quantity} step={1}
                                    value={pendingRetain[pos.id] ?? pos.retainQuantity}
                                    onChange={e => handleRetainChange(pos.id, e.target.value)}
                                    onBlur={() => handleRetainSave(pos)}
                                    onKeyDown={e => e.key === 'Enter' && handleRetainSave(pos)}
                                    className="w-20 px-2 py-0.5 text-right border border-slate-200 rounded-lg text-[11px] focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-indigo-50 font-semibold text-indigo-700 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                  />
                                </div>
                              </td>
                              {/* Sellable */}
                              <td className="px-4 py-2 text-right text-[11px] font-medium text-slate-600">
                                {saving === pos.id ? <span className="text-slate-400">...</span> : fmt(pos.sellableQuantity, 0)}
                              </td>
                              <td></td><td></td>
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

    </div>
  );
};

export default OptionsView;
