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

interface TickerCalc {
  ticker: string;
  positions: OptionsPosition[];
  totalQty: number;
  retainQty: number;
  sellableQty: number;
  sellableCostBasis: number;
  sellableCurrentValue: number;
  outstandingPremium: number;
  realizedLosses: number;
  taxEstimate: number;
  totalNeeded: number;
  targetPrice: number | null;
  projectedGainPct: number | null;
  isCovered: boolean;
}

const OptionsView: React.FC = () => {
  const [positions, setPositions] = useState<OptionsPosition[]>([]);
  const [calculator, setCalculator] = useState<OptionsCalculator | null>(null);
  const [pendingRetain, setPendingRetain] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [taxRateInput, setTaxRateInput] = useState('40');
  const [expandedTickers, setExpandedTickers] = useState<Set<string>>(new Set());

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

  // Group positions by ticker
  const grouped: Record<string, OptionsPosition[]> = {};
  positions.forEach(p => {
    grouped[p.ticker] = grouped[p.ticker] || [];
    grouped[p.ticker].push(p);
  });

  const tickerCalcs: TickerCalc[] = Object.entries(grouped).map(([ticker, tickerPositions]) => {
    const totalQty = tickerPositions.reduce((s, p) => s + p.quantity, 0);
    const retainQty = tickerPositions.reduce((s, p) => s + p.retainQuantity, 0);
    const sellableQty = tickerPositions.reduce((s, p) => s + p.sellableQuantity, 0);
    const outstandingPremium = tickerPositions.reduce((s, p) => s + p.quantity * 100 * p.buyPrice, 0);
    const sellableCostBasis = tickerPositions.reduce((s, p) => s + p.sellableQuantity * 100 * p.buyPrice, 0);
    const sellableCurrentValue = tickerPositions.reduce((s, p) => s + p.sellableQuantity * 100 * p.currentPrice, 0);
    const realizedLosses = calculator?.realizedLosses ?? 0;

    const sellableShares = sellableQty * 100;
    const base = outstandingPremium + realizedLosses;

    let targetPrice: number | null = null;
    let taxEstimate = 0;

    if (sellableShares > 0 && taxRate < 1) {
      targetPrice = (base - taxRate * sellableCostBasis) / (sellableShares * (1 - taxRate));
      if (targetPrice !== null && targetPrice * sellableShares > sellableCostBasis) {
        taxEstimate = taxRate * (targetPrice * sellableShares - sellableCostBasis);
      }
    }

    const totalNeeded = base + taxEstimate;
    const avgBuyPrice = sellableShares > 0 ? sellableCostBasis / sellableShares : 0;
    const projectedGainPct = avgBuyPrice > 0 && targetPrice !== null
      ? (targetPrice / avgBuyPrice - 1) * 100
      : null;
    const isCovered = projectedGainPct !== null && projectedGainPct <= 0;

    return {
      ticker, positions: tickerPositions,
      totalQty, retainQty, sellableQty,
      sellableCostBasis, sellableCurrentValue,
      outstandingPremium, realizedLosses,
      taxEstimate, totalNeeded, targetPrice, projectedGainPct, isCovered,
    };
  });

  return (
    <div className="space-y-4">

      {/* Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-slate-700">Tax Rate</span>
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              value={taxRateInput}
              onChange={e => setTaxRateInput(e.target.value)}
              className="w-16 px-2 py-1 text-right border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 font-semibold text-indigo-700 bg-indigo-50"
            />
            <span className="text-slate-500 text-sm font-bold">%</span>
          </div>
          <span className="text-xs text-slate-400">Applied to projected gain from selling sellable contracts</span>
        </div>
        <button onClick={load} className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors">
          Refresh
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-slate-50/50 border-b border-slate-200">
              <th className="px-4 py-4 w-8"></th>
              <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Ticker</th>
              <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Contracts</th>
              <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Retained</th>
              <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Sellable</th>
              <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Outstanding Premium</th>
              <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Realized Losses</th>
              <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Gain to Sell</th>
              <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Target Price</th>
            </tr>
          </thead>
          <tbody>
            {tickerCalcs.map(tc => {
              const isExpanded = expandedTickers.has(tc.ticker);
              return (
                <React.Fragment key={tc.ticker}>

                  {/* Parent Row */}
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
                      <span className="inline-flex items-center px-2 py-1 bg-purple-100 text-purple-700 rounded-lg text-[10px] font-bold uppercase tracking-tight">
                        {tc.ticker}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right font-bold text-slate-800 text-sm">{fmt(tc.totalQty, 0)}</td>
                    <td className="px-4 py-4 text-right font-medium text-slate-600 text-sm">{fmt(tc.retainQty, 0)}</td>
                    <td className="px-4 py-4 text-right font-medium text-slate-600 text-sm">{fmt(tc.sellableQty, 0)}</td>
                    <td className="px-4 py-4 text-right font-bold text-slate-900 text-sm">{fmtCurrency(tc.outstandingPremium)}</td>
                    <td className="px-4 py-4 text-right font-bold text-rose-600 text-sm">{fmtCurrency(tc.realizedLosses)}</td>
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

                  {/* Sub-header row */}
                  {isExpanded && (
                    <tr className="bg-indigo-100/60 border-t border-indigo-200/60">
                      <td></td>
                      <td className="px-4 py-2 text-[9px] font-black text-indigo-500 uppercase tracking-widest">Brokerage</td>
                      <td className="px-4 py-2 text-[9px] font-black text-indigo-500 uppercase tracking-widest text-right">Buy Date</td>
                      <td className="px-4 py-2 text-[9px] font-black text-indigo-500 uppercase tracking-widest text-right">Retain</td>
                      <td className="px-4 py-2 text-[9px] font-black text-indigo-500 uppercase tracking-widest text-right">Sellable</td>
                      <td className="px-4 py-2 text-[9px] font-black text-indigo-500 uppercase tracking-widest text-right">Buy Price</td>
                      <td className="px-4 py-2 text-[9px] font-black text-indigo-500 uppercase tracking-widest text-right">Current Price</td>
                      <td className="px-4 py-2 text-[9px] font-black text-indigo-500 uppercase tracking-widest text-right">Unrealized</td>
                      <td></td>
                    </tr>
                  )}

                  {/* Expanded Lot Sub-rows */}
                  {isExpanded && tc.positions.map(pos => (
                    <tr key={pos.id} className="bg-indigo-50/40 border-t border-indigo-100/60">
                      <td className="px-4 py-3">
                        <div className="flex justify-center">
                          <div className="w-px h-full min-h-[20px] bg-slate-200"></div>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 pl-2">
                          <div className="w-3 h-px bg-slate-300 shrink-0"></div>
                          <span className="text-xs text-slate-500 font-medium">{pos.brokerage}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${pos.isLongTerm ? 'bg-indigo-100 text-indigo-700' : 'bg-amber-100 text-amber-700'}`}>
                            {pos.isLongTerm ? 'LT' : 'ST'}
                          </span>
                        </div>
                      </td>
                      {/* Buy Date in Contracts column */}
                      <td className="px-4 py-3 text-right text-xs text-slate-500 font-medium">
                        {new Date(pos.buyDate).toLocaleDateString('en-CA')}
                      </td>
                      {/* Retain input in Retained column */}
                      <td className="px-4 py-3 text-right">
                        <input
                          type="number"
                          min={0}
                          max={pos.quantity}
                          step={1}
                          value={pendingRetain[pos.id] ?? pos.retainQuantity}
                          onChange={e => handleRetainChange(pos.id, e.target.value)}
                          onBlur={() => handleRetainSave(pos)}
                          onKeyDown={e => e.key === 'Enter' && handleRetainSave(pos)}
                          className="w-20 px-2 py-1 text-right border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-indigo-50 font-semibold text-indigo-700"
                        />
                      </td>
                      {/* Sellable qty */}
                      <td className="px-4 py-3 text-right text-xs font-medium text-slate-700">
                        {saving === pos.id ? <span className="text-slate-400">...</span> : fmt(pos.sellableQuantity, 0)}
                      </td>
                      {/* Buy Price in Outstanding Premium column */}
                      <td className="px-4 py-3 text-right text-xs text-slate-500">
                        <div>{fmtCurrency(pos.buyPrice)}<span className="text-slate-400 ml-0.5">/contract</span></div>
                        <div className="text-slate-400">{fmtCurrency(pos.quantity * 100 * pos.buyPrice)} total</div>
                      </td>
                      {/* Current Price in Realized Losses column */}
                      <td className="px-4 py-3 text-right text-xs text-slate-500">
                        {fmtCurrency(pos.currentPrice)}
                      </td>
                      {/* Unrealized Gain in Gain to Sell column */}
                      <td className={`px-4 py-3 text-right text-xs font-semibold ${pos.unrealizedGain >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {pos.unrealizedGain >= 0 ? '+' : '-'}{fmtCurrency(pos.unrealizedGain)}
                      </td>
                      {/* Save button in Target Price column */}
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => handleRetainSave(pos)}
                          disabled={saving === pos.id}
                          className="text-xs px-2 py-1 bg-indigo-600 text-white rounded-lg font-semibold disabled:opacity-40 hover:bg-indigo-700 transition-colors"
                        >
                          Save
                        </button>
                      </td>
                    </tr>
                  ))}

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
