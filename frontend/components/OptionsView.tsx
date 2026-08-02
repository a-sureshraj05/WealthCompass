import React, { useEffect, useState, useCallback, useMemo } from 'react';
import TickerLogo from './TickerLogo';
import { useSyncedColumnOrder } from '../hooks/useSyncedColumnOrder';
import ColumnOrderSheet from './ColumnOrderSheet';
import { SignedValue } from './TrendIndicator';

const OPT_COL_LABELS: Record<string, string> = {
  ticker: 'Ticker', washSale: 'Wash Sale', termType: 'Term Type', totalQty: 'Total Qty',
  avgBuyPrice: 'Avg Buy Price', strikePrice: 'Strike Price', totalValue: 'Total Value',
  avgCurrentPrice: 'Avg Current Price', marketValue: 'Market Value', dailyGain: 'Daily Gain',
  dailyPct: 'Daily %', unrealizedGain: 'Unrealized Gain', unrealizedPct: 'Unrealized %',
  retainQty: 'Retain Qty', sellableQty: 'Sellable Qty', gainToSell: 'Gain To Sell',
  targetPrice: 'Target Price',
};

import { BrokerageAccount, StockHolding, UnrealizedLot, RealizedGain } from '../types';
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

type TermType = 'Long' | 'Short' | 'Mixed' | null;
// Long if held > 1 year, Short if held ≤ 1 year (from the backend isLongTerm flag,
// which encodes the >365-day rule). Aggregated rows with both terms return 'Mixed'.
const termTypeOf = (items: { isLongTerm: boolean }[]): TermType => {
  if (items.length === 0) return null;
  const hasLong = items.some(i => i.isLongTerm);
  const hasShort = items.some(i => !i.isLongTerm);
  return hasLong && hasShort ? 'Mixed' : hasLong ? 'Long' : 'Short';
};
const termRank = (t: TermType) => (t === 'Long' ? 2 : t === 'Mixed' ? 1 : t === 'Short' ? 0 : -1);
const termBadge = (t: TermType) => {
  if (!t) return <span className="text-slate-300 text-xs">—</span>;
  const cls = t === 'Long' ? 'bg-[#E6EEFB] text-[#0A3E8F]'
    : t === 'Short' ? 'bg-[#E5E5EA] text-[#6E6E73]'
    : 'bg-amber-50 text-amber-700';
  return <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${cls}`}>{t}</span>;
};

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
  dailyGain: number;
  dailyPrevMV: number;
  termType: TermType;
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
  dailyGain: number;
  dailyPrevMV: number;
  sellableCostBasis: number;
  realizedLosses: number;
  targetPrice: number | null;
  projectedGainPct: number | null;
  isCovered: boolean;
  termType: TermType;
}

interface OptionsViewProps {
  selectedBrokerages?: string[];
  selectedTickers?: string[];
  selectedTerms?: ('long' | 'short')[];
  holdings?: StockHolding[];
  unrealizedGains?: UnrealizedLot[];
  realizedGains?: RealizedGain[];
  stTaxRate?: number;
  ltTaxRate?: number;
  accounts?: BrokerageAccount[];
  viewMode?: 'ticker' | 'brokerage';
  numbersVisible?: boolean;
}

const OptionsView: React.FC<OptionsViewProps> = ({ selectedBrokerages = [], selectedTickers = [], selectedTerms = [], holdings = [], unrealizedGains = [], realizedGains = [], stTaxRate = 37, ltTaxRate = 20, accounts = [], viewMode = 'ticker', numbersVisible = true }) => {
  const accountMap = useMemo(() => Object.fromEntries(accounts.map(a => [a.id, a.name])) as Record<number, string>, [accounts]);
  const [positions, setPositions] = useState<OptionsPosition[]>([]);
  const [calculator, setCalculator] = useState<OptionsCalculator | null>(null);
  const [pendingRetain, setPendingRetain] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedTickers, setExpandedTickers] = useState<Set<string>>(new Set());
  const [expandedBrokerages, setExpandedBrokerages] = useState<Set<string>>(new Set());
  const [expandedBV_L1, setExpandedBV_L1] = useState<Set<string>>(new Set());
  const [expandedBV_L2, setExpandedBV_L2] = useState<Set<string>>(new Set());
  const [expandedBV_L3, setExpandedBV_L3] = useState<Set<string>>(new Set());
  const toggleBV_L1 = (k: string) => setExpandedBV_L1(p => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const toggleBV_L2 = (k: string) => setExpandedBV_L2(p => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const toggleBV_L3 = (k: string) => setExpandedBV_L3(p => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; });
  type SortKey = 'ticker' | 'washSale' | 'termType' | 'totalQty' | 'avgBuyPrice' | 'totalValue' | 'avgCurrentPrice' | 'marketValue' | 'dailyGain' | 'dailyPct' | 'unrealizedGain' | 'unrealizedPct' | 'retainQty' | 'sellableQty' | 'targetPrice';
  type ColKey = 'ticker' | 'washSale' | 'termType' | 'totalQty' | 'avgBuyPrice' | 'strikePrice' | 'totalValue' | 'avgCurrentPrice' | 'marketValue' | 'dailyGain' | 'dailyPct' | 'unrealizedGain' | 'unrealizedPct' | 'retainQty' | 'sellableQty' | 'gainToSell' | 'targetPrice';
  const DEFAULT_COLS: ColKey[] = ['ticker','washSale','termType','totalQty','avgBuyPrice','strikePrice','totalValue','avgCurrentPrice','marketValue','dailyGain','dailyPct','unrealizedGain','unrealizedPct','retainQty','sellableQty','gainToSell','targetPrice'];
  // Server-backed so the order matches on the Mac and the phone.
  const { order: columnOrder, reorder: reorderCol, move: moveCol } =
    useSyncedColumnOrder<ColKey>('options-col-order', DEFAULT_COLS);
  const [showColSheet, setShowColSheet] = useState(false);
  const [dragCol, setDragCol] = useState<ColKey | null>(null);
  const [dragOverCol, setDragOverCol] = useState<ColKey | null>(null);
  const dragProps = (col: ColKey) => ({
    draggable: true as const,
    onDragStart: (e: React.DragEvent) => { e.dataTransfer.effectAllowed = 'move'; setDragCol(col); },
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverCol(col); },
    onDrop: (e: React.DragEvent) => { e.preventDefault(); if (dragCol) reorderCol(dragCol, col); setDragCol(null); setDragOverCol(null); },
    onDragEnd: () => { setDragCol(null); setDragOverCol(null); },
  });
  const thCls = (col: ColKey, extra = '') =>
    `px-4 py-2 text-[10px] font-black uppercase tracking-widest whitespace-nowrap select-none cursor-grab active:cursor-grabbing transition-colors ${dragOverCol === col ? 'border-l-2 border-[#0F52BA] bg-[#E6EEFB]/40' : ''} ${dragCol === col ? 'opacity-40' : ''} ${extra}`.replace(/\s+/g,' ').trim();
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc' | null>(null);
  const handleSort = (col: SortKey) => {
    if (sortKey === col) {
      if (sortDir === 'asc') setSortDir('desc');
      else if (sortDir === 'desc') { setSortKey(null); setSortDir(null); }
    } else { setSortKey(col); setSortDir('asc'); }
  };
  const SI = ({ col }: { col: SortKey }) => sortKey !== col ? null : (
    <svg className="w-3 h-3 inline ml-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      {sortDir === 'asc'
        ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
        : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />}
    </svg>
  );

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

  // prevClose keyed by brokerage::ticker::buyDate — sourced from unrealizedGains prop which
  // is always refreshed by App.tsx after sync/reprocess, unlike positions which only loads on mount.
  const prevCloseMap = useMemo(() => {
    const map: Record<string, number | null> = {};
    unrealizedGains.filter(l => (l.assetType || '').toLowerCase() === 'options').forEach(l => {
      const key = `${l.brokerage}::${l.ticker}::${l.buyDate?.slice(0, 10)}`;
      map[key] = l.prevClose ?? null;
    });
    return map;
  }, [unrealizedGains]);

  // Per-ticker wash sale summary — must be before any early returns (Rules of Hooks)
  const washSaleByTicker = useMemo(() => {
    const today = new Date();
    const result: Record<string, { type1Count: number; minDays: number; type2Count: number; lastLossDaysAgo: number | null }> = {};
    unrealizedGains.filter(l => (l.assetType || '').toLowerCase() === 'options').forEach(lot => {
      if (!result[lot.ticker]) result[lot.ticker] = { type1Count: 0, minDays: Infinity, type2Count: 0, lastLossDaysAgo: null };
      const e = result[lot.ticker];
      if (lot.wash_sale_clear_date) {
        const cd = new Date(lot.wash_sale_clear_date);
        if (cd > today) { e.type1Count++; e.minDays = Math.min(e.minDays, Math.ceil((cd.getTime() - today.getTime()) / 86400000)); }
      }
      if (lot.wash_sale_at_risk && lot.wash_sale_risk_trigger_date) {
        const triggerDaysAgo = Math.floor((today.getTime() - new Date(lot.wash_sale_risk_trigger_date).getTime()) / 86400000);
        if (triggerDaysAgo <= 30) e.type2Count++;
      }
    });
    realizedGains.forEach(g => {
      if (g.gain >= 0) return;
      const daysAgo = Math.floor((Date.now() - new Date(g.sellDate).getTime()) / 86400000);
      if (!result[g.ticker]) result[g.ticker] = { type1Count: 0, minDays: Infinity, type2Count: 0, lastLossDaysAgo: null };
      const e = result[g.ticker];
      if (e.lastLossDaysAgo === null || daysAgo < e.lastLossDaysAgo) e.lastLossDaysAgo = daysAgo;
    });
    return result;
  }, [unrealizedGains, realizedGains]);

  // Per-position wash sale flags matched by ticker + brokerage + buyDate
  const washSaleByPosition = useMemo(() => {
    const today = new Date();
    const result: Record<string, { daysToGo: number; atRisk: boolean; riskDaysAgo: number }> = {};
    unrealizedGains.filter(l => (l.assetType || '').toLowerCase() === 'options').forEach(lot => {
      const key = `${lot.ticker}::${lot.brokerage}::${lot.buyDate.slice(0, 10)}`;
      const clearDate = lot.wash_sale_clear_date ? new Date(lot.wash_sale_clear_date) : null;
      const daysToGo = clearDate && clearDate > today ? Math.ceil((clearDate.getTime() - today.getTime()) / 86400000) : 0;
      const riskDaysAgo = lot.wash_sale_at_risk && lot.wash_sale_risk_trigger_date
        ? Math.floor((today.getTime() - new Date(lot.wash_sale_risk_trigger_date).getTime()) / 86400000) : 0;
      result[key] = { daysToGo, atRisk: !!lot.wash_sale_at_risk, riskDaysAgo };
    });
    return result;
  }, [unrealizedGains]);

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
    <div className="p-6 bg-rose-50 border border-rose-100 rounded text-rose-600 text-sm font-medium">
      {error}
    </div>
  );

  if (positions.length === 0) return (
    <div className="p-8 text-center text-slate-400 text-sm">No open options positions found.</div>
  );

  // Per-position tax rate: long-term positions use the LT rate, short-term the ST rate
  // (both edited in the Gains & Losses tab). Used for the Gain-to-Sell / Target Price calc.
  const stRate = Math.max(0, Math.min(100, stTaxRate || 0)) / 100;
  const ltRate = Math.max(0, Math.min(100, ltTaxRate || 0)) / 100;
  const posRate = (p: OptionsPosition) => (p.isLongTerm ? ltRate : stRate);

  // Break-even-after-tax target price for a set of sellable positions, each taxed at its
  // own ST/LT rate. Solves: Σ[ proceedsᵢ − rateᵢ·(proceedsᵢ − costBasisᵢ) ] = base for a
  // single per-share price P, giving P = (base − Σrateᵢ·costBasisᵢ) / (shares − Σrateᵢ·sharesᵢ).
  const targetPriceFor = (posns: OptionsPosition[], base: number): number | null => {
    let sellableShares = 0, taxWeightedShares = 0, taxWeightedCostBasis = 0;
    posns.forEach(p => {
      const shares = p.sellableQuantity * 100;
      if (shares <= 0) return;
      const rate = posRate(p);
      sellableShares += shares;
      taxWeightedShares += rate * shares;
      taxWeightedCostBasis += rate * shares * p.buyPrice;
    });
    const denom = sellableShares - taxWeightedShares;
    if (sellableShares <= 0 || denom <= 0) return null;
    return (base - taxWeightedCostBasis) / denom;
  };

  // Apply brokerage + ticker filters
  const filteredPositions = positions.filter(p => {
    const matchesBrokerage = selectedBrokerages.length === 0 || selectedBrokerages.includes(p.brokerage);
    const matchesTicker = selectedTickers.length === 0 || selectedTickers.includes(p.ticker);
    const matchesTerm = selectedTerms.length === 0 || selectedTerms.includes(p.isLongTerm ? 'long' : 'short');
    return matchesBrokerage && matchesTicker && matchesTerm;
  });

  if (filteredPositions.length === 0) return (
    <div className="p-8 text-center text-slate-400 text-sm">No options positions match the selected filters.</div>
  );

  const assetTypeByTicker: Record<string, string> = {};
  holdings.forEach(h => { assetTypeByTicker[h.ticker] = h.assetType || 'Equity'; });

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

    const base = totalValue + realizedLosses;
    const targetPrice = targetPriceFor(tickerPositions, base);

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
    const _pc = (p: OptionsPosition) => prevCloseMap[`${p.brokerage}::${p.ticker}::${p.buyDate?.slice(0, 10)}`] ?? null;
    const _posDaily = (p: OptionsPosition) => { const pc = _pc(p); return pc != null ? (p.currentPrice - pc) * p.quantity * 100 : 0; };
    const _posPrevMV = (p: OptionsPosition) => { const pc = _pc(p); return pc != null ? pc * p.quantity * 100 : 0; };
    const dailyGain = tickerPositions.reduce((s, p) => s + _posDaily(p), 0);
    const dailyPrevMV = tickerPositions.reduce((s, p) => s + _posPrevMV(p), 0);

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
          dailyGain: bPos.reduce((s, p) => s + _posDaily(p), 0),
          dailyPrevMV: bPos.reduce((s, p) => s + _posPrevMV(p), 0),
          termType: termTypeOf(bPos),
          positions: bPos,
        };
      });

    return {
      ticker, brokerageGroups,
      totalQty, retainQty, sellableQty,
      avgBuyPrice, totalValue, avgCurrentPrice, marketValue, unrealizedGain, dailyGain, dailyPrevMV,
      sellableCostBasis, realizedLosses,
      targetPrice, projectedGainPct, isCovered,
      termType: termTypeOf(tickerPositions),
    };
  });

  if (sortKey && sortDir) {
    tickerCalcs.sort((a, b) => {
      const wsPriority = (ticker: string) => {
        const ws = washSaleByTicker[ticker];
        if (!ws) return 2;
        const isRed = (ws.lastLossDaysAgo !== null && ws.lastLossDaysAgo <= 30) || ws.type1Count > 0;
        if (isRed) return 0;
        if (ws.type2Count > 0) return 1;
        return 2;
      };
      let vA: any = sortKey === 'unrealizedPct' ? (a.avgBuyPrice > 0 ? (a.avgCurrentPrice - a.avgBuyPrice) / a.avgBuyPrice * 100 : 0)
        : sortKey === 'dailyPct' ? (a.dailyPrevMV > 0 ? a.dailyGain / a.dailyPrevMV : 0)
        : sortKey === 'washSale' ? wsPriority(a.ticker)
        : sortKey === 'termType' ? termRank(a.termType)
        : a[sortKey as keyof TickerCalc];
      let vB: any = sortKey === 'unrealizedPct' ? (b.avgBuyPrice > 0 ? (b.avgCurrentPrice - b.avgBuyPrice) / b.avgBuyPrice * 100 : 0)
        : sortKey === 'dailyPct' ? (b.dailyPrevMV > 0 ? b.dailyGain / b.dailyPrevMV : 0)
        : sortKey === 'washSale' ? wsPriority(b.ticker)
        : sortKey === 'termType' ? termRank(b.termType)
        : b[sortKey as keyof TickerCalc];
      if (vA === null) vA = sortDir === 'asc' ? Infinity : -Infinity;
      if (vB === null) vB = sortDir === 'asc' ? Infinity : -Infinity;
      if (typeof vA === 'string') return sortDir === 'asc' ? vA.localeCompare(vB) : vB.localeCompare(vA);
      return sortDir === 'asc' ? vA - vB : vB - vA;
    });
  }

  // ── Brokerage view data ───────────────────────────────────────────────────

  const brokerageViewCalcs = (() => {
    const bmap: Record<string, Record<string, Record<string, OptionsPosition[]>>> = {};
    filteredPositions.forEach(p => {
      const acctKey = p.account_id != null ? String(p.account_id) : '';
      if (!bmap[p.brokerage]) bmap[p.brokerage] = {};
      if (!bmap[p.brokerage][acctKey]) bmap[p.brokerage][acctKey] = {};
      if (!bmap[p.brokerage][acctKey][p.ticker]) bmap[p.brokerage][acctKey][p.ticker] = [];
      bmap[p.brokerage][acctKey][p.ticker].push(p);
    });

    return Object.keys(bmap).sort().map(brokerage => {
      const accts = Object.keys(bmap[brokerage]).sort().map(acctKey => {
        const account_id = acctKey ? parseInt(acctKey) : null;
        const tickers = Object.entries(bmap[brokerage][acctKey]).map(([ticker, positions]) => {
          const totalQty = positions.reduce((s, p) => s + p.quantity, 0);
          const totalValue = positions.reduce((s, p) => s + p.quantity * 100 * p.buyPrice, 0);
          const marketValue = positions.reduce((s, p) => s + p.quantity * 100 * p.currentPrice, 0);
          const retainQty = positions.reduce((s, p) => s + p.retainQuantity, 0);
          const sellableQty = positions.reduce((s, p) => s + p.sellableQuantity, 0);
          const avgBuyPrice = totalQty > 0 ? totalValue / (totalQty * 100) : 0;
          const avgCurrentPrice = totalQty > 0 ? marketValue / (totalQty * 100) : 0;
          const unrealizedGain = marketValue - totalValue;
          const sellableCostBasis = positions.reduce((s, p) => s + p.sellableQuantity * 100 * p.buyPrice, 0);
          const realizedLosses = calculator?.realizedLosses ?? 0;
          const targetPrice = targetPriceFor(positions, totalValue + realizedLosses);
          const projectedGainPct = avgBuyPrice > 0 && targetPrice !== null ? (targetPrice / avgBuyPrice - 1) * 100 : null;
          const _bvPc = (p: OptionsPosition) => prevCloseMap[`${p.brokerage}::${p.ticker}::${p.buyDate?.slice(0, 10)}`] ?? null;
          const bvDailyGain = positions.reduce((s, p) => { const pc = _bvPc(p); return s + (pc != null ? (p.currentPrice - pc) * p.quantity * 100 : 0); }, 0);
          const bvDailyPrevMV = positions.reduce((s, p) => { const pc = _bvPc(p); return s + (pc != null ? pc * p.quantity * 100 : 0); }, 0);
          return { ticker, positions, totalQty, retainQty, sellableQty, avgBuyPrice, totalValue, avgCurrentPrice, marketValue, unrealizedGain, dailyGain: bvDailyGain, dailyPrevMV: bvDailyPrevMV, sellableCostBasis, realizedLosses, targetPrice, projectedGainPct, isCovered: projectedGainPct !== null && projectedGainPct <= 0, termType: termTypeOf(positions), brokerageGroups: [] };
        }).sort((a, b) => a.ticker.localeCompare(b.ticker));
        const acctMV = tickers.reduce((s, t) => s + t.marketValue, 0);
        const acctCost = tickers.reduce((s, t) => s + t.totalValue, 0);
        return { account_id, totalValue: acctCost, marketValue: acctMV, unrealizedGain: acctMV - acctCost, tickers };
      });
      const brkMV = accts.reduce((s, a) => s + a.marketValue, 0);
      const brkCost = accts.reduce((s, a) => s + a.totalValue, 0);
      return { brokerage, totalValue: brkCost, marketValue: brkMV, unrealizedGain: brkMV - brkCost, accounts: accts };
    });
  })();

  type BVBrokerageRow = (typeof brokerageViewCalcs)[0];
  type BVAccountRow = BVBrokerageRow['accounts'][0];

  const brokerageBadgeCls = (b: string) =>
    b.toLowerCase().includes('robinhood') ? 'bg-[#0F52BA] text-white'
    : b.toLowerCase().includes('schwab') ? 'bg-[#6E6E73] text-white'
    : b.toLowerCase().includes('fidelity') ? 'bg-[#417505] text-white'
    : 'bg-[#E5E5EA] text-[#6E6E73]';

  const parseOCCStrike = (symbol?: string | null): number | null => {
    if (!symbol || symbol.length < 15) return null;
    const n = parseInt(symbol.slice(-8), 10);
    return isNaN(n) ? null : n / 1000;
  };

  // ── Column render helpers ─────────────────────────────────────────────────

  const renderTh = (col: ColKey) => {
    const dp = dragProps(col);
    switch (col) {
      case 'ticker':        return <th key={col} {...dp} className={thCls(col, `hover:text-[#0F52BA] ${sortKey==='ticker'?'text-[#0F52BA]':'text-slate-400'}`)} onClick={() => handleSort('ticker')}>Ticker <SI col="ticker" /></th>;
      case 'washSale':      return <th key={col} {...dp} className={thCls(col, `hover:text-[#0F52BA] ${sortKey==='washSale'?'text-[#0F52BA]':'text-slate-400'}`)} onClick={() => handleSort('washSale')}>Wash Sale <SI col="washSale" /></th>;
      case 'termType':      return <th key={col} {...dp} className={thCls(col, `hover:text-[#0F52BA] ${sortKey==='termType'?'text-[#0F52BA]':'text-slate-400'}`)} onClick={() => handleSort('termType')}>Term Type <SI col="termType" /></th>;
      case 'totalQty':      return <th key={col} {...dp} className={thCls(col, `hover:text-[#0F52BA] text-right ${sortKey==='totalQty'?'text-[#0F52BA]':'text-slate-400'}`)} onClick={() => handleSort('totalQty')}><div className="flex items-center justify-end">Contracts <SI col="totalQty" /></div></th>;
      case 'avgBuyPrice':   return <th key={col} {...dp} className={thCls(col, `hover:text-[#0F52BA] text-right ${sortKey==='avgBuyPrice'?'text-[#0F52BA]':'text-slate-400'}`)} onClick={() => handleSort('avgBuyPrice')}><div className="flex items-center justify-end">Avg Price <SI col="avgBuyPrice" /></div></th>;
      case 'strikePrice':   return <th key={col} {...dp} className={thCls(col, 'text-slate-400 text-right')}>Strike</th>;
      case 'totalValue':    return <th key={col} {...dp} className={thCls(col, `hover:text-[#0F52BA] text-right ${sortKey==='totalValue'?'text-[#0F52BA]':'text-slate-400'}`)} onClick={() => handleSort('totalValue')}><div className="flex items-center justify-end">Total Value <SI col="totalValue" /></div></th>;
      case 'avgCurrentPrice':return <th key={col} {...dp} className={thCls(col, `hover:text-[#0F52BA] text-right ${sortKey==='avgCurrentPrice'?'text-[#0F52BA]':'text-slate-400'}`)} onClick={() => handleSort('avgCurrentPrice')}><div className="flex items-center justify-end">Current Price <SI col="avgCurrentPrice" /></div></th>;
      case 'marketValue':   return <th key={col} {...dp} className={thCls(col, `hover:text-[#0F52BA] text-right ${sortKey==='marketValue'?'text-[#0F52BA]':'text-slate-400'}`)} onClick={() => handleSort('marketValue')}><div className="flex items-center justify-end">Market Value <SI col="marketValue" /></div></th>;
      case 'dailyGain':     return <th key={col} {...dp} className={thCls(col, `hover:text-[#0F52BA] text-right ${sortKey==='dailyGain'?'text-[#0F52BA]':'text-slate-400'}`)} onClick={() => handleSort('dailyGain')}><div className="flex items-center justify-end">Daily $ <SI col="dailyGain" /></div></th>;
      case 'dailyPct':      return <th key={col} {...dp} className={thCls(col, `hover:text-[#0F52BA] text-right ${sortKey==='dailyPct'?'text-[#0F52BA]':'text-slate-400'}`)} onClick={() => handleSort('dailyPct')}><div className="flex items-center justify-end">Daily % <SI col="dailyPct" /></div></th>;
      case 'unrealizedGain':return <th key={col} {...dp} className={thCls(col, `hover:text-[#0F52BA] text-right ${sortKey==='unrealizedGain'?'text-[#0F52BA]':'text-slate-400'}`)} onClick={() => handleSort('unrealizedGain')}><div className="flex items-center justify-end">Overall $ <SI col="unrealizedGain" /></div></th>;
      case 'unrealizedPct': return <th key={col} {...dp} className={thCls(col, `hover:text-[#0F52BA] text-right ${sortKey==='unrealizedPct'?'text-[#0F52BA]':'text-slate-400'}`)} onClick={() => handleSort('unrealizedPct')}><div className="flex items-center justify-end">Overall % <SI col="unrealizedPct" /></div></th>;
      case 'retainQty':     return <th key={col} {...dp} className={thCls(col, `hover:text-[#0F52BA] text-right ${sortKey==='retainQty'?'text-[#0F52BA]':'text-slate-400'}`)} onClick={() => handleSort('retainQty')}><div className="flex items-center justify-end">Retained <SI col="retainQty" /></div></th>;
      case 'sellableQty':   return <th key={col} {...dp} className={thCls(col, `hover:text-[#0F52BA] text-right ${sortKey==='sellableQty'?'text-[#0F52BA]':'text-slate-400'}`)} onClick={() => handleSort('sellableQty')}><div className="flex items-center justify-end">Sellable <SI col="sellableQty" /></div></th>;
      case 'gainToSell':    return <th key={col} {...dp} className={thCls(col, 'text-slate-400 text-right')}>Gain to Sell</th>;
      case 'targetPrice':   return <th key={col} {...dp} className={thCls(col, `hover:text-[#0F52BA] text-right ${sortKey==='targetPrice'?'text-[#0F52BA]':'text-slate-400'}`)} onClick={() => handleSort('targetPrice')}><div className="flex items-center justify-end">Target Price <SI col="targetPrice" /></div></th>;
      default: return <th key={col} />;
    }
  };

  const renderL1 = (col: ColKey, tc: TickerCalc, compact = false) => {
    const sz = compact ? 'text-[11px]' : 'text-sm';
    switch (col) {
      case 'ticker': return <td key={col} className="px-4 py-2"><div className="flex items-center gap-2"><TickerLogo ticker={tc.ticker} size={compact ? 24 : 32} assetType={assetTypeByTicker[tc.ticker]} /><span className={`${compact ? 'text-[11px]' : 'text-xs'} font-bold text-[#1D1D1F] uppercase tracking-tight`}>{tc.ticker}</span></div></td>;
      case 'washSale': return <td key={col} className="px-4 py-2">{(() => { const ws = washSaleByTicker[tc.ticker]; const isRed = ws && ((ws.lastLossDaysAgo !== null && ws.lastLossDaysAgo <= 30) || ws.type1Count > 0); const isYellow = !isRed && ws && ws.type2Count > 0; if (isRed) { const detail = ws.type1Count > 0 && ws.minDays !== Infinity ? `${ws.minDays}d to go` : ws.lastLossDaysAgo !== null ? `loss ${ws.lastLossDaysAgo}d ago` : ''; return <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" /><div><p className="text-[10px] font-black text-rose-600">Active</p>{detail && <p className="text-[9px] text-rose-400">{detail}</p>}</div></div>; } if (isYellow) return <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" /><div><p className="text-[10px] font-black text-amber-600">Caution</p><p className="text-[9px] text-amber-400">don't sell at loss</p></div></div>; return <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" /><p className="text-[10px] font-medium text-emerald-600">Clear</p></div>; })()}</td>;
      case 'termType':       return <td key={col} className="px-4 py-2">{termBadge(tc.termType)}</td>;
      case 'totalQty':       return <td key={col} className={`px-4 py-2 text-right font-bold text-slate-800 ${sz}`}>{fmt(tc.totalQty, 0)}</td>;
      case 'avgBuyPrice':    return <td key={col} className={`px-4 py-2 text-right ${sz} text-slate-500 font-medium`}>{fmtCurrency(tc.avgBuyPrice)}</td>;
      case 'strikePrice':    return <td key={col} />;
      case 'totalValue':     return <td key={col} className={`px-4 py-2 text-right font-black text-slate-900 ${sz}`}>{fmtCurrency(tc.totalValue)}</td>;
      case 'avgCurrentPrice':return <td key={col} className={`px-4 py-2 text-right ${sz} text-slate-500 font-medium`}>{fmtCurrency(tc.avgCurrentPrice)}</td>;
      case 'marketValue':    return <td key={col} className={`px-4 py-2 text-right font-black text-slate-900 ${sz}`}>{fmtCurrency(tc.marketValue)}</td>;
      case 'dailyGain': {
        if (tc.dailyPrevMV === 0) return <td key={col} className={`px-4 py-2 text-right ${sz} text-slate-300`}>—</td>;
        const dg = tc.dailyGain;
        return <td key={col} className={`px-4 py-2 text-right ${sz} font-black`}><SignedValue value={dg} format={v => fmtCurrency(v)} arrowClass="w-2.5 h-2.5" /></td>;
      }
      case 'dailyPct': {
        const dp2 = tc.dailyPrevMV > 0 ? (tc.dailyGain / tc.dailyPrevMV) * 100 : null;
        return <td key={col} className={`px-4 py-2 text-right ${sz} font-bold ${dp2 == null ? 'text-slate-300' : ''}`}>{dp2 != null ? <SignedValue value={dp2} format={() => `${Math.abs(dp2).toFixed(2)}%`} arrowClass="w-2.5 h-2.5" /> : '—'}</td>;
      }
      case 'unrealizedGain': return <td key={col} className={`px-4 py-2 text-right ${sz} font-black`}><SignedValue value={tc.unrealizedGain} format={v => fmtCurrency(v)} arrowClass="w-2.5 h-2.5" /></td>;
      case 'unrealizedPct':  return <td key={col} className={`px-4 py-2 text-right ${sz} font-bold`}>{tc.avgBuyPrice > 0 ? <SignedValue value={tc.unrealizedGain} format={() => `${Math.abs((tc.avgCurrentPrice - tc.avgBuyPrice) / tc.avgBuyPrice * 100).toFixed(2)}%`} arrowClass="w-2.5 h-2.5" /> : <span className="text-slate-300">—</span>}</td>;
      case 'retainQty':      return <td key={col} className={`px-4 py-2 text-right font-medium text-slate-600 ${sz}`}>{fmt(tc.retainQty, 0)}</td>;
      case 'sellableQty':    return <td key={col} className={`px-4 py-2 text-right font-medium text-slate-600 ${sz}`}>{fmt(tc.sellableQty, 0)}</td>;
      // Not a signed gain: the colour here means covered vs not covered, and the
      // uncovered case deliberately shows a positive percentage in red (how far
      // it still has to move). An arrow would read as direction and invert that.
      case 'gainToSell':     return <td key={col} className="px-4 py-2 text-right">{tc.projectedGainPct !== null ? <span className={`font-bold ${sz} ${tc.isCovered ? 'text-emerald-700' : 'text-rose-600'}`}>{tc.isCovered ? '✓ Covered' : `+${fmt(tc.projectedGainPct)}%`}</span> : <span className="text-xs text-slate-400">No sellable</span>}</td>;
      case 'targetPrice':    return <td key={col} className="px-4 py-2 text-right">{tc.targetPrice !== null && !tc.isCovered ? <span className={`font-bold text-[#0A3E8F] ${sz}`}>{fmtCurrency(tc.targetPrice)}</span> : <span className="text-xs text-slate-300">—</span>}</td>;
      default: return <td key={col} />;
    }
  };

  const renderL2 = (col: ColKey, bg: BrokerageGroup) => {
    switch (col) {
      case 'ticker': return <td key={col} className="px-4 py-2"><span className={`inline-flex items-center px-2 py-1 rounded text-[10px] font-bold uppercase tracking-tight ${bg.brokerage.toLowerCase().includes('robinhood') ? 'bg-[#0F52BA] text-white' : bg.brokerage.toLowerCase().includes('schwab') ? 'bg-[#6E6E73] text-white' : 'bg-[#E5E5EA] text-[#6E6E73]'}`}>{bg.brokerage}</span></td>;
      case 'washSale':      return <td key={col} />;
      case 'termType':      return <td key={col} className="px-4 py-2">{termBadge(bg.termType)}</td>;
      case 'totalQty':      return <td key={col} className="px-4 py-2 text-right text-[11px] font-medium text-slate-700">{fmt(bg.totalQty, 0)}</td>;
      case 'avgBuyPrice':   return <td key={col} className="px-4 py-2 text-right text-[11px] text-slate-500">{fmtCurrency(bg.avgBuyPrice)}</td>;
      case 'strikePrice':   return <td key={col} />;
      case 'totalValue':    return <td key={col} className="px-4 py-2 text-right text-[11px] font-semibold text-slate-700">{fmtCurrency(bg.totalValue)}</td>;
      case 'avgCurrentPrice':return <td key={col} className="px-4 py-2 text-right text-[11px] text-slate-500">{fmtCurrency(bg.avgCurrentPrice)}</td>;
      case 'marketValue':   return <td key={col} className="px-4 py-2 text-right text-[11px] font-semibold text-slate-700">{fmtCurrency(bg.marketValue)}</td>;
      case 'dailyGain': {
        if (bg.dailyPrevMV === 0) return <td key={col} className="px-4 py-2 text-right text-[11px] text-slate-300">—</td>;
        const dg = bg.dailyGain;
        return <td key={col} className="px-4 py-2 text-right text-[11px] font-bold"><SignedValue value={dg} format={v => fmtCurrency(v)} arrowClass="w-2.5 h-2.5" /></td>;
      }
      case 'dailyPct': {
        const dp2 = bg.dailyPrevMV > 0 ? (bg.dailyGain / bg.dailyPrevMV) * 100 : null;
        return <td key={col} className={`px-4 py-2 text-right text-[11px] font-bold ${dp2 == null ? 'text-slate-300' : ''}`}>{dp2 != null ? <SignedValue value={dp2} format={() => `${Math.abs(dp2).toFixed(2)}%`} arrowClass="w-2.5 h-2.5" /> : '—'}</td>;
      }
      case 'unrealizedGain':return <td key={col} className="px-4 py-2 text-right text-[11px] font-bold"><SignedValue value={bg.unrealizedGain} format={v => fmtCurrency(v)} arrowClass="w-2.5 h-2.5" /></td>;
      case 'unrealizedPct': return <td key={col} className="px-4 py-2 text-right text-[11px] font-bold">{bg.totalValue > 0 ? <SignedValue value={bg.unrealizedGain} format={() => `${Math.abs(bg.unrealizedGain / bg.totalValue * 100).toFixed(2)}%`} arrowClass="w-2.5 h-2.5" /> : <span className="text-slate-300">—</span>}</td>;
      case 'retainQty':     return <td key={col} className="px-4 py-2 text-right text-[11px] text-slate-500">{fmt(bg.retainQty, 0)}</td>;
      case 'sellableQty':   return <td key={col} className="px-4 py-2 text-right text-[11px] font-semibold text-slate-700">{fmt(bg.sellableQty, 0)}</td>;
      case 'gainToSell':    return <td key={col} />;
      case 'targetPrice':   return <td key={col} />;
      default: return <td key={col} />;
    }
  };

  const renderL3Header = (col: ColKey) => {
    const s = (label: string, align: 'left'|'right' = 'right') => <td key={col} className={`px-4 py-1.5 text-[9px] font-black text-[#6E6E73] uppercase tracking-widest whitespace-nowrap text-${align}`}>{label}</td>;
    switch (col) {
      case 'ticker':        return s('Buy Date', 'left');
      case 'washSale':      return s('Wash Sale', 'left');
      case 'termType':      return s('Term Type', 'left');
      case 'totalQty':      return s('Qty');
      case 'avgBuyPrice':   return s('Avg Price');
      case 'strikePrice':   return s('Strike');
      case 'totalValue':    return s('Total Value');
      case 'avgCurrentPrice':return s('Current Price');
      case 'marketValue':   return s('Market Value');
      case 'dailyGain':     return s('Daily $');
      case 'dailyPct':      return s('Daily %');
      case 'unrealizedGain':return s('Overall $');
      case 'unrealizedPct': return s('Overall %');
      case 'retainQty':     return s('Retain');
      case 'sellableQty':   return s('Sellable');
      case 'gainToSell':    return <td key={col} />;
      case 'targetPrice':   return <td key={col} />;
      default: return <td key={col} />;
    }
  };

  const renderL3 = (col: ColKey, pos: OptionsPosition, posTotalValue: number, posMarketValue: number, posUnrealized: number) => {
    switch (col) {
      case 'ticker': return <td key={col} className="px-4 py-2 text-[11px] text-slate-500 font-bold whitespace-nowrap">{new Date(pos.buyDate).toLocaleDateString('en-CA')}</td>;
      case 'washSale': return <td key={col} className="px-4 py-2">{(() => { const key = `${pos.ticker}::${pos.brokerage}::${pos.buyDate.slice(0,10)}`; const ws = washSaleByPosition[key]; if (ws?.daysToGo > 0) return <div className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" /><div><p className="text-[9px] font-black text-rose-600">Active</p><p className="text-[9px] text-rose-400">{ws.daysToGo}d to go</p></div></div>; if (ws?.atRisk && ws.riskDaysAgo <= 30) return <div className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" /><div><p className="text-[9px] font-black text-amber-600">Caution</p><p className="text-[9px] text-amber-400">new buy · {ws.riskDaysAgo}d ago</p></div></div>; return <div className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" /><p className="text-[9px] font-medium text-emerald-600">Clear</p></div>; })()}</td>;
      case 'termType':      return <td key={col} className="px-4 py-2">{termBadge(pos.isLongTerm ? 'Long' : 'Short')}</td>;
      case 'totalQty':      return <td key={col} className="px-4 py-2 text-right text-[11px] font-medium text-slate-700">{fmt(pos.quantity, 0)}</td>;
      case 'avgBuyPrice':   return <td key={col} className="px-4 py-2 text-right text-[11px] text-slate-500">{fmtCurrency(pos.buyPrice)}</td>;
      case 'strikePrice': {
        const strike = parseOCCStrike(pos.option_symbol);
        return <td key={col} className="px-4 py-2 text-right text-[11px] font-medium text-slate-700">{strike != null ? `$${fmt(strike)}` : <span className="text-slate-300">—</span>}</td>;
      }
      case 'totalValue':    return <td key={col} className="px-4 py-2 text-right text-[11px] text-slate-500">{fmtCurrency(posTotalValue)}</td>;
      case 'avgCurrentPrice':return <td key={col} className="px-4 py-2 text-right text-[11px] text-slate-500">{fmtCurrency(pos.currentPrice)}</td>;
      case 'marketValue':   return <td key={col} className="px-4 py-2 text-right text-[11px] text-slate-500">{fmtCurrency(posMarketValue)}</td>;
      case 'dailyGain': {
        if (pos.prevClose == null) return <td key={col} className="px-4 py-2 text-right text-[11px] text-slate-300">—</td>;
        const dg = (pos.currentPrice - pos.prevClose) * pos.quantity * 100;
        return <td key={col} className="px-4 py-2 text-right text-[11px] font-bold"><SignedValue value={dg} format={v => fmtCurrency(v)} arrowClass="w-2.5 h-2.5" /></td>;
      }
      case 'dailyPct': {
        if (pos.prevClose == null || pos.prevClose === 0) return <td key={col} className="px-4 py-2 text-right text-[11px] text-slate-300">—</td>;
        const dp2 = ((pos.currentPrice - pos.prevClose) / pos.prevClose) * 100;
        return <td key={col} className="px-4 py-2 text-right text-[11px] font-bold"><SignedValue value={dp2} format={() => `${Math.abs(dp2).toFixed(2)}%`} arrowClass="w-2.5 h-2.5" /></td>;
      }
      case 'unrealizedGain':return <td key={col} className="px-4 py-2 text-right text-[11px] font-black"><SignedValue value={posUnrealized} format={v => fmtCurrency(v)} arrowClass="w-2.5 h-2.5" /></td>;
      case 'unrealizedPct': return <td key={col} className="px-4 py-2 text-right text-[11px] font-bold">{pos.buyPrice > 0 ? <SignedValue value={posUnrealized} format={() => `${Math.abs((pos.currentPrice - pos.buyPrice) / pos.buyPrice * 100).toFixed(2)}%`} arrowClass="w-2.5 h-2.5" /> : <span className="text-slate-300">—</span>}</td>;
      case 'retainQty': return <td key={col} className="px-4 py-2"><div className="flex justify-end"><input type="number" min={0} max={pos.quantity} step={1} value={pendingRetain[pos.id] ?? pos.retainQuantity} onChange={e => handleRetainChange(pos.id, e.target.value)} onBlur={() => handleRetainSave(pos)} onKeyDown={e => e.key === 'Enter' && handleRetainSave(pos)} className="w-20 px-2 py-0.5 text-right border border-[#D2D2D7] rounded text-[11px] focus:outline-none focus:ring-2 focus:ring-[#0F52BA] bg-[#E6EEFB]/20 font-semibold text-[#0A3E8F] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" /></div></td>;
      case 'sellableQty':   return <td key={col} className="px-4 py-2 text-right text-[11px] font-medium text-slate-600">{saving === pos.id ? <span className="text-slate-400">...</span> : fmt(pos.sellableQuantity, 0)}</td>;
      case 'gainToSell':    return <td key={col} />;
      case 'targetPrice':   return <td key={col} />;
      default: return <td key={col} />;
    }
  };

  return (
    <div className={`space-y-4${!numbersVisible ? ' blur-sm select-none pointer-events-none' : ''}`}>

      <div className="flex justify-end">
        {/* Header drag-and-drop never fires from touch — this is the only
            way to reorder columns on a phone. */}
        <button onClick={() => setShowColSheet(true)} title="Reorder columns"
          className="flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-[#0F52BA] transition-colors uppercase tracking-widest px-2 py-2 min-h-[44px]">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
          Columns
        </button>
      </div>

      {/* Ticker View */}
      {viewMode === 'ticker' && <div className="overflow-x-auto rounded border border-[#D2D2D7] bg-white shadow-sm overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-slate-50/50 border-b border-slate-200">
              <th className="px-4 py-2 w-8">
                <button
                  onClick={() => { if (expandedTickers.size > 0) { setExpandedTickers(new Set()); setExpandedBrokerages(new Set()); } else setExpandedTickers(new Set(tickerCalcs.map(t => t.ticker))); }}
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
              {columnOrder.map(renderTh)}
            </tr>
          </thead>
          <tbody>
            {tickerCalcs.map(tc => {
              const isExpanded = expandedTickers.has(tc.ticker);
              return (
                <React.Fragment key={tc.ticker}>

                  {/* Level 1 — Ticker */}
                  <tr className={`hover:bg-slate-50 transition-colors group border-t border-slate-100 ${isExpanded ? 'bg-slate-50/70' : ''}`}>
                    <td className="px-4 py-2">
                      <button
                        onClick={() => toggleTicker(tc.ticker)}
                        className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-[#0F52BA] hover:bg-[#F5F5F7] transition-all"
                      >
                        <svg className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    </td>
                    {columnOrder.map(col => renderL1(col, tc))}
                  </tr>

                  {/* Level 2 — Brokerage rows */}
                  {isExpanded && tc.brokerageGroups.map(bg => {
                    const brokerageKey = `${tc.ticker}::${bg.brokerage}`;
                    const isBrokerageExpanded = expandedBrokerages.has(brokerageKey);
                    return (
                      <React.Fragment key={brokerageKey}>

                        {/* Level 2 row — brokerage aggregated */}
                        <tr className={`border-t border-[#D2D2D7] ${isBrokerageExpanded ? 'bg-[#0F52BA]/5' : 'bg-[#F5F5F7]'} hover:bg-[#0F52BA]/5 transition-colors`}>
                          <td className="pl-8 pr-4 py-2">
                            <button
                              onClick={() => toggleBrokerageRow(brokerageKey)}
                              className="w-5 h-5 flex items-center justify-center rounded-md text-[#D2D2D7] hover:text-[#0F52BA] hover:bg-[#E6EEFB] transition-all"
                            >
                              <svg className={`w-3 h-3 transition-transform ${isBrokerageExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                              </svg>
                            </button>
                          </td>
                          {columnOrder.map(col => renderL2(col, bg))}
                        </tr>

                        {isBrokerageExpanded && (
                          <tr className="bg-[#E6EEFB]/30 border-t border-[#D2D2D7]/60">
                            <td />
                            {columnOrder.map(renderL3Header)}
                          </tr>
                        )}

                        {isBrokerageExpanded && bg.positions.map(pos => {
                          const posTotalValue = pos.quantity * 100 * pos.buyPrice;
                          const posMarketValue = pos.quantity * 100 * pos.currentPrice;
                          const posUnrealized = posMarketValue - posTotalValue;
                          return (
                            <tr key={pos.id} className="bg-[#F5F5F7] border-t border-[#D2D2D7]">
                              <td className="px-4 py-2">
                                <div className="flex justify-center pl-4">
                                  <div className="w-px h-full min-h-[16px] bg-[#D2D2D7]" />
                                </div>
                              </td>
                              {columnOrder.map(col => renderL3(col, pos, posTotalValue, posMarketValue, posUnrealized))}
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
      </div>}

      {/* Brokerage View */}
      {viewMode === 'brokerage' && (
        <div className="overflow-x-auto rounded border border-[#D2D2D7] bg-white shadow-sm overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-200">
                <th className="px-4 py-2 w-8">
                  <button
                    onClick={() => { if (expandedBV_L1.size > 0) { setExpandedBV_L1(new Set()); setExpandedBV_L2(new Set()); setExpandedBV_L3(new Set()); } else setExpandedBV_L1(new Set(brokerageViewCalcs.map(r => r.brokerage))); }}
                    className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-[#0F52BA] transition-all"
                    title={expandedBV_L1.size > 0 ? 'Collapse all' : 'Expand all'}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      {expandedBV_L1.size > 0 ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" /> : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />}
                    </svg>
                  </button>
                </th>
                {columnOrder.map(renderTh)}
              </tr>
            </thead>
            <tbody>
              {brokerageViewCalcs.map(bvRow => {
                const isL1 = expandedBV_L1.has(bvRow.brokerage);
                const fmtVal = (v: number) => `$${Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                return (
                  <React.Fragment key={bvRow.brokerage}>
                    {/* L1 — Brokerage */}
                    <tr className={`hover:bg-[#F5F5F7] transition-colors border-t border-[#D2D2D7] ${isL1 ? 'bg-slate-50/70' : ''}`}>
                      <td className="px-4 py-2">
                        <button onClick={() => toggleBV_L1(bvRow.brokerage)} className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-[#0F52BA] transition-all">
                          <svg className={`w-3.5 h-3.5 transition-transform ${isL1 ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
                        </button>
                      </td>
                      <td className="px-4 py-2"><span className={`inline-flex items-center px-2 py-1 rounded text-[10px] font-bold uppercase tracking-tight ${brokerageBadgeCls(bvRow.brokerage)}`}>{bvRow.brokerage}</span></td>
                      {columnOrder.filter(c => c !== 'ticker').map(c => {
                        if (c === 'totalValue') return <td key={c} className="px-4 py-2 text-right font-black text-slate-900 text-sm">{fmtVal(bvRow.totalValue)}</td>;
                        if (c === 'marketValue') return <td key={c} className="px-4 py-2 text-right font-black text-slate-900 text-sm">{fmtVal(bvRow.marketValue)}</td>;
                        if (c === 'unrealizedGain') return <td key={c} className="px-4 py-2 text-right text-sm font-black"><SignedValue value={bvRow.unrealizedGain} format={v => fmtVal(v)} arrowClass="w-2.5 h-2.5" /></td>;
                        return <td key={c} />;
                      })}
                    </tr>

                    {/* L2 — Account */}
                    {isL1 && (() => {
                      const skipL2 = bvRow.accounts.every(a => a.account_id === null);
                      const renderTickers = (acct: BVAccountRow, l2Key: string) =>
                        acct.tickers.map(tc => {
                          const l3Key = `${l2Key}::${tc.ticker}`;
                          const isL3 = expandedBV_L3.has(l3Key);
                          return (
                            <React.Fragment key={l3Key}>
                              <tr className={`hover:bg-[#F5F5F7] transition-colors border-t border-[#D2D2D7] bg-white ${isL3 ? 'bg-slate-50/70' : ''}`}>
                                <td className={`${skipL2 ? 'pl-8' : 'pl-12'} pr-4 py-2`}>
                                  {tc.positions.length > 0 && <button onClick={() => toggleBV_L3(l3Key)} className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-[#0F52BA] transition-all">
                                    <svg className={`w-3.5 h-3.5 transition-transform ${isL3 ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
                                  </button>}
                                </td>
                                {columnOrder.map(col => renderL1(col, tc, true))}
                              </tr>
                              {isL3 && tc.positions.map((pos, idx) => (
                                <tr key={`${l3Key}-${idx}`} className="bg-white border-t border-[#D2D2D7]/40">
                                  <td className="px-4 py-2"><div className="flex justify-center pl-4"><div className="w-px h-full min-h-[16px] bg-[#D2D2D7]" /></div></td>
                                  {columnOrder.map(col => renderL3(col, pos, pos.quantity * 100 * pos.buyPrice, pos.quantity * 100 * pos.currentPrice, pos.unrealizedGain))}
                                </tr>
                              ))}
                            </React.Fragment>
                          );
                        });

                      if (skipL2) return bvRow.accounts.map(a => renderTickers(a, `${bvRow.brokerage}::${a.account_id ?? ''}`));

                      return bvRow.accounts.map(acct => {
                        const l2Key = `${bvRow.brokerage}::${acct.account_id ?? ''}`;
                        const isL2 = expandedBV_L2.has(l2Key);
                        const displayName = acct.account_id != null ? (accountMap[acct.account_id] ?? `Account ${acct.account_id}`) : null;
                        return (
                          <React.Fragment key={l2Key}>
                            <tr className={`border-t border-[#D2D2D7] ${isL2 ? 'bg-[#0F52BA]/5' : 'bg-[#F5F5F7]'} hover:bg-[#0F52BA]/5 transition-colors`}>
                              <td className="pl-8 pr-4 py-2">
                                <button onClick={() => toggleBV_L2(l2Key)} className="w-5 h-5 flex items-center justify-center rounded-md text-[#D2D2D7] hover:text-[#0F52BA] hover:bg-[#E6EEFB] transition-all">
                                  <svg className={`w-3 h-3 transition-transform ${isL2 ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
                                </button>
                              </td>
                              <td className="px-4 py-2"><span className="text-sm font-semibold text-slate-700">{displayName ?? <span className="text-slate-400 italic">Default</span>}</span></td>
                              {columnOrder.filter(c => c !== 'ticker').map(c => {
                                if (c === 'totalValue') return <td key={c} className="px-4 py-2 text-right text-xs font-semibold text-slate-700">{fmtVal(acct.totalValue)}</td>;
                                if (c === 'marketValue') return <td key={c} className="px-4 py-2 text-right text-xs font-semibold text-slate-700">{fmtVal(acct.marketValue)}</td>;
                                if (c === 'unrealizedGain') return <td key={c} className="px-4 py-2 text-right text-xs font-bold"><SignedValue value={acct.unrealizedGain} format={v => fmtVal(v)} arrowClass="w-2.5 h-2.5" /></td>;
                                return <td key={c} />;
                              })}
                            </tr>
                            {isL2 && renderTickers(acct, l2Key)}
                          </React.Fragment>
                        );
                      });
                    })()}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}


      <ColumnOrderSheet
        open={showColSheet}
        onClose={() => setShowColSheet(false)}
        order={columnOrder}
        labels={OPT_COL_LABELS}
        onMove={moveCol}
      />
    </div>
  );
};

export default OptionsView;
