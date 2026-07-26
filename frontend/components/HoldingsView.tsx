import React, { useState, useMemo, useRef, useEffect } from 'react';
import { BrokerageAccount, StockHolding, UnrealizedLot, RealizedGain } from '../types';
import { fetchAnalystData } from '../services/apiService';
import TickerLogo from './TickerLogo';
import SortIndicator from './SortIndicator';
import { useClickOutside } from '../hooks/useClickOutside';
import { optionsMultiplier } from '../utils/finance';

type SortKey = 'ticker' | 'washSale' | 'termType' | 'quantity' | 'totalCost' | 'currentPrice' | 'marketValue' | 'gain' | 'gainPct' | 'dailyGain' | 'dailyPct' | 'realized' | 'totalGain' | 'analystPrice' | 'analystPct';
type SortDirection = 'asc' | 'desc' | null;

type ColKey = 'ticker' | 'washSale' | 'termType' | 'quantity' | 'avgCost' | 'totalCost' | 'currentPrice' | 'marketValue' | 'dailyGain' | 'dailyPct' | 'unrealizedGain' | 'unrealizedPct' | 'realized' | 'totalGain' | 'analystPrice' | 'analystPct';
const DEFAULT_COLS: ColKey[] = ['ticker','washSale','termType','quantity','avgCost','totalCost','currentPrice','marketValue','dailyGain','dailyPct','unrealizedGain','unrealizedPct','realized','totalGain','analystPrice','analystPct'];

type TermType = 'Long' | 'Short' | 'Mixed' | null;
// Term type for a set of lots — Long if held > 1 year, Short if held ≤ 1 year
// (uses the backend isLongTerm flag, which encodes the >365-day rule). Aggregated
// rows containing both long- and short-term lots return 'Mixed'.
const lotsTermType = (lots: UnrealizedLot[]): TermType => {
  if (lots.length === 0) return null;
  const hasLong = lots.some(l => l.isLongTerm);
  const hasShort = lots.some(l => !l.isLongTerm);
  return hasLong && hasShort ? 'Mixed' : hasLong ? 'Long' : 'Short';
};
const termRank = (t: TermType) => (t === 'Long' ? 2 : t === 'Mixed' ? 1 : t === 'Short' ? 0 : -1);

// Aggregate a set of lots into row-level totals (used when the term filter is active,
// so row cost/value reflect only the matching lots). Applies the options 100x multiplier.
const aggFromLots = (lots: UnrealizedLot[], assetType: string, fallbackPrice: number) => {
  const m = optionsMultiplier(assetType);
  const totalQty = lots.reduce((s, l) => s + l.quantity, 0);
  const totalCost = lots.reduce((s, l) => s + l.quantity * l.buyPrice * m, 0);
  const marketValue = lots.reduce((s, l) => s + l.quantity * l.currentPrice * m, 0);
  return {
    totalQty, totalCost, marketValue,
    currentPrice: lots[0]?.currentPrice ?? fallbackPrice,
    avgCost: totalQty > 0 ? totalCost / totalQty : 0,
    unrealizedGain: marketValue - totalCost,
  };
};

interface Props {
  holdings: StockHolding[];
  unrealizedGains: UnrealizedLot[];
  realizedGains: RealizedGain[];
  onRemove: (id: string) => void;
  onNavigateToTransactions?: (ticker: string, brokerage: string, buyDate: string) => void;
  autoExpand?: { ticker: string; brokerage: string } | null;
  selectedBrokerages: string[];
  setSelectedBrokerages: (v: string[]) => void;
  selectedAssetTypes: string[];
  setSelectedAssetTypes: (v: string[]) => void;
  selectedTickers: string[];
  setSelectedTickers: (v: string[]) => void;
  selectedTerms: ('long' | 'short')[];
  setSelectedTerms: (v: ('long' | 'short')[]) => void;
  title?: string;
  accounts?: BrokerageAccount[];
  viewMode?: 'ticker' | 'brokerage';
  onViewModeChange?: (mode: 'ticker' | 'brokerage') => void;
  numbersVisible?: boolean;
}

const HoldingsView: React.FC<Props> = ({
  holdings, unrealizedGains, realizedGains, onRemove, onNavigateToTransactions, autoExpand,
  selectedBrokerages, setSelectedBrokerages,
  selectedAssetTypes, setSelectedAssetTypes,
  selectedTickers, setSelectedTickers,
  selectedTerms, setSelectedTerms,
  title,
  accounts = [],
  viewMode = 'ticker',
  onViewModeChange,
  numbersVisible = true,
}) => {
  const accountMap = useMemo(() =>
    Object.fromEntries(accounts.map(a => [a.id, a.name])) as Record<number, string>,
  [accounts]);
  const [expandedTickers, setExpandedTickers] = useState<Set<string>>(
    autoExpand ? new Set([`${autoExpand.ticker}::Equity`]) : new Set()
  );
  const [expandedBrokerages, setExpandedBrokerages] = useState<Set<string>>(
    autoExpand ? new Set([`${autoExpand.ticker}::Equity::${autoExpand.brokerage}`]) : new Set()
  );
  const [lotSortKey, setLotSortKey] = useState<'buyDate' | 'quantity' | 'buyPrice' | 'totalCost' | 'currentPrice' | 'marketValue' | 'gain'>('buyDate');
  const [lotSortDir, setLotSortDir] = useState<'asc' | 'desc'>('asc');
  const [isBrokerageMenuOpen, setIsBrokerageMenuOpen] = useState(false);
  const [isTickerMenuOpen, setIsTickerMenuOpen] = useState(false);
  const brokerageMenuRef = useRef<HTMLDivElement>(null);
  const tickerMenuRef = useRef<HTMLDivElement>(null);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [isTermMenuOpen, setIsTermMenuOpen] = useState(false);
  const termMenuRef = useRef<HTMLDivElement>(null);
  const toggleTerm = (t: 'long' | 'short') =>
    setSelectedTerms(selectedTerms.includes(t) ? selectedTerms.filter(x => x !== t) : [...selectedTerms, t]);
  const lotMatchesTerm = (l: UnrealizedLot) =>
    selectedTerms.length === 0 || selectedTerms.includes(l.isLongTerm ? 'long' : 'short');
  const [analystMedian, setAnalystMedian] = useState<Record<string, number>>({});
  const [expandedBV_L1, setExpandedBV_L1] = useState<Set<string>>(new Set());
  const [expandedBV_L2, setExpandedBV_L2] = useState<Set<string>>(new Set());
  const [expandedBV_L3, setExpandedBV_L3] = useState<Set<string>>(new Set());

  // Column drag-and-drop state
  const [columnOrder, setColumnOrder] = useState<ColKey[]>(() => {
    try {
      const saved = localStorage.getItem('holdings-col-order');
      if (saved) {
        const parsed: ColKey[] = JSON.parse(saved);
        if (parsed.length === DEFAULT_COLS.length && DEFAULT_COLS.every(c => parsed.includes(c))) return parsed;
      }
    } catch {}
    return DEFAULT_COLS;
  });
  const [dragCol, setDragCol] = useState<ColKey | null>(null);
  const [dragOverCol, setDragOverCol] = useState<ColKey | null>(null);

  const reorderCol = (from: ColKey, to: ColKey) => {
    if (from === to) return;
    setColumnOrder(prev => {
      const o = [...prev];
      const fi = o.indexOf(from), ti = o.indexOf(to);
      o.splice(fi, 1);
      o.splice(ti, 0, from);
      try { localStorage.setItem('holdings-col-order', JSON.stringify(o)); } catch {}
      return o;
    });
  };

  const dragProps = (col: ColKey) => ({
    draggable: true as const,
    onDragStart: (e: React.DragEvent) => { e.dataTransfer.effectAllowed = 'move'; setDragCol(col); },
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverCol(col); },
    onDrop: (e: React.DragEvent) => { e.preventDefault(); if (dragCol) reorderCol(dragCol, col); setDragCol(null); setDragOverCol(null); },
    onDragEnd: () => { setDragCol(null); setDragOverCol(null); },
  });

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

  useClickOutside(
    [brokerageMenuRef, tickerMenuRef, termMenuRef],
    [setIsBrokerageMenuOpen, setIsTickerMenuOpen, setIsTermMenuOpen],
  );

  const washSaleByTicker = useMemo(() => {
    const today = new Date();
    const result: Record<string, { type1Count: number; minDays: number; type2Count: number; lastLossDaysAgo: number | null }> = {};
    unrealizedGains.forEach(lot => {
      if (!result[lot.ticker]) result[lot.ticker] = { type1Count: 0, minDays: Infinity, type2Count: 0, lastLossDaysAgo: null };
      const e = result[lot.ticker];
      if (lot.wash_sale_clear_date) {
        const clearDate = new Date(lot.wash_sale_clear_date);
        if (clearDate > today) {
          e.type1Count++;
          e.minDays = Math.min(e.minDays, Math.ceil((clearDate.getTime() - today.getTime()) / 86400000));
        }
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

  const realizedByTicker = useMemo(() => {
    const map: Record<string, { gain: number; buyCost: number }> = {};
    realizedGains.forEach(g => {
      if (!map[g.ticker]) map[g.ticker] = { gain: 0, buyCost: 0 };
      map[g.ticker].gain += g.gain;
      map[g.ticker].buyCost += g.quantity * g.buyPrice;
    });
    return map;
  }, [realizedGains]);

  const lotsByTicker = useMemo(() => {
    const map: Record<string, UnrealizedLot[]> = {};
    unrealizedGains.forEach(lot => {
      const key = `${lot.ticker}::${lot.assetType || 'Equity'}`;
      if (!map[key]) map[key] = [];
      map[key].push(lot);
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

  const toggleBV_L1 = (key: string) => setExpandedBV_L1(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const toggleBV_L2 = (key: string) => setExpandedBV_L2(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const toggleBV_L3 = (key: string) => setExpandedBV_L3(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });

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
    setSelectedTerms([]);
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

  const SI = ({ column }: { column: SortKey }) => (
    <SortIndicator column={column} sortKey={sortKey} sortDirection={sortDirection} />
  );

  const termBadge = (t: TermType) => {
    if (!t) return <span className="text-slate-300 text-xs">—</span>;
    const cls = t === 'Long' ? 'bg-[#E6EEFB] text-[#0A3E8F]'
      : t === 'Short' ? 'bg-[#E5E5EA] text-[#6E6E73]'
      : 'bg-amber-50 text-amber-700';
    return <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${cls}`}>{t}</span>;
  };

  const tickerRows = useMemo(() => {
    const filtered = holdings.filter(h => {
      const matchesBrokerage = selectedBrokerages.length === 0 || selectedBrokerages.includes(h.brokerage);
      const matchesTicker = selectedTickers.length === 0 || selectedTickers.includes(h.ticker);
      return matchesBrokerage && matchesTicker;
    });

    const grouped: Record<string, StockHolding[]> = {};
    filtered.forEach(h => {
      const key = `${h.ticker}::${h.assetType || 'Equity'}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(h);
    });

    const termActive = selectedTerms.length > 0;

    let rows = Object.entries(grouped).map(([rowKey, tickerHoldings]) => {
      const ticker = tickerHoldings[0].ticker;
      const assetType = tickerHoldings[0].assetType || 'Equity';

      const holdingsByBrokerage: Record<string, StockHolding[]> = {};
      tickerHoldings.forEach(h => {
        if (!holdingsByBrokerage[h.brokerage]) holdingsByBrokerage[h.brokerage] = [];
        holdingsByBrokerage[h.brokerage].push(h);
      });
      const allLots = (lotsByTicker[rowKey] || [])
        .filter(l => selectedBrokerages.length === 0 || selectedBrokerages.includes(l.brokerage))
        .filter(lotMatchesTerm);
      const lotsByBrokerage: Record<string, UnrealizedLot[]> = {};
      allLots.forEach(l => {
        if (!lotsByBrokerage[l.brokerage]) lotsByBrokerage[l.brokerage] = [];
        lotsByBrokerage[l.brokerage].push(l);
      });

      // With a term filter active, row totals come from only the matching lots; otherwise
      // from the precomputed StockHolding aggregates (unchanged default behavior).
      const agg = termActive ? aggFromLots(allLots, assetType, tickerHoldings[0].currentPrice) : null;
      const totalQty = agg ? agg.totalQty : tickerHoldings.reduce((s, h) => s + h.quantity, 0);
      const totalCost = agg ? agg.totalCost : tickerHoldings.reduce((s, h) => s + h.totalCost, 0);
      const marketValue = agg ? agg.marketValue : tickerHoldings.reduce((s, h) => s + h.marketValue, 0);
      const currentPrice = agg ? agg.currentPrice : tickerHoldings[0].currentPrice;
      const avgCost = agg ? agg.avgCost : (totalQty > 0 ? totalCost / totalQty : 0);
      const unrealizedGain = agg ? agg.unrealizedGain : marketValue - totalCost;
      const r = realizedByTicker[ticker];
      const realized = r ? r.gain : 0;
      const totalGain = unrealizedGain + realized;

      const _lotM = (l: UnrealizedLot) => (l.assetType || '').toLowerCase() === 'options' ? 100 : 1;
      const _lotDaily = (l: UnrealizedLot) => l.prevClose != null ? (l.currentPrice - l.prevClose) * l.quantity * _lotM(l) : 0;
      const _lotPrevMV = (l: UnrealizedLot) => l.prevClose != null ? l.prevClose * l.quantity * _lotM(l) : 0;
      const dailyGain = allLots.reduce((s, l) => s + _lotDaily(l), 0);
      const dailyPrevMV = allLots.reduce((s, l) => s + _lotPrevMV(l), 0);
      const brokerageGroups = Object.keys(holdingsByBrokerage)
        .sort((a, b) => a.localeCompare(b))
        .map(brokerage => {
          const bHoldings = holdingsByBrokerage[brokerage];
          const bLots = lotsByBrokerage[brokerage] || [];
          const bAgg = termActive ? aggFromLots(bLots, assetType, currentPrice) : null;
          const bQty = bAgg ? bAgg.totalQty : bHoldings.reduce((s, h) => s + h.quantity, 0);
          const bCost = bAgg ? bAgg.totalCost : bHoldings.reduce((s, h) => s + h.totalCost, 0);
          const bMarket = bAgg ? bAgg.marketValue : bHoldings.reduce((s, h) => s + h.marketValue, 0);
          const lots = bLots.sort((a, b) => {
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
          const bDailyGain = lots.reduce((s, l) => s + _lotDaily(l), 0);
          const bDailyPrevMV = lots.reduce((s, l) => s + _lotPrevMV(l), 0);
          return { brokerage, totalQty: bQty, avgCost: bQty > 0 ? bCost / bQty : 0, totalCost: bCost, currentPrice, marketValue: bMarket, unrealizedGain: bMarket - bCost, dailyGain: bDailyGain, dailyPrevMV: bDailyPrevMV, lots, assetType, termType: lotsTermType(lots) };
        })
        // Drop brokerages with no matching lots when a term filter is active.
        .filter(bg => !termActive || bg.lots.length > 0);

      return { rowKey, ticker, totalQty, totalCost, avgCost, currentPrice, assetType, marketValue, unrealizedGain, dailyGain, dailyPrevMV, realized, totalGain, brokerageGroups, termType: lotsTermType(allLots), ids: tickerHoldings.map(h => h.id) };
    });

    // Hide tickers with no matching lots when a term filter is active.
    if (termActive) rows = rows.filter(r => r.brokerageGroups.length > 0);

    if (sortKey && sortDirection) {
      rows = [...rows].sort((a, b) => {
        let valA: any, valB: any;
        switch (sortKey) {
          case 'ticker':       valA = a.ticker.toLowerCase(); valB = b.ticker.toLowerCase(); break;
          case 'washSale': {
            const wsPri = (row: typeof a) => {
              const ws = washSaleByTicker[row.ticker];
              if (!ws) return 2;
              const isRed = (ws.lastLossDaysAgo !== null && ws.lastLossDaysAgo <= 30) || ws.type1Count > 0;
              return isRed ? 0 : ws.type2Count > 0 ? 1 : 2;
            };
            valA = wsPri(a); valB = wsPri(b); break;
          }
          case 'termType':     valA = termRank(a.termType); valB = termRank(b.termType); break;
          case 'quantity':     valA = a.totalQty; valB = b.totalQty; break;
          case 'totalCost':    valA = a.totalCost; valB = b.totalCost; break;
          case 'currentPrice': valA = a.currentPrice; valB = b.currentPrice; break;
          case 'marketValue':  valA = a.marketValue; valB = b.marketValue; break;
          case 'gain':         valA = a.unrealizedGain; valB = b.unrealizedGain; break;
          case 'gainPct':      valA = a.avgCost > 0 ? (a.currentPrice - a.avgCost) / a.avgCost : 0; valB = b.avgCost > 0 ? (b.currentPrice - b.avgCost) / b.avgCost : 0; break;
          case 'dailyGain':    valA = a.dailyGain; valB = b.dailyGain; break;
          case 'dailyPct':     valA = a.dailyPrevMV > 0 ? a.dailyGain / a.dailyPrevMV : 0; valB = b.dailyPrevMV > 0 ? b.dailyGain / b.dailyPrevMV : 0; break;
          case 'realized':     valA = a.realized; valB = b.realized; break;
          case 'totalGain':    valA = a.totalGain; valB = b.totalGain; break;
          case 'analystPrice': valA = analystMedian[a.ticker] ?? -Infinity; valB = analystMedian[b.ticker] ?? -Infinity; break;
          case 'analystPct':   valA = analystMedian[a.ticker] && a.currentPrice > 0 ? (analystMedian[a.ticker] - a.currentPrice) / a.currentPrice : -Infinity; valB = analystMedian[b.ticker] && b.currentPrice > 0 ? (analystMedian[b.ticker] - b.currentPrice) / b.currentPrice : -Infinity; break;
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
  }, [holdings, unrealizedGains, realizedByTicker, lotsByTicker, selectedBrokerages, selectedTickers, sortKey, sortDirection, lotSortKey, lotSortDir, selectedTerms]);

  type TickerRow = (typeof tickerRows)[0];
  type BrokerageGroup = TickerRow['brokerageGroups'][0];

  const brokerageRows = useMemo(() => {
    const termActive = selectedTerms.length > 0;
    const filtered = holdings.filter(h => {
      const matchesBrokerage = selectedBrokerages.length === 0 || selectedBrokerages.includes(h.brokerage);
      const matchesTicker = selectedTickers.length === 0 || selectedTickers.includes(h.ticker);
      return matchesBrokerage && matchesTicker;
    });

    const brokerageMap: Record<string, Record<string, Record<string, StockHolding[]>>> = {};
    filtered.forEach(h => {
      const acctKey = h.account_id != null ? String(h.account_id) : '';
      const tickerKey = `${h.ticker}::${h.assetType || 'Equity'}`;
      if (!brokerageMap[h.brokerage]) brokerageMap[h.brokerage] = {};
      if (!brokerageMap[h.brokerage][acctKey]) brokerageMap[h.brokerage][acctKey] = {};
      if (!brokerageMap[h.brokerage][acctKey][tickerKey]) brokerageMap[h.brokerage][acctKey][tickerKey] = [];
      brokerageMap[h.brokerage][acctKey][tickerKey].push(h);
    });

    return Object.keys(brokerageMap).sort().map(brokerage => {
      const accounts = Object.keys(brokerageMap[brokerage]).sort().map(acctKey => {
        const account_id = acctKey ? parseInt(acctKey) : null;
        let tickers = Object.entries(brokerageMap[brokerage][acctKey]).map(([rowKey, tickerHoldings]) => {
          const ticker = tickerHoldings[0].ticker;
          const assetType = tickerHoldings[0].assetType || 'Equity';
          const lots = unrealizedGains.filter(l =>
            l.brokerage === brokerage &&
            l.ticker === ticker &&
            (l.account_id ?? null) === account_id &&
            (l.assetType || 'Equity') === assetType &&
            lotMatchesTerm(l)
          ).sort((a, b) => {
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
          // Term filter active → aggregates from matching lots; otherwise from StockHolding.
          const agg = termActive ? aggFromLots(lots, assetType, tickerHoldings[0].currentPrice) : null;
          const totalQty = agg ? agg.totalQty : tickerHoldings.reduce((s, h) => s + h.quantity, 0);
          const totalCost = agg ? agg.totalCost : tickerHoldings.reduce((s, h) => s + h.totalCost, 0);
          const marketValue = agg ? agg.marketValue : tickerHoldings.reduce((s, h) => s + h.marketValue, 0);
          const currentPrice = agg ? agg.currentPrice : tickerHoldings[0].currentPrice;
          const avgCost = agg ? agg.avgCost : (totalQty > 0 ? totalCost / totalQty : 0);
          const unrealizedGain = agg ? agg.unrealizedGain : marketValue - totalCost;
          const r = realizedByTicker[ticker];
          const realized = r ? r.gain : 0;
          return { rowKey, ticker, assetType, totalQty, avgCost, totalCost, currentPrice, marketValue, unrealizedGain, realized, totalGain: unrealizedGain + realized, lots, termType: lotsTermType(lots) };
        });
        if (termActive) tickers = tickers.filter(t => t.lots.length > 0);

        if (sortKey && sortDirection) {
          tickers = [...tickers].sort((a, b) => {
            let valA: any, valB: any;
            switch (sortKey) {
              case 'ticker':       valA = a.ticker.toLowerCase(); valB = b.ticker.toLowerCase(); break;
              case 'termType':     valA = termRank(a.termType); valB = termRank(b.termType); break;
              case 'quantity':     valA = a.totalQty; valB = b.totalQty; break;
              case 'totalCost':    valA = a.totalCost; valB = b.totalCost; break;
              case 'currentPrice': valA = a.currentPrice; valB = b.currentPrice; break;
              case 'marketValue':  valA = a.marketValue; valB = b.marketValue; break;
              case 'gain':         valA = a.unrealizedGain; valB = b.unrealizedGain; break;
              case 'gainPct':      valA = a.avgCost > 0 ? (a.currentPrice - a.avgCost) / a.avgCost : 0; valB = b.avgCost > 0 ? (b.currentPrice - b.avgCost) / b.avgCost : 0; break;
              case 'realized':     valA = a.realized; valB = b.realized; break;
              case 'totalGain':    valA = a.totalGain; valB = b.totalGain; break;
              case 'analystPrice': valA = analystMedian[a.ticker] ?? -Infinity; valB = analystMedian[b.ticker] ?? -Infinity; break;
              case 'analystPct':   valA = analystMedian[a.ticker] && a.currentPrice > 0 ? (analystMedian[a.ticker] - a.currentPrice) / a.currentPrice : -Infinity; valB = analystMedian[b.ticker] && b.currentPrice > 0 ? (analystMedian[b.ticker] - b.currentPrice) / b.currentPrice : -Infinity; break;
              default:             valA = a.ticker.toLowerCase(); valB = b.ticker.toLowerCase();
            }
            if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
            if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
            return 0;
          });
        } else {
          tickers = [...tickers].sort((a, b) => a.ticker.localeCompare(b.ticker));
        }

        const acctCost = tickers.reduce((s, t) => s + t.totalCost, 0);
        const acctMV = tickers.reduce((s, t) => s + t.marketValue, 0);
        return { account_id, totalCost: acctCost, marketValue: acctMV, unrealizedGain: acctMV - acctCost, tickers };
      }).filter(a => !termActive || a.tickers.length > 0);

      const brkCost = accounts.reduce((s, a) => s + a.totalCost, 0);
      const brkMV = accounts.reduce((s, a) => s + a.marketValue, 0);
      return { brokerage, totalCost: brkCost, marketValue: brkMV, unrealizedGain: brkMV - brkCost, accounts };
    }).filter(b => !termActive || b.accounts.length > 0);
  }, [holdings, unrealizedGains, selectedBrokerages, selectedTickers, realizedByTicker, lotSortKey, lotSortDir, sortKey, sortDirection, analystMedian, selectedTerms]);

  type BVBrokerageRow = (typeof brokerageRows)[0];
  type BVAccountRow = BVBrokerageRow['accounts'][0];
  type BVTickerRow = BVAccountRow['tickers'][0];

  // ── Column rendering helpers ──────────────────────────────────────────────

  const thCls = (col: ColKey, extra = '') =>
    `px-4 py-2 text-[10px] font-black uppercase tracking-widest whitespace-nowrap select-none cursor-grab active:cursor-grabbing transition-colors
     ${dragOverCol === col ? 'border-l-2 border-[#0F52BA] bg-[#E6EEFB]/40' : ''}
     ${dragCol === col ? 'opacity-40' : ''}
     ${extra}`.replace(/\s+/g, ' ').trim();

  const renderTh = (col: ColKey) => {
    const dp = dragProps(col);
    switch (col) {
      case 'ticker':        return <th key={col} {...dp} className={thCls(col, 'text-slate-400 hover:text-[#0F52BA]')} onClick={() => handleSort('ticker')}><div className="flex items-center gap-0.5">Ticker <SI column="ticker" /></div></th>;
      case 'washSale':      return <th key={col} {...dp} className={thCls(col, 'text-slate-400 hover:text-[#0F52BA]')} onClick={() => handleSort('washSale')}><div className="flex items-center gap-0.5">Wash Sale <SI column="washSale" /></div></th>;
      case 'termType':      return <th key={col} {...dp} className={thCls(col, 'text-slate-400 hover:text-[#0F52BA]')} onClick={() => handleSort('termType')}><div className="flex items-center gap-0.5">Term Type <SI column="termType" /></div></th>;
      case 'quantity':      return <th key={col} {...dp} className={thCls(col, 'text-slate-400 hover:text-[#0F52BA] text-right')} onClick={() => handleSort('quantity')}><div className="flex items-center justify-end gap-0.5">Quantity <SI column="quantity" /></div></th>;
      case 'avgCost':       return <th key={col} {...dp} className={thCls(col, 'text-slate-400 text-right')}>Avg Price</th>;
      case 'totalCost':     return <th key={col} {...dp} className={thCls(col, 'text-slate-400 hover:text-[#0F52BA] text-right')} onClick={() => handleSort('totalCost')}><div className="flex items-center justify-end gap-0.5">Total Value <SI column="totalCost" /></div></th>;
      case 'currentPrice':  return <th key={col} {...dp} className={thCls(col, 'text-slate-400 hover:text-[#0F52BA] text-right')} onClick={() => handleSort('currentPrice')}><div className="flex items-center justify-end gap-0.5">Current Price <SI column="currentPrice" /></div></th>;
      case 'marketValue':   return <th key={col} {...dp} className={thCls(col, 'text-slate-400 hover:text-[#0F52BA] text-right')} onClick={() => handleSort('marketValue')}><div className="flex items-center justify-end gap-0.5">Market Value <SI column="marketValue" /></div></th>;
      case 'dailyGain':     return <th key={col} {...dp} className={thCls(col, 'text-slate-400 hover:text-[#0F52BA] text-right')} onClick={() => handleSort('dailyGain')}><div className="flex items-center justify-end gap-0.5">Daily $ <SI column="dailyGain" /></div></th>;
      case 'dailyPct':      return <th key={col} {...dp} className={thCls(col, 'text-slate-400 hover:text-[#0F52BA] text-right')} onClick={() => handleSort('dailyPct')}><div className="flex items-center justify-end gap-0.5">Daily % <SI column="dailyPct" /></div></th>;
      case 'unrealizedGain':return <th key={col} {...dp} className={thCls(col, 'text-slate-400 hover:text-[#0F52BA] text-right')} onClick={() => handleSort('gain')}><div className="flex items-center justify-end gap-0.5">Overall $ <SI column="gain" /></div></th>;
      case 'unrealizedPct': return <th key={col} {...dp} className={thCls(col, 'text-slate-400 hover:text-[#0F52BA] text-right')} onClick={() => handleSort('gainPct')}><div className="flex items-center justify-end gap-0.5">Overall % <SI column="gainPct" /></div></th>;
      case 'realized':      return <th key={col} {...dp} className={thCls(col, 'text-slate-400 hover:text-[#0F52BA] text-right')} onClick={() => handleSort('realized')}><div className="flex items-center justify-end gap-0.5">Realized <SI column="realized" /></div></th>;
      case 'totalGain':     return <th key={col} {...dp} className={thCls(col, 'text-slate-400 hover:text-[#0F52BA] text-right')} onClick={() => handleSort('totalGain')}><div className="flex items-center justify-end gap-0.5">Total Gain <SI column="totalGain" /></div></th>;
      case 'analystPrice':  return <th key={col} {...dp} className={thCls(col, 'text-slate-400 hover:text-[#0F52BA] text-right')} onClick={() => handleSort('analystPrice')}><div className="flex items-center justify-end gap-0.5">Analyst $ <SI column="analystPrice" /></div></th>;
      case 'analystPct':    return <th key={col} {...dp} className={thCls(col, 'text-slate-400 hover:text-[#0F52BA] text-right')} onClick={() => handleSort('analystPct')}><div className="flex items-center justify-end gap-0.5">Analyst % <SI column="analystPct" /></div></th>;
      default: return <th key={col} />;
    }
  };

  const renderL1 = (col: ColKey, row: TickerRow, compact = false) => {
    const sz = compact ? 'text-[11px]' : 'text-sm';
    const n2 = (v: number) => v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    switch (col) {
      case 'ticker': return (
        <td key={col} className="px-4 py-2">
          <div className="flex items-center gap-2">
            <TickerLogo ticker={row.ticker} size={compact ? 24 : 32} assetType={row.assetType} />
            <div>
              <span className={`${compact ? 'text-[11px]' : 'text-xs'} font-bold text-[#1D1D1F] uppercase tracking-tight`}>{row.ticker}</span>
              {row.assetType?.toLowerCase() === 'options' && <span className="ml-1.5 px-1 py-0.5 rounded bg-violet-100 text-[9px] font-black text-violet-600 uppercase">OPT</span>}
            </div>
          </div>
        </td>
      );
      case 'washSale': return (
        <td key={col} className="px-4 py-2">
          {(() => {
            const ws = washSaleByTicker[row.ticker];
            const isRed = ws && ((ws.lastLossDaysAgo !== null && ws.lastLossDaysAgo <= 30) || ws.type1Count > 0);
            const isYellow = !isRed && ws && ws.type2Count > 0;
            if (isRed) {
              const detail = ws.type1Count > 0 && ws.minDays !== Infinity ? `${ws.minDays}d to go` : ws.lastLossDaysAgo !== null ? `loss ${ws.lastLossDaysAgo}d ago` : '';
              return <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" /><div><p className="text-[10px] font-black text-rose-600">Active</p>{detail && <p className="text-[9px] text-rose-400">{detail}</p>}</div></div>;
            }
            if (isYellow) return <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" /><div><p className="text-[10px] font-black text-amber-600">Caution</p><p className="text-[9px] text-amber-400">don't sell at loss</p></div></div>;
            return <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" /><p className="text-[10px] font-medium text-emerald-600">Clear</p></div>;
          })()}
        </td>
      );
      case 'termType':      return <td key={col} className="px-4 py-2">{termBadge(row.termType)}</td>;
      case 'quantity':      return <td key={col} className={`px-4 py-2 text-right font-bold text-slate-800 ${sz}`}>{n2(row.totalQty)}</td>;
      case 'avgCost':       return <td key={col} className={`px-4 py-2 text-right ${sz} text-slate-500 font-medium`}>${n2(row.avgCost)}</td>;
      case 'totalCost':     return <td key={col} className={`px-4 py-2 text-right font-black text-slate-900 ${sz}`}>${n2(row.totalCost)}</td>;
      case 'currentPrice':  return <td key={col} className={`px-4 py-2 text-right ${sz} text-slate-500 font-medium`}>${n2(row.currentPrice)}</td>;
      case 'marketValue':   return <td key={col} className={`px-4 py-2 text-right font-black text-slate-900 ${sz}`}>${n2(row.marketValue)}</td>;
      case 'dailyGain': {
        if (row.dailyPrevMV === 0) return <td key={col} className={`px-4 py-2 text-right ${sz} text-slate-300`}>—</td>;
        const dg = row.dailyGain;
        return <td key={col} className={`px-4 py-2 text-right ${sz} font-black ${dg >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{dg >= 0 ? '+' : '-'}${n2(Math.abs(dg))}</td>;
      }
      case 'dailyPct': {
        const dp2 = row.dailyPrevMV > 0 ? (row.dailyGain / row.dailyPrevMV) * 100 : null;
        return <td key={col} className={`px-4 py-2 text-right ${sz} font-bold ${dp2 != null ? dp2 >= 0 ? 'text-emerald-600' : 'text-rose-600' : 'text-slate-300'}`}>{dp2 != null ? `${dp2 >= 0 ? '+' : ''}${dp2.toFixed(2)}%` : '—'}</td>;
      }
      case 'unrealizedGain':return <td key={col} className={`px-4 py-2 text-right ${sz} font-black ${row.unrealizedGain >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{row.unrealizedGain >= 0 ? '+' : '-'}${n2(Math.abs(row.unrealizedGain))}</td>;
      case 'unrealizedPct': return <td key={col} className={`px-4 py-2 text-right ${sz} font-bold ${row.unrealizedGain >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{row.avgCost > 0 ? `${row.unrealizedGain >= 0 ? '+' : ''}${((row.currentPrice - row.avgCost) / row.avgCost * 100).toFixed(2)}%` : '—'}</td>;
      case 'realized':      return <td key={col} className="px-4 py-2 text-right">{row.realized !== 0 ? <div className={`${sz} font-black ${row.realized >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{row.realized >= 0 ? '+' : '-'}${n2(Math.abs(row.realized))}</div> : <div className="text-xs text-slate-300">—</div>}</td>;
      case 'totalGain':     return <td key={col} className="px-4 py-2 text-right"><div className={`${sz} font-black ${row.totalGain >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{row.totalGain >= 0 ? '+' : '-'}${n2(Math.abs(row.totalGain))}</div></td>;
      case 'analystPrice':  return <td key={col} className={`px-4 py-2 text-right ${sz} font-bold text-[#0F52BA]`}>{analystMedian[row.ticker] ? `$${analystMedian[row.ticker].toFixed(2)}` : <span className="text-xs text-slate-300">—</span>}</td>;
      case 'analystPct':    return <td key={col} className="px-4 py-2 text-right">{analystMedian[row.ticker] && row.currentPrice > 0 ? (() => { const pct = ((analystMedian[row.ticker] - row.currentPrice) / row.currentPrice) * 100; return <span className={`${sz} font-bold ${pct >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{pct >= 0 ? '+' : ''}{pct.toFixed(2)}%</span>; })() : <span className="text-xs text-slate-300">—</span>}</td>;
      default: return <td key={col} />;
    }
  };

  const renderL2 = (col: ColKey, row: TickerRow, bg: BrokerageGroup) => {
    switch (col) {
      case 'ticker': return (
        <td key={col} className="px-4 py-2">
          <span className={`inline-flex items-center px-2 py-1 rounded text-[10px] font-bold uppercase tracking-tight ${bg.brokerage.toLowerCase().includes('robinhood') ? 'bg-[#0F52BA] text-white' : bg.brokerage.toLowerCase().includes('schwab') ? 'bg-[#6E6E73] text-white' : 'bg-[#E5E5EA] text-[#6E6E73]'}`}>{bg.brokerage}</span>
        </td>
      );
      case 'washSale':      return <td key={col} />;
      case 'termType':      return <td key={col} className="px-4 py-2">{termBadge(bg.termType)}</td>;
      case 'quantity':      return <td key={col} className="px-4 py-2 text-right text-[11px] font-medium text-slate-700">{bg.totalQty.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>;
      case 'avgCost':       return <td key={col} className="px-4 py-2 text-right text-[11px] text-slate-500">${bg.avgCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>;
      case 'totalCost':     return <td key={col} className="px-4 py-2 text-right text-[11px] font-semibold text-slate-700">${bg.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>;
      case 'currentPrice':  return <td key={col} className="px-4 py-2 text-right text-[11px] text-slate-500">${bg.currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>;
      case 'marketValue':   return <td key={col} className="px-4 py-2 text-right text-[11px] font-semibold text-slate-700">${bg.marketValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>;
      case 'dailyGain': {
        if (bg.dailyPrevMV === 0) return <td key={col} className="px-4 py-2 text-right text-[11px] text-slate-300">—</td>;
        const dg = bg.dailyGain;
        return <td key={col} className={`px-4 py-2 text-right text-[11px] font-bold ${dg >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{dg >= 0 ? '+' : '-'}${Math.abs(dg).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>;
      }
      case 'dailyPct': {
        const dp2 = bg.dailyPrevMV > 0 ? (bg.dailyGain / bg.dailyPrevMV) * 100 : null;
        return <td key={col} className={`px-4 py-2 text-right text-[11px] font-bold ${dp2 != null ? dp2 >= 0 ? 'text-emerald-600' : 'text-rose-600' : 'text-slate-300'}`}>{dp2 != null ? `${dp2 >= 0 ? '+' : ''}${dp2.toFixed(2)}%` : '—'}</td>;
      }
      case 'unrealizedGain':return <td key={col} className={`px-4 py-2 text-right text-[11px] font-bold ${bg.unrealizedGain >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{bg.unrealizedGain >= 0 ? '+' : '-'}${Math.abs(bg.unrealizedGain).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>;
      case 'unrealizedPct': return <td key={col} className={`px-4 py-2 text-right text-[11px] font-bold ${bg.unrealizedGain >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{bg.totalCost > 0 ? `${bg.unrealizedGain >= 0 ? '+' : ''}${(bg.unrealizedGain / bg.totalCost * 100).toFixed(2)}%` : '—'}</td>;
      case 'realized':      return <td key={col} />;
      case 'totalGain':     return <td key={col} />;
      case 'analystPrice':  return <td key={col} className="px-4 py-2 text-right text-[11px] font-bold text-[#0F52BA]">{analystMedian[row.ticker] ? `$${analystMedian[row.ticker].toFixed(2)}` : <span className="text-[10px] text-slate-300">—</span>}</td>;
      case 'analystPct':    return <td key={col} className="px-4 py-2 text-right">{analystMedian[row.ticker] && bg.currentPrice > 0 ? (() => { const pct = ((analystMedian[row.ticker] - bg.currentPrice) / bg.currentPrice) * 100; return <span className={`text-[11px] font-bold ${pct >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{pct >= 0 ? '+' : ''}{pct.toFixed(2)}%</span>; })() : <span className="text-[10px] text-slate-300">—</span>}</td>;
      default: return <td key={col} />;
    }
  };

  const renderL3Header = (col: ColKey) => {
    const lotTh = (lotCol: typeof lotSortKey, label: string) => (
      <td key={col} className="px-4 py-1.5 text-[9px] font-black uppercase tracking-widest whitespace-nowrap text-right cursor-pointer select-none hover:text-[#0F52BA] transition-colors" style={{ color: lotSortKey === lotCol ? '#0F52BA' : undefined }} onClick={() => handleLotSort(lotCol)}>
        <div className="flex items-center justify-end gap-0.5">{label}<LotSortIndicator col={lotCol} /></div>
      </td>
    );
    const staticTd = (label: string, align: 'left' | 'right' = 'right') => (
      <td key={col} className={`px-4 py-1.5 text-[9px] font-black text-[#AEAEB2] uppercase tracking-widest whitespace-nowrap text-${align}`}>{label}</td>
    );
    switch (col) {
      case 'ticker':        return <td key={col} className="px-4 py-1.5 text-[9px] font-black uppercase tracking-widest whitespace-nowrap cursor-pointer select-none hover:text-[#0F52BA] transition-colors" style={{ color: lotSortKey === 'buyDate' ? '#0F52BA' : undefined }} onClick={() => handleLotSort('buyDate')}><div className="flex items-center gap-0.5">Buy Date<LotSortIndicator col="buyDate" /></div></td>;
      case 'washSale':      return staticTd('Wash Sale', 'left');
      case 'termType':      return staticTd('Term Type', 'left');
      case 'quantity':      return lotTh('quantity', 'Qty');
      case 'avgCost':       return lotTh('buyPrice', 'Buy Price');
      case 'totalCost':     return lotTh('totalCost', 'Total Value');
      case 'currentPrice':  return lotTh('currentPrice', 'Current Price');
      case 'marketValue':   return lotTh('marketValue', 'Market Value');
      case 'dailyGain':     return staticTd('Daily $');
      case 'dailyPct':      return staticTd('Daily %');
      case 'unrealizedGain':return lotTh('gain', 'Overall $');
      case 'unrealizedPct': return staticTd('Overall %');
      case 'realized':      return <td key={col} />;
      case 'totalGain':     return <td key={col} />;
      case 'analystPrice':  return staticTd('Analyst $');
      case 'analystPct':    return staticTd('Analyst %');
      default: return <td key={col} />;
    }
  };

  const renderL3 = (col: ColKey, row: TickerRow, lot: UnrealizedLot) => {
    const lotCost = lot.quantity * lot.buyPrice;
    const lotMarket = lot.quantity * lot.currentPrice;
    switch (col) {
      case 'ticker': return (
        <td key={col} className="px-4 py-2 text-[11px] text-slate-500 font-bold whitespace-nowrap">
          <div className="flex items-center gap-1.5">
            {new Date(lot.buyDate).toLocaleDateString('en-CA')}
            {onNavigateToTransactions && <svg className="w-3 h-3 text-[#0F52BA] opacity-0 group-hover/lot:opacity-100 transition-opacity shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>}
          </div>
        </td>
      );
      case 'washSale': return (
        <td key={col} className="px-4 py-2">
          {(() => {
            const today = new Date();
            const clearDate = lot.wash_sale_clear_date ? new Date(lot.wash_sale_clear_date) : null;
            const daysToGo = clearDate && clearDate > today ? Math.ceil((clearDate.getTime() - today.getTime()) / 86400000) : 0;
            if (daysToGo > 0) return <div className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" /><div><p className="text-[9px] font-black text-rose-600">Active</p><p className="text-[9px] text-rose-400">{daysToGo}d to go</p></div></div>;
            if (lot.wash_sale_at_risk && lot.wash_sale_risk_trigger_date) {
              const riskDaysAgo = Math.floor((today.getTime() - new Date(lot.wash_sale_risk_trigger_date).getTime()) / 86400000);
              if (riskDaysAgo <= 30) return <div className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" /><div><p className="text-[9px] font-black text-amber-600">Caution</p><p className="text-[9px] text-amber-400">new buy · {riskDaysAgo}d ago</p></div></div>;
            }
            return <div className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" /><p className="text-[9px] font-medium text-emerald-600">Clear</p></div>;
          })()}
        </td>
      );
      case 'termType':      return <td key={col} className="px-4 py-2">{termBadge(lot.isLongTerm ? 'Long' : 'Short')}</td>;
      case 'quantity':      return <td key={col} className="px-4 py-2 text-right text-[11px] text-slate-600 font-medium">{lot.quantity.toFixed(2)}</td>;
      case 'avgCost':       return <td key={col} className="px-4 py-2 text-right text-[11px] text-slate-500">${lot.buyPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>;
      case 'totalCost':     return <td key={col} className="px-4 py-2 text-right text-[11px] text-slate-500">${lotCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>;
      case 'currentPrice':  return <td key={col} className="px-4 py-2 text-right text-[11px] text-slate-500">${lot.currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>;
      case 'marketValue':   return <td key={col} className="px-4 py-2 text-right text-[11px] text-slate-500">${lotMarket.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>;
      case 'dailyGain': {
        if (lot.prevClose == null) return <td key={col} className="px-4 py-2 text-right text-[11px] text-slate-300">—</td>;
        const m = (lot.assetType || '').toLowerCase() === 'options' ? 100 : 1;
        const dg = (lot.currentPrice - lot.prevClose) * lot.quantity * m;
        return <td key={col} className={`px-4 py-2 text-right text-[11px] font-bold ${dg >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{dg >= 0 ? '+' : '-'}${Math.abs(dg).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>;
      }
      case 'dailyPct': {
        if (lot.prevClose == null || lot.prevClose === 0) return <td key={col} className="px-4 py-2 text-right text-[11px] text-slate-300">—</td>;
        const dp2 = ((lot.currentPrice - lot.prevClose) / lot.prevClose) * 100;
        return <td key={col} className={`px-4 py-2 text-right text-[11px] font-bold ${dp2 >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{dp2 >= 0 ? '+' : ''}{dp2.toFixed(2)}%</td>;
      }
      case 'unrealizedGain':return <td key={col} className={`px-4 py-2 text-right text-[11px] font-black ${lot.gain >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{lot.gain >= 0 ? '+' : '-'}${Math.abs(lot.gain).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>;
      case 'unrealizedPct': return <td key={col} className={`px-4 py-2 text-right text-[11px] font-bold ${lot.gain >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{lot.buyPrice > 0 ? `${lot.gain >= 0 ? '+' : ''}${((lot.currentPrice - lot.buyPrice) / lot.buyPrice * 100).toFixed(2)}%` : '—'}</td>;
      case 'realized':      return <td key={col} />;
      case 'totalGain':     return <td key={col} />;
      case 'analystPrice':  return <td key={col} className="px-4 py-2 text-right text-[11px] font-bold text-[#0F52BA]">{analystMedian[row.ticker] ? `$${analystMedian[row.ticker].toFixed(2)}` : <span className="text-[10px] text-slate-300">—</span>}</td>;
      case 'analystPct':    return <td key={col} className="px-4 py-2 text-right">{analystMedian[row.ticker] && lot.currentPrice > 0 ? (() => { const pct = ((analystMedian[row.ticker] - lot.currentPrice) / lot.currentPrice) * 100; return <span className={`text-[11px] font-bold ${pct >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{pct >= 0 ? '+' : ''}{pct.toFixed(2)}%</span>; })() : <span className="text-[10px] text-slate-300">—</span>}</td>;
      default: return <td key={col} />;
    }
  };

  const brokerageBadgeCls = (b: string) =>
    b.toLowerCase().includes('robinhood') ? 'bg-[#0F52BA] text-white'
    : b.toLowerCase().includes('schwab') ? 'bg-[#6E6E73] text-white'
    : 'bg-[#E5E5EA] text-[#6E6E73]';

  const renderBVL1 = (col: ColKey, row: BVBrokerageRow) => {
    const g = row.unrealizedGain;
    const pct = row.totalCost > 0 ? g / row.totalCost * 100 : 0;
    const fmt = (v: number) => v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    switch (col) {
      case 'ticker':        return <td key={col} className="px-4 py-2"><span className={`inline-flex items-center px-2 py-1 rounded text-[10px] font-bold uppercase tracking-tight ${brokerageBadgeCls(row.brokerage)}`}>{row.brokerage}</span></td>;
      case 'totalCost':     return <td key={col} className="px-4 py-2 text-right font-black text-slate-900 text-sm">${fmt(row.totalCost)}</td>;
      case 'marketValue':   return <td key={col} className="px-4 py-2 text-right font-black text-slate-900 text-sm">${fmt(row.marketValue)}</td>;
      case 'dailyGain':     return <td key={col} />;
      case 'dailyPct':      return <td key={col} />;
      case 'unrealizedGain':return <td key={col} className={`px-4 py-2 text-right text-sm font-black ${g >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{g >= 0 ? '+' : '-'}${fmt(Math.abs(g))}</td>;
      case 'unrealizedPct': return <td key={col} className={`px-4 py-2 text-right text-sm font-bold ${g >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{row.totalCost > 0 ? `${g >= 0 ? '+' : ''}${pct.toFixed(2)}%` : '—'}</td>;
      default:              return <td key={col} />;
    }
  };

  const renderBVL2 = (col: ColKey, row: BVAccountRow) => {
    const g = row.unrealizedGain;
    const pct = row.totalCost > 0 ? g / row.totalCost * 100 : 0;
    const fmt = (v: number) => v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const displayName = row.account_id != null ? (accountMap[row.account_id] ?? `Account ${row.account_id}`) : null;
    switch (col) {
      case 'ticker':        return <td key={col} className="px-4 py-2"><span className="text-sm font-semibold text-slate-700">{displayName ?? <span className="text-slate-400 italic">Default</span>}</span></td>;
      case 'totalCost':     return <td key={col} className="px-4 py-2 text-right text-xs font-semibold text-slate-700">${fmt(row.totalCost)}</td>;
      case 'marketValue':   return <td key={col} className="px-4 py-2 text-right text-xs font-semibold text-slate-700">${fmt(row.marketValue)}</td>;
      case 'dailyGain':     return <td key={col} />;
      case 'dailyPct':      return <td key={col} />;
      case 'unrealizedGain':return <td key={col} className={`px-4 py-2 text-right text-xs font-bold ${g >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{g >= 0 ? '+' : '-'}${fmt(Math.abs(g))}</td>;
      case 'unrealizedPct': return <td key={col} className={`px-4 py-2 text-right text-xs font-bold ${g >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{row.totalCost > 0 ? `${g >= 0 ? '+' : ''}${pct.toFixed(2)}%` : '—'}</td>;
      default:              return <td key={col} />;
    }
  };

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
      <div className="bg-white p-4 rounded border border-[#D2D2D7] relative z-30">
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center space-x-2">
            <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            <span className="text-sm font-bold text-slate-700">Filter</span>
          </div>

          <div className="flex flex-wrap items-center gap-4 flex-1">
            {/* Brokerage Filter */}
            <div className="relative" ref={brokerageMenuRef}>
              <label className="absolute -top-2 left-2 bg-white px-1 text-[9px] font-black text-[#0F52BA] uppercase tracking-tighter z-10">Brokerage</label>
              <button onClick={() => setIsBrokerageMenuOpen(!isBrokerageMenuOpen)} className="flex items-center justify-between pl-3 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-md text-sm font-medium text-slate-700 focus:ring-2 focus:ring-[#0F52BA] outline-none cursor-pointer min-w-[140px] text-left">
                <span className="truncate max-w-[100px]">{selectedBrokerages.length === 0 ? 'All Brokers' : selectedBrokerages.length === 1 ? selectedBrokerages[0] : `${selectedBrokerages.length} Brokers`}</span>
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
              <button onClick={() => setIsTickerMenuOpen(!isTickerMenuOpen)} className="flex items-center justify-between pl-3 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-md text-sm font-medium text-slate-700 focus:ring-2 focus:ring-[#0F52BA] outline-none cursor-pointer min-w-[140px] text-left">
                <span className="truncate max-w-[100px]">{selectedTickers.length === 0 ? 'All Tickers' : selectedTickers.length === 1 ? selectedTickers[0] : `${selectedTickers.length} Tickers`}</span>
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

            {/* Term Type Filter — lot-level; row totals reflect only matching lots */}
            <div className="relative" ref={termMenuRef}>
              <label className="absolute -top-2 left-2 bg-white px-1 text-[9px] font-black text-[#0F52BA] uppercase tracking-tighter z-10">Term Type</label>
              <button onClick={() => setIsTermMenuOpen(!isTermMenuOpen)} className="flex items-center justify-between pl-3 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-md text-sm font-medium text-slate-700 focus:ring-2 focus:ring-[#0F52BA] outline-none cursor-pointer min-w-[140px] text-left">
                <span className="truncate max-w-[100px] capitalize">{selectedTerms.length === 0 ? 'All Terms' : selectedTerms.length === 1 ? selectedTerms[0] : 'Long & Short'}</span>
                <svg className={`w-4 h-4 text-slate-400 transition-transform ${isTermMenuOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 9l-7 7-7-7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
              {isTermMenuOpen && (
                <div className="absolute top-full left-0 mt-2 w-56 bg-white border border-slate-200 rounded shadow-xl overflow-hidden z-50">
                  <div className="p-2 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <span className="text-[10px] font-black text-slate-400 uppercase px-2">Select Term Type</span>
                    {selectedTerms.length > 0 && <button onClick={() => setSelectedTerms([])} className="text-[10px] font-bold text-[#0F52BA] px-2">Clear</button>}
                  </div>
                  <div className="max-h-60 overflow-y-auto p-2 space-y-1">
                    {(['long', 'short'] as const).map(t => (
                      <label key={t} className="flex items-center px-3 py-2 rounded hover:bg-slate-50 cursor-pointer transition-colors">
                        <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-[#0F52BA] focus:ring-[#0F52BA]" checked={selectedTerms.includes(t)} onChange={() => toggleTerm(t)} />
                        <span className="ml-3 text-sm font-bold text-slate-700 capitalize">{t}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="w-px h-8 bg-slate-200 shrink-0" />

          <button onClick={resetFilters} className="text-xs font-bold text-slate-400 hover:text-[#0F52BA] transition-colors uppercase tracking-widest px-2 shrink-0">
            Reset
          </button>

          {onViewModeChange && (
            <>
              <div className="w-px h-8 bg-slate-200 shrink-0" />
              <div className="flex items-center rounded overflow-hidden border border-slate-200 shrink-0">
                <button onClick={() => onViewModeChange('ticker')} className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-widest transition-colors ${viewMode === 'ticker' ? 'bg-[#0F52BA] text-white' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}>By Ticker</button>
                <button onClick={() => onViewModeChange('brokerage')} className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-widest border-l border-slate-200 transition-colors ${viewMode === 'brokerage' ? 'bg-[#0F52BA] text-white' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}>By Brokerage</button>
              </div>
            </>
          )}
        </div>
      </div>

      {title && <h3 className="font-display text-2xl font-bold text-[#1D1D1F]">{title}</h3>}

      {/* Table */}
      <div className={!numbersVisible ? 'blur-sm select-none pointer-events-none' : ''}>
      {viewMode === 'ticker' && (tickerRows.length === 0 ? (
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
                {/* Fixed expand column */}
                <th className="px-4 py-2 w-8">
                  <button
                    onClick={() => { if (expandedTickers.size > 0) { setExpandedTickers(new Set()); setExpandedBrokerages(new Set()); } else setExpandedTickers(new Set(tickerRows.map(r => r.rowKey))); }}
                    className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-[#0F52BA] hover:bg-[#F5F5F7] transition-all"
                    title={expandedTickers.size > 0 ? 'Collapse all' : 'Expand all'}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      {expandedTickers.size > 0
                        ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
                        : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />}
                    </svg>
                  </button>
                </th>
                {columnOrder.map(renderTh)}
              </tr>
            </thead>
            <tbody>
              {tickerRows.map(row => {
                const isExpanded = expandedTickers.has(row.rowKey);
                return (
                  <React.Fragment key={row.rowKey}>

                    {/* Level 1 — Ticker */}
                    <tr className={`hover:bg-[#F5F5F7] transition-colors group border-t border-[#D2D2D7] ${isExpanded ? 'bg-slate-50/70' : ''}`}>
                      <td className="px-4 py-2">
                        {row.brokerageGroups.length > 0 && (
                          <button onClick={() => toggleTicker(row.rowKey)} className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-[#0F52BA] hover:bg-[#F5F5F7] transition-all">
                            <svg className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                            </svg>
                          </button>
                        )}
                      </td>
                      {columnOrder.map(col => renderL1(col, row))}
                    </tr>

                    {/* Level 2 — Brokerage rows */}
                    {isExpanded && row.brokerageGroups.map(bg => {
                      const brokerageKey = `${row.rowKey}::${bg.brokerage}`;
                      const isBrokerageExpanded = expandedBrokerages.has(brokerageKey);
                      return (
                        <React.Fragment key={brokerageKey}>

                          <tr className={`border-t border-[#D2D2D7] ${isBrokerageExpanded ? 'bg-[#0F52BA]/5' : 'bg-[#F5F5F7]'} hover:bg-[#0F52BA]/5 transition-colors`}>
                            <td className="pl-8 pr-4 py-2">
                              <button onClick={() => toggleBrokerageRow(brokerageKey)} className="w-5 h-5 flex items-center justify-center rounded-md text-[#D2D2D7] hover:text-[#0F52BA] hover:bg-[#E6EEFB] transition-all">
                                <svg className={`w-3 h-3 transition-transform ${isBrokerageExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                                </svg>
                              </button>
                            </td>
                            {columnOrder.map(col => renderL2(col, row, bg))}
                          </tr>

                          {/* Level 3 sub-header */}
                          {isBrokerageExpanded && (
                            <tr className="bg-[#E6EEFB]/30 border-t border-[#D2D2D7]/60">
                              <td />
                              {columnOrder.map(renderL3Header)}
                            </tr>
                          )}

                          {/* Level 3 — Lot rows */}
                          {isBrokerageExpanded && bg.lots.map((lot: UnrealizedLot, idx: number) => (
                            <tr
                              key={`${brokerageKey}-lot-${idx}`}
                              className={`bg-white border-t border-[#D2D2D7]/40 ${onNavigateToTransactions ? 'cursor-pointer hover:bg-[#E6EEFB]/40 group/lot' : ''}`}
                              onClick={() => onNavigateToTransactions?.(row.ticker, bg.brokerage, lot.buyDate)}
                            >
                              <td className="px-4 py-2">
                                <div className="flex justify-center pl-4">
                                  <div className="w-px h-full min-h-[16px] bg-[#D2D2D7]" />
                                </div>
                              </td>
                              {columnOrder.map(col => renderL3(col, row, lot))}
                            </tr>
                          ))}

                        </React.Fragment>
                      );
                    })}

                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}

      {/* Brokerage View */}
      {viewMode === 'brokerage' && (brokerageRows.length === 0 ? (
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
                <th className="px-4 py-2 w-8">
                  <button
                    onClick={() => { if (expandedBV_L1.size > 0) { setExpandedBV_L1(new Set()); setExpandedBV_L2(new Set()); setExpandedBV_L3(new Set()); } else setExpandedBV_L1(new Set(brokerageRows.map(r => r.brokerage))); }}
                    className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-[#0F52BA] hover:bg-[#F5F5F7] transition-all"
                    title={expandedBV_L1.size > 0 ? 'Collapse all' : 'Expand all'}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      {expandedBV_L1.size > 0
                        ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
                        : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />}
                    </svg>
                  </button>
                </th>
                {columnOrder.map(renderTh)}
              </tr>
            </thead>
            <tbody>
              {brokerageRows.map(bvRow => {
                const isL1 = expandedBV_L1.has(bvRow.brokerage);
                return (
                  <React.Fragment key={bvRow.brokerage}>

                    {/* L1 — Brokerage */}
                    <tr className={`hover:bg-[#F5F5F7] transition-colors border-t border-[#D2D2D7] ${isL1 ? 'bg-slate-50/70' : ''}`}>
                      <td className="px-4 py-2">
                        <button onClick={() => toggleBV_L1(bvRow.brokerage)} className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-[#0F52BA] hover:bg-[#F5F5F7] transition-all">
                          <svg className={`w-3.5 h-3.5 transition-transform ${isL1 ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                      </td>
                      {columnOrder.map(col => renderBVL1(col, bvRow))}
                    </tr>

                    {/* L2 — Account (skipped when brokerage has only one unnamed account) */}
                    {isL1 && (() => {
                      const skipL2 = bvRow.accounts.every(a => a.account_id === null);

                      const renderTickers = (acct: BVAccountRow, l2Key: string, tickerIndent: string, lotIndent: string) =>
                        acct.tickers.map((bvTicker: BVTickerRow) => {
                          const l3Key = `${l2Key}::${bvTicker.rowKey}`;
                          const isL3 = expandedBV_L3.has(l3Key);
                          const asTickerRow = { ...bvTicker, brokerageGroups: [], ids: [] } as unknown as TickerRow;
                          return (
                            <React.Fragment key={l3Key}>
                              <tr className={`hover:bg-[#F5F5F7] transition-colors group border-t border-[#D2D2D7] bg-white ${isL3 ? 'bg-slate-50/70' : ''}`}>
                                <td className={`${tickerIndent} pr-4 py-2`}>
                                  {bvTicker.lots.length > 0 && (
                                    <button onClick={() => toggleBV_L3(l3Key)} className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-[#0F52BA] hover:bg-[#F5F5F7] transition-all">
                                      <svg className={`w-3.5 h-3.5 transition-transform ${isL3 ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                                      </svg>
                                    </button>
                                  )}
                                </td>
                                {columnOrder.map(col => renderL1(col, asTickerRow, true))}
                              </tr>
                              {isL3 && (
                                <tr className="bg-[#E6EEFB]/30 border-t border-[#D2D2D7]/60">
                                  <td />
                                  {columnOrder.map(renderL3Header)}
                                </tr>
                              )}
                              {isL3 && bvTicker.lots.map((lot, idx) => (
                                <tr
                                  key={`${l3Key}-lot-${idx}`}
                                  className={`bg-white border-t border-[#D2D2D7]/40 ${onNavigateToTransactions ? 'cursor-pointer hover:bg-[#E6EEFB]/40 group/lot' : ''}`}
                                  onClick={() => onNavigateToTransactions?.(bvTicker.ticker, bvRow.brokerage, lot.buyDate)}
                                >
                                  <td className={`${lotIndent} py-2`}>
                                    <div className="flex justify-center pl-4">
                                      <div className="w-px h-full min-h-[16px] bg-[#D2D2D7]" />
                                    </div>
                                  </td>
                                  {columnOrder.map(col => renderL3(col, asTickerRow, lot))}
                                </tr>
                              ))}
                            </React.Fragment>
                          );
                        });

                      if (skipL2) {
                        return renderTickers(bvRow.accounts[0], `${bvRow.brokerage}::${bvRow.accounts[0].account_id ?? ''}::`, 'pl-8', 'pl-12');
                      }

                      return bvRow.accounts.map(acct => {
                        const l2Key = `${bvRow.brokerage}::${acct.account_id ?? ''}`;
                        const isL2 = expandedBV_L2.has(l2Key);
                        return (
                          <React.Fragment key={l2Key}>
                            <tr className={`border-t border-[#D2D2D7] ${isL2 ? 'bg-[#0F52BA]/5' : 'bg-[#F5F5F7]'} hover:bg-[#0F52BA]/5 transition-colors`}>
                              <td className="pl-8 pr-4 py-2">
                                <button onClick={() => toggleBV_L2(l2Key)} className="w-5 h-5 flex items-center justify-center rounded-md text-[#D2D2D7] hover:text-[#0F52BA] hover:bg-[#E6EEFB] transition-all">
                                  <svg className={`w-3 h-3 transition-transform ${isL2 ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                                  </svg>
                                </button>
                              </td>
                              {columnOrder.map(col => renderBVL2(col, acct))}
                            </tr>
                            {isL2 && renderTickers(acct, l2Key, 'pl-12', 'pl-16')}
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
      ))}
      </div>
    </div>
  );
};

export default HoldingsView;
