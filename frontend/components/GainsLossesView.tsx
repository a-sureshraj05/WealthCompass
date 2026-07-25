import React, { useState, useMemo, useRef, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';
import { RealizedGain, UnrealizedLot } from '../types';
import TickerLogo from './TickerLogo';
import SortIndicator from './SortIndicator';
import { useClickOutside } from '../hooks/useClickOutside';
import { formatCurrency, formatDate } from '../utils/finance';

type GainSortKey = 'ticker' | 'assetType' | 'brokerage' | 'buyDate' | 'sellDate' | 'quantity' | 'buyPrice' | 'price' | 'gain' | 'proceeds' | 'costBasis';
type SortDirection = 'asc' | 'desc' | null;

// ── Heatmap helpers ──────────────────────────────────────────────────────────

type HeatItem = { name: string; size: number; gain: number; shortTerm: number; longTerm: number; gainPct: number; costBasis: number; stPct: number; ltPct: number };
type HeatCell = HeatItem & { x: number; y: number; w: number; h: number };

function binaryLayout(items: HeatItem[], x: number, y: number, w: number, h: number, horiz: boolean): HeatCell[] {
  if (items.length === 0) return [];
  if (items.length === 1) return [{ ...items[0], x, y, w, h }];
  const total = items.reduce((s, d) => s + d.size, 0);
  let cum = 0;
  let split = 1;
  for (let i = 0; i < items.length - 1; i++) {
    cum += items[i].size;
    if (cum >= total / 2) { split = i + 1; break; }
  }
  const ratio = items.slice(0, split).reduce((s, d) => s + d.size, 0) / total;
  if (horiz) {
    const sw = w * ratio;
    return [...binaryLayout(items.slice(0, split), x, y, sw, h, !horiz),
            ...binaryLayout(items.slice(split), x + sw, y, w - sw, h, !horiz)];
  }
  const sh = h * ratio;
  return [...binaryLayout(items.slice(0, split), x, y, w, sh, !horiz),
          ...binaryLayout(items.slice(split), x, y + sh, w, h - sh, !horiz)];
}

const ST_COLOR = '#fb923c'; // orange-400 (light)
const LT_COLOR = '#60a5fa'; // blue-400 (light)

const GainHeatmap: React.FC<{ data: HeatItem[] }> = ({ data }) => {
  const GAP = 2;
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [tip, setTip] = React.useState<{ cell: HeatCell; x: number; y: number } | null>(null);
  const [dims, setDims] = React.useState({ w: 700, h: 256 });

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) setDims({ w: Math.round(width), h: Math.round(height) });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const cells = binaryLayout(data, 0, 0, dims.w, dims.h, dims.w > dims.h);

  return (
    <div ref={containerRef} className="relative w-full h-full">
      <svg width="100%" height="100%" viewBox={`0 0 ${dims.w} ${dims.h}`} preserveAspectRatio="none"
        onMouseLeave={() => setTip(null)}>
        {cells.map(cell => {
          const x = cell.x + GAP / 2, y = cell.y + GAP / 2;
          const w = cell.w - GAP, h = cell.h - GAP;
          if (w < 1 || h < 1) return null;
          const isPos = cell.gain >= 0;
          const fill = isPos ? '#10b981' : '#f43f5e';
          const abs = Math.abs(cell.gain);
          const lbl = abs >= 1000 ? `${cell.gain >= 0 ? '+' : '-'}$${(abs / 1000).toFixed(1)}k` : `${cell.gain >= 0 ? '+' : ''}$${cell.gain.toFixed(0)}`;
          const pctLbl = `${cell.gainPct >= 0 ? '+' : ''}${cell.gainPct.toFixed(1)}%`;
          // 15% stripe at bottom, 85% for main content
          const stripeH = h * 0.15;
          const textAreaH = h * 0.85;
          const denom = Math.abs(cell.shortTerm) + Math.abs(cell.longTerm);
          const stW = denom > 0 ? (Math.abs(cell.shortTerm) / denom) * w : 0;
          const ltW = w - stW;
          const stPct = denom > 0 ? (Math.abs(cell.shortTerm) / denom) * 100 : 0;
          const ltPct = denom > 0 ? (Math.abs(cell.longTerm) / denom) * 100 : 0;
          const showName = w > 28 && textAreaH > 20;
          const showGain = w > 38 && textAreaH > 36;
          const showPct  = w > 38 && textAreaH > 52;
          const minDim = Math.min(w, textAreaH);
          const fs = Math.min(24, Math.max(9, Math.min(w / Math.max(cell.name.length, 1) * 1.5, minDim * 0.22)));
          const subFs = Math.min(14, Math.max(9, minDim * 0.09));
          const stripeFs = Math.min(11, Math.max(8, stripeH * 0.45));
          const lineCount = (showName ? 1 : 0) + (showGain ? 1 : 0) + (showPct ? 1 : 0);
          const lineH = subFs + 4;
          const blockTop = textAreaH / 2 - ((lineCount - 1) * lineH) / 2;
          let lineY = y + blockTop;
          const stripeY = y + h - stripeH;
          return (
            <g key={cell.name} style={{ cursor: 'default' }}
              onMouseMove={e => {
                if (!containerRef.current) return;
                const r = containerRef.current.getBoundingClientRect();
                setTip({ cell, x: e.clientX - r.left, y: e.clientY - r.top });
              }}
              onMouseLeave={() => setTip(null)}>
              <rect x={x} y={y} width={w} height={h} fill={fill} fillOpacity={0.83} rx={3} />
              {/* ST stripe — orange */}
              {denom > 0 && stW > 0 && <rect x={x} y={stripeY} width={stW} height={stripeH} fill={ST_COLOR} fillOpacity={0.95} />}
              {/* LT stripe — blue */}
              {denom > 0 && ltW > 0 && <rect x={x + stW} y={stripeY} width={ltW} height={stripeH} fill={LT_COLOR} fillOpacity={0.95} />}
              {/* ST% label inside stripe */}
              {denom > 0 && stW > 28 && stripeH > 12 && (
                <text x={x + stW / 2} y={stripeY + stripeH * 0.72} textAnchor="middle" fill="#fff" fontSize={stripeFs} fontWeight="700">{cell.stPct >= 0 ? '+' : ''}{cell.stPct.toFixed(1)}%</text>
              )}
              {/* LT% label inside stripe */}
              {denom > 0 && ltW > 28 && stripeH > 12 && (
                <text x={x + stW + ltW / 2} y={stripeY + stripeH * 0.72} textAnchor="middle" fill="#fff" fontSize={stripeFs} fontWeight="700">{cell.ltPct >= 0 ? '+' : ''}{cell.ltPct.toFixed(1)}%</text>
              )}
              {showName && (() => { const ty = lineY; lineY += lineH; return (
                <text x={x + w / 2} y={ty} textAnchor="middle" fill="#fff" fontSize={fs} fontWeight="700">{cell.name}</text>
              ); })()}
              {showGain && (() => { const ty = lineY; lineY += lineH; return (
                <text x={x + w / 2} y={ty} textAnchor="middle" fill="#fff" fontSize={subFs} fontWeight="600" fillOpacity={0.9}>{lbl}</text>
              ); })()}
              {showPct && (() => { const ty = lineY; lineY += lineH; return (
                <text x={x + w / 2} y={ty} textAnchor="middle" fill="#fff" fontSize={subFs} fontWeight="600" fillOpacity={0.75}>{pctLbl}</text>
              ); })()}
            </g>
          );
        })}
      </svg>

      {/* Hover tooltip */}
      {tip && (
        <div className="absolute z-50 pointer-events-none"
          style={{
            left: Math.min(tip.x + 14, (containerRef.current?.offsetWidth ?? 9999) - 160),
            top: Math.max(tip.y - 80, 4),
          }}>
          <div className="bg-[#1D1D1F] rounded-lg px-3 py-2.5 shadow-xl text-xs min-w-[172px]">
            <p className="font-black text-white mb-2">{tip.cell.name}</p>
            <div className="space-y-1.5">
              {/* Net row */}
              <div className="flex justify-between gap-3 pb-1.5 border-b border-slate-700">
                <span className="text-slate-400">Net</span>
                <div className="text-right">
                  <span className={`font-bold block ${tip.cell.gain >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatCurrency(tip.cell.gain)}</span>
                  <span className={`text-[10px] ${tip.cell.gainPct >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>{tip.cell.gainPct >= 0 ? '+' : ''}{tip.cell.gainPct.toFixed(2)}%</span>
                </div>
              </div>
              {/* ST row */}
              <>
                <div className="flex justify-between gap-3">
                  <span className="font-semibold" style={{ color: ST_COLOR }}>Short-Term</span>
                  <div className="text-right">
                    <span className={`font-bold block ${tip.cell.shortTerm >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatCurrency(tip.cell.shortTerm)}</span>
                    <span className={`text-[10px] ${tip.cell.stPct >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>{tip.cell.stPct >= 0 ? '+' : ''}{tip.cell.stPct.toFixed(2)}%</span>
                  </div>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="font-semibold" style={{ color: LT_COLOR }}>Long-Term</span>
                  <div className="text-right">
                    <span className={`font-bold block ${tip.cell.longTerm >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatCurrency(tip.cell.longTerm)}</span>
                    <span className={`text-[10px] ${tip.cell.ltPct >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>{tip.cell.ltPct >= 0 ? '+' : ''}{tip.cell.ltPct.toFixed(2)}%</span>
                  </div>
                </div>
              </>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

type DailyItem = { name: string; size: number; dailyGain: number; dailyPct: number; marketValue: number; prevClose: number | null };
type DailyCell = DailyItem & { x: number; y: number; w: number; h: number };

function binaryLayoutDaily(items: DailyItem[], x: number, y: number, w: number, h: number, horiz: boolean): DailyCell[] {
  if (items.length === 0) return [];
  if (items.length === 1) return [{ ...items[0], x, y, w, h }];
  const total = items.reduce((s, d) => s + d.size, 0);
  let cum = 0, split = 1;
  for (let i = 0; i < items.length - 1; i++) {
    cum += items[i].size;
    if (cum >= total / 2) { split = i + 1; break; }
  }
  const ratio = items.slice(0, split).reduce((s, d) => s + d.size, 0) / total;
  if (horiz) {
    const sw = w * ratio;
    return [...binaryLayoutDaily(items.slice(0, split), x, y, sw, h, !horiz),
            ...binaryLayoutDaily(items.slice(split), x + sw, y, w - sw, h, !horiz)];
  }
  const sh = h * ratio;
  return [...binaryLayoutDaily(items.slice(0, split), x, y, w, sh, !horiz),
          ...binaryLayoutDaily(items.slice(split), x, y + sh, w, h - sh, !horiz)];
}

const DailyHeatmap: React.FC<{ data: DailyItem[] }> = ({ data }) => {
  const GAP = 2;
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [tip, setTip] = React.useState<{ cell: DailyCell; x: number; y: number } | null>(null);
  const [dims, setDims] = React.useState({ w: 700, h: 256 });

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) setDims({ w: Math.round(width), h: Math.round(height) });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const cells = binaryLayoutDaily(data, 0, 0, dims.w, dims.h, dims.w > dims.h);

  return (
    <div ref={containerRef} className="relative w-full h-full">
      <svg width="100%" height="100%" viewBox={`0 0 ${dims.w} ${dims.h}`} preserveAspectRatio="none"
        onMouseLeave={() => setTip(null)}>
        {cells.map(cell => {
          const x = cell.x + GAP / 2, y = cell.y + GAP / 2;
          const w = cell.w - GAP, h = cell.h - GAP;
          if (w < 1 || h < 1) return null;
          const isPos = cell.dailyGain >= 0;
          const fill = isPos ? '#10b981' : '#f43f5e';
          const abs = Math.abs(cell.dailyGain);
          const lbl = abs >= 1000 ? `${isPos ? '+' : '-'}$${(abs / 1000).toFixed(1)}k` : `${isPos ? '+' : ''}$${cell.dailyGain.toFixed(0)}`;
          const pctLbl = `${cell.dailyPct >= 0 ? '+' : ''}${cell.dailyPct.toFixed(2)}%`;
          const minDim = Math.min(w, h);
          const fs = Math.min(24, Math.max(9, Math.min(w / Math.max(cell.name.length, 1) * 1.5, minDim * 0.26)));
          const subFs = Math.min(14, Math.max(9, minDim * 0.11));
          const showName = w > 28 && h > 20;
          const showGain = w > 38 && h > 36;
          const showPct  = w > 38 && h > 52;
          const lineH = subFs + 4;
          const lineCount = (showName ? 1 : 0) + (showGain ? 1 : 0) + (showPct ? 1 : 0);
          const blockTop = h / 2 - ((lineCount - 1) * lineH) / 2;
          let lineY = y + blockTop;
          return (
            <g key={cell.name} style={{ cursor: 'default' }}
              onMouseMove={e => {
                if (!containerRef.current) return;
                const r = containerRef.current.getBoundingClientRect();
                setTip({ cell, x: e.clientX - r.left, y: e.clientY - r.top });
              }}
              onMouseLeave={() => setTip(null)}>
              <rect x={x} y={y} width={w} height={h} fill={fill} fillOpacity={0.83} rx={3} />
              {showName && (() => { const ty = lineY; lineY += lineH; return (
                <text x={x + w / 2} y={ty} textAnchor="middle" fill="#fff" fontSize={fs} fontWeight="700">{cell.name}</text>
              ); })()}
              {showGain && (() => { const ty = lineY; lineY += lineH; return (
                <text x={x + w / 2} y={ty} textAnchor="middle" fill="#fff" fontSize={subFs} fontWeight="600" fillOpacity={0.9}>{lbl}</text>
              ); })()}
              {showPct && (() => { const ty = lineY; lineY += lineH; return (
                <text x={x + w / 2} y={ty} textAnchor="middle" fill="#fff" fontSize={subFs} fontWeight="600" fillOpacity={0.75}>{pctLbl}</text>
              ); })()}
            </g>
          );
        })}
      </svg>

      {tip && (
        <div className="absolute z-50 pointer-events-none"
          style={{
            left: Math.min(tip.x + 14, (containerRef.current?.offsetWidth ?? 9999) - 160),
            top: Math.max(tip.y - 80, 4),
          }}>
          <div className="bg-[#1D1D1F] rounded-lg px-3 py-2.5 shadow-xl text-xs min-w-[172px]">
            <p className="font-black text-white mb-2">{tip.cell.name}</p>
            <div className="space-y-1.5">
              <div className="flex justify-between gap-3">
                <span className="text-slate-400">Day P&amp;L</span>
                <div className="text-right">
                  <span className={`font-bold block ${tip.cell.dailyGain >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatCurrency(tip.cell.dailyGain)}</span>
                  <span className={`text-[10px] ${tip.cell.dailyPct >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>{tip.cell.dailyPct >= 0 ? '+' : ''}{tip.cell.dailyPct.toFixed(2)}%</span>
                </div>
              </div>
              <div className="flex justify-between gap-3 pt-1 border-t border-slate-700">
                <span className="text-slate-400">Market Value</span>
                <span className="text-slate-200 font-semibold">{formatCurrency(tip.cell.marketValue)}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

interface Props {
  realizedGains: RealizedGain[];
  unrealizedGains: UnrealizedLot[];
  selectedBrokerages: string[];
  setSelectedBrokerages: (v: string[]) => void;
  selectedTickers: string[];
  setSelectedTickers: (v: string[]) => void;
  stTaxRate: number;
  setStTaxRate: (v: number) => void;
  ltTaxRate: number;
  setLtTaxRate: (v: number) => void;
  numbersVisible?: boolean;
}

const fmt = formatCurrency;
const fmtDate = formatDate;

const GainsLossesView: React.FC<Props> = ({ realizedGains: realizedGainsData, unrealizedGains: unrealizedGainsData, selectedBrokerages, setSelectedBrokerages, selectedTickers, setSelectedTickers, stTaxRate, setStTaxRate, ltTaxRate, setLtTaxRate, numbersVisible = true }) => {
  const [activeSubTab, setActiveSubTab] = useState<'realized' | 'unrealized'>('unrealized');
  const [selectedYear, setSelectedYear] = useState<string>('Overall');

  useEffect(() => {
    if (realizedGainsData.length === 0) return;
    const years = [...new Set(realizedGainsData.map(g => new Date(g.sellDate).getFullYear()))];
    const latest = Math.max(...years).toString();
    setSelectedYear(latest);
  }, [realizedGainsData]);


  const [isTickerMenuOpen, setIsTickerMenuOpen] = useState(false);
  const [isBrokerageMenuOpen, setIsBrokerageMenuOpen] = useState(false);

  const [heatmapMode, setHeatmapMode] = useState<'overall' | 'daily'>('daily');

  const [sortKey, setSortKey] = useState<GainSortKey | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  // Keys: 'ST'/'LT' (term level) and 'ST-EQ'/'ST-OPT'/'LT-EQ'/'LT-OPT' (sub level)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const toggleSection = (key: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };
  const [expandedTickers, setExpandedTickers] = useState<Set<string>>(new Set());

  const toggleTickerExpand = (key: string) => {
    setExpandedTickers(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const tickerMenuRef = useRef<HTMLDivElement>(null);
  const brokerageMenuRef = useRef<HTMLDivElement>(null);

  useClickOutside(
    [tickerMenuRef, brokerageMenuRef],
    [setIsTickerMenuOpen, setIsBrokerageMenuOpen],
  );

  const yoyData = useMemo(() => {
    if (activeSubTab !== 'realized') return [];
    const years: Record<string, { year: string; shortTerm: number; longTerm: number }> = {};
    realizedGainsData
      .filter(g => (selectedBrokerages.length === 0 || selectedBrokerages.includes(g.brokerage)) && (selectedTickers.length === 0 || selectedTickers.includes(g.ticker)))
      .forEach(g => {
        const year = new Date(g.sellDate).getFullYear().toString();
        if (!years[year]) years[year] = { year, shortTerm: 0, longTerm: 0 };
        if (g.isLongTerm) years[year].longTerm += g.gain;
        else years[year].shortTerm += g.gain;
      });
    return Object.values(years).sort((a, b) => a.year.localeCompare(b.year));
  }, [realizedGainsData, activeSubTab, selectedBrokerages, selectedTickers]);

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

  const availableYears = useMemo(() => {
    const years = new Set(realizedGainsData.map(g => new Date(g.sellDate).getFullYear().toString()));
    return ['Overall', ...Array.from(years)].sort((a, b) => b.localeCompare(a));
  }, [realizedGainsData]);

  const filteredData = useMemo(() => {
    const source = activeSubTab === 'realized' ? realizedGainsData : unrealizedGainsData;
    let result = source.filter(g => {
      const matchesTicker = selectedTickers.length === 0 || selectedTickers.includes(g.ticker);
      const matchesBrokerage = selectedBrokerages.length === 0 || selectedBrokerages.includes(g.brokerage);
      if (activeSubTab === 'realized') {
        const year = new Date((g as RealizedGain).sellDate).getFullYear().toString();
        return matchesTicker && matchesBrokerage && (selectedYear === 'Overall' || year === selectedYear);
      }
      return matchesTicker && matchesBrokerage;
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
  }, [realizedGainsData, unrealizedGainsData, selectedTickers, selectedBrokerages, selectedYear, activeSubTab, sortKey, sortDirection]);

  const isOpt = (g: RealizedGain | UnrealizedLot) => (g.assetType || '').toLowerCase() === 'options';
  // Top-level split is Short-Term vs Long-Term; each term is further split into
  // Equity and Options. Options now follow the same >365-day rule as equities.
  const stEquity  = filteredData.filter(g => !isOpt(g) && !g.isLongTerm);
  const stOptions = filteredData.filter(g =>  isOpt(g) && !g.isLongTerm);
  const ltEquity  = filteredData.filter(g => !isOpt(g) &&  g.isLongTerm);
  const ltOptions = filteredData.filter(g =>  isOpt(g) &&  g.isLongTerm);

  const treemapData = useMemo(() => {
    if (activeSubTab !== 'unrealized') return [];
    const map: Record<string, { shortTerm: number; longTerm: number; costBasis: number }> = {};
    filteredData.forEach(lot => {
      const l = lot as UnrealizedLot;
      if (!map[l.ticker]) map[l.ticker] = { shortTerm: 0, longTerm: 0, costBasis: 0 };
      const isOpt = (l.assetType || '').toLowerCase() === 'options';
      map[l.ticker].costBasis += (l.buyPrice || 0) * (l.quantity || 0) * (isOpt ? 100 : 1);
      if (l.isLongTerm) map[l.ticker].longTerm += l.gain;
      else map[l.ticker].shortTerm += l.gain;
    });
    return Object.entries(map)
      .map(([name, { shortTerm, longTerm, costBasis }]) => {
        const gain = shortTerm + longTerm;
        return {
          name, shortTerm, longTerm, costBasis,
          gain,
          gainPct: costBasis > 0 ? (gain / costBasis) * 100 : 0,
          stPct: costBasis > 0 ? (shortTerm / costBasis) * 100 : 0,
          ltPct: costBasis > 0 ? (longTerm / costBasis) * 100 : 0,
          size: Math.abs(gain),
        };
      })
      .filter(d => d.size > 0)
      .sort((a, b) => b.size - a.size);
  }, [filteredData, activeSubTab]);

  const dailyHeatmapData = useMemo(() => {
    if (activeSubTab !== 'unrealized') return [];
    const map: Record<string, { dailyGain: number; marketValue: number; prevClose: number | null }> = {};
    filteredData.forEach(lot => {
      const l = lot as UnrealizedLot;
      // Skip options — prevClose for options is the option price itself, not useful as a daily equity move
      if ((l.assetType || '').toLowerCase() === 'options') return;
      if (l.prevClose == null) return;
      if (!map[l.ticker]) map[l.ticker] = { dailyGain: 0, marketValue: 0, prevClose: l.prevClose };
      const dailyMove = (l.currentPrice - l.prevClose) * l.quantity;
      map[l.ticker].dailyGain += dailyMove;
      map[l.ticker].marketValue += l.currentPrice * l.quantity;
    });
    return Object.entries(map)
      .map(([name, { dailyGain, marketValue, prevClose }]) => ({
        name,
        dailyGain,
        marketValue,
        dailyPct: marketValue > 0 ? ((dailyGain / (marketValue - dailyGain)) * 100) : 0,
        size: Math.abs(dailyGain),
        prevClose,
      }))
      .filter(d => d.size > 0.005)
      .sort((a, b) => b.size - a.size);
  }, [filteredData, activeSubTab]);

  const stats = useMemo(() => {
    const sumGain = (lots: (RealizedGain | UnrealizedLot)[]) => lots.reduce((s, g) => s + g.gain, 0);
    const stEqTotal  = sumGain(stEquity);
    const stOptTotal = sumGain(stOptions);
    const ltEqTotal  = sumGain(ltEquity);
    const ltOptTotal = sumGain(ltOptions);
    const stTotal = stEqTotal + stOptTotal;
    const ltTotal = ltEqTotal + ltOptTotal;

    // Cross-bucket offsetting between the two term totals.
    const netST = stTotal;
    const netLT = ltTotal;
    let stTax = 0;
    let ltTax = 0;
    if (netST >= 0 && netLT >= 0) {
      stTax = netST * (stTaxRate / 100);
      ltTax = netLT * (ltTaxRate / 100);
    } else if (netST < 0 && netLT > 0) {
      ltTax = Math.max(0, netLT + netST) * (ltTaxRate / 100);
    } else if (netST > 0 && netLT < 0) {
      stTax = Math.max(0, netST + netLT) * (stTaxRate / 100);
    }
    const taxEst = stTax + ltTax;
    const total = stTotal + ltTotal;

    const isRealized = activeSubTab === 'realized';
    const sectionMV = (lots: (RealizedGain | UnrealizedLot)[], isOpts: boolean) => {
      const m = isOpts ? 100 : 1;
      return lots.reduce((sum, g) => {
        const price = isRealized ? (g as RealizedGain).sellPrice : (g as UnrealizedLot).currentPrice;
        return sum + g.quantity * (price ?? 0) * m;
      }, 0);
    };
    const sectionCost = (lots: (RealizedGain | UnrealizedLot)[], isOpts: boolean) => {
      const m = isOpts ? 100 : 1;
      return lots.reduce((sum, g) => sum + g.quantity * g.buyPrice * m, 0);
    };
    const pct = (gain: number, cost: number) => (cost > 0 ? (gain / cost) * 100 : 0);

    const stEqMV  = sectionMV(stEquity, false),  stOptMV = sectionMV(stOptions, true);
    const ltEqMV  = sectionMV(ltEquity, false),  ltOptMV = sectionMV(ltOptions, true);
    const stEqCost  = sectionCost(stEquity, false),  stOptCost = sectionCost(stOptions, true);
    const ltEqCost  = sectionCost(ltEquity, false),  ltOptCost = sectionCost(ltOptions, true);

    return {
      stEqTotal, stOptTotal, ltEqTotal, ltOptTotal,
      stTotal, ltTotal, total, taxEst, stTax, ltTax,
      stMV: stEqMV + stOptMV, ltMV: ltEqMV + ltOptMV,
      stEqMV, stOptMV, ltEqMV, ltOptMV,
      stEqPct:  pct(stEqTotal, stEqCost),   stOptPct: pct(stOptTotal, stOptCost),
      ltEqPct:  pct(ltEqTotal, ltEqCost),   ltOptPct: pct(ltOptTotal, ltOptCost),
      stPct: pct(stTotal, stEqCost + stOptCost),
      ltPct: pct(ltTotal, ltEqCost + ltOptCost),
    };
  }, [stEquity, stOptions, ltEquity, ltOptions, stTaxRate, ltTaxRate, activeSubTab]);

  const toggleTicker = (ticker: string) => setSelectedTickers(selectedTickers.includes(ticker) ? selectedTickers.filter(t => t !== ticker) : [...selectedTickers, ticker]);
  const toggleBrokerage = (broker: string) => setSelectedBrokerages(selectedBrokerages.includes(broker) ? selectedBrokerages.filter(b => b !== broker) : [...selectedBrokerages, broker]);

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


  const GainTableSection = ({ title, data, prefix, isOptions: sectionIsOptions }: { title: string; data: (RealizedGain | UnrealizedLot)[]; prefix: string; isOptions: boolean }) => {
    const m = sectionIsOptions ? 100 : 1;

    type TickerEntry = { lots: (RealizedGain | UnrealizedLot)[]; totalQty: number; totalCost: number; totalProceeds: number; totalGain: number; brokerages: string[]; assetType: string };
    const tickerMap = new Map<string, TickerEntry>();
    const tickerOrder: string[] = [];

    data.forEach(g => {
      const proc = activeSubTab === 'realized'
        ? g.quantity * (g as RealizedGain).sellPrice * m
        : g.quantity * (g as UnrealizedLot).currentPrice * m;
      const cost = g.quantity * g.buyPrice * m;
      if (!tickerMap.has(g.ticker)) {
        tickerMap.set(g.ticker, { lots: [], totalQty: 0, totalCost: 0, totalProceeds: 0, totalGain: 0, brokerages: [], assetType: g.assetType || 'Equity' });
        tickerOrder.push(g.ticker);
      }
      const tEntry = tickerMap.get(g.ticker)!;
      tEntry.lots.push(g);
      tEntry.totalQty += g.quantity;
      tEntry.totalCost += cost;
      tEntry.totalProceeds += proc;
      tEntry.totalGain += g.gain;
      if (!tEntry.brokerages.includes(g.brokerage)) tEntry.brokerages.push(g.brokerage);
    });

    const sortedTickers: [string, TickerEntry][] = tickerOrder.map(t => [t, tickerMap.get(t)!]);
    if (sortKey && sortDirection) {
      sortedTickers.sort(([, a], [, b]) => {
        let va: any, vb: any;
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
                { key: 'ticker', label: 'Ticker', align: 'left' },
                { key: 'brokerage', label: 'Brokerage', align: 'left' },
                { key: 'quantity', label: sectionIsOptions ? 'Contracts' : 'Qty', align: 'right' },
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
            {sortedTickers.map(([ticker, tEntry]) => {
              const tkKey = `${prefix}-${ticker}`;
              const tkExpanded = expandedTickers.has(tkKey);
              return (
                <React.Fragment key={ticker}>
                  {/* ── Ticker row (Level 2) ── */}
                  <tr
                    className="border-b border-[#D2D2D7] hover:bg-[#F5F5F7]/60 transition-colors cursor-pointer select-none"
                    onClick={() => toggleTickerExpand(tkKey)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <svg className={`w-3.5 h-3.5 text-slate-400 transition-transform shrink-0 ${tkExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                        </svg>
                        <TickerLogo ticker={ticker} size={28} assetType={tEntry.assetType} />
                        <div>
                          <p className="text-xs font-bold text-[#1D1D1F] uppercase tracking-tight">{ticker}</p>
                          <p className="text-[10px] text-slate-400">{tEntry.lots.length} lot{tEntry.lots.length !== 1 ? 's' : ''}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">{tEntry.brokerages.map(b => badge(b))}</div>
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-slate-900 font-bold">
                      {tEntry.totalQty % 1 === 0 ? tEntry.totalQty.toFixed(0) : tEntry.totalQty.toFixed(4)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-slate-700 font-semibold">{fmt(tEntry.totalProceeds)}</td>
                    <td className="px-4 py-3 text-right text-sm text-slate-500">{fmt(tEntry.totalCost)}</td>
                    <td className={`px-4 py-3 text-right text-sm font-black ${tEntry.totalGain >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {tEntry.totalGain >= 0 ? '+' : '-'}${Math.abs(tEntry.totalGain).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>

                  {/* ── Individual lot rows (Level 3) ── */}
                  {tkExpanded && tEntry.lots.map((g, i) => {
                    const proc = activeSubTab === 'realized'
                      ? g.quantity * (g as RealizedGain).sellPrice * m
                      : g.quantity * (g as UnrealizedLot).currentPrice * m;
                    const cost = g.quantity * g.buyPrice * m;
                    const isLast = i === tEntry.lots.length - 1;

                    return (
                      <tr key={g.id} className={`bg-[#FAFAFA] hover:bg-[#F2F2F7] transition-colors ${isLast ? 'border-b border-[#D2D2D7]' : 'border-b border-[#EBEBEB]'}`}>
                        <td className="px-4 py-2 pl-14">
                          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium">
                            <span className="text-slate-300 text-xs">↳</span>
                            <span>Opened {fmtDate(g.buyDate)}</span>
                            {activeSubTab === 'realized' && (
                              <span className="text-slate-400">→ Closed {fmtDate((g as RealizedGain).sellDate)}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2">{badge(g.brokerage)}</td>
                        <td className="px-4 py-2 text-right text-[11px] text-slate-700 font-medium">
                          {g.quantity.toFixed(g.quantity % 1 === 0 ? 0 : 4)}
                        </td>
                        <td className="px-4 py-2 text-right text-[11px] text-slate-600">{fmt(proc)}</td>
                        <td className="px-4 py-2 text-right text-[11px] text-slate-400">{fmt(cost)}</td>
                        <td className={`px-4 py-2 text-right text-[11px] font-bold ${g.gain >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {g.gain >= 0 ? '+' : '-'}${Math.abs(g.gain).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
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

  // Equity / Options sub-section inside a term. Returns null when empty.
  const renderSubSection = (
    key: string, label: string, data: (RealizedGain | UnrealizedLot)[],
    isOptions: boolean, mv: number, gain: number, gainPct: number,
  ) => {
    if (data.length === 0) return null;
    const expanded = expandedSections.has(key);
    return (
      <div className="space-y-2">
        <button
          onClick={() => toggleSection(key)}
          className="w-full pl-4 pr-4 py-2.5 bg-[#FAFAFA] rounded border border-[#E5E5EA] flex items-center justify-between hover:bg-[#F0F0F2] transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <svg className={`w-3.5 h-3.5 text-slate-400 transition-transform ${expanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
            </svg>
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{label}</span>
            <span className="text-[10px] text-slate-400 font-medium">· {data.length} lot{data.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-32 text-right">
              <p className="text-[8px] font-semibold text-slate-400 uppercase tracking-widest mb-0.5">Market Value</p>
              <p className="text-xs font-black text-slate-700">${mv.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
            <div className="w-40 text-right">
              <p className="text-[8px] font-semibold text-slate-400 uppercase tracking-widest mb-0.5">Gain / Loss</p>
              <p className={`text-xs font-black ${gain >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {gain >= 0 ? '+' : '-'}${Math.abs(gain).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                <span className="text-[9px] ml-1 opacity-75">({gainPct >= 0 ? '+' : ''}{gainPct.toFixed(2)}%)</span>
              </p>
            </div>
          </div>
        </button>
        {expanded && <GainTableSection title={label} data={data} prefix={key} isOptions={isOptions} />}
      </div>
    );
  };

  // Top-level Short-Term / Long-Term term section wrapping the two sub-sections.
  const renderTerm = (cfg: {
    key: string; label: string; heldText: string; color: string;
    eqData: (RealizedGain | UnrealizedLot)[]; optData: (RealizedGain | UnrealizedLot)[];
    mv: number; gain: number; gainPct: number;
    eqMV: number; eqGain: number; eqPct: number;
    optMV: number; optGain: number; optPct: number;
  }) => {
    const expanded = expandedSections.has(cfg.key);
    const lotCount = cfg.eqData.length + cfg.optData.length;
    return (
      <div className="space-y-3">
        <button
          onClick={() => toggleSection(cfg.key)}
          className="w-full p-4 bg-white rounded border border-[#D2D2D7] flex items-center justify-between hover:bg-[#F5F5F7] transition-colors"
        >
          <div className="flex items-center gap-3">
            <svg className={`w-4 h-4 text-slate-400 transition-transform ${expanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
            </svg>
            <div className="text-left">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: cfg.color }} />
                <h4 className="text-[11px] font-black text-slate-700 uppercase tracking-widest">{cfg.label}</h4>
                <span className="text-[10px] text-slate-400 font-medium">· {cfg.heldText} · {lotCount} lot{lotCount !== 1 ? 's' : ''}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-36 text-right">
              <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest mb-0.5">Market Value</p>
              <p className="text-sm font-black text-slate-700">${cfg.mv.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
            <div className="w-44 text-right">
              <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest mb-0.5">Gain / Loss</p>
              <p className={`text-sm font-black ${cfg.gain >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {cfg.gain >= 0 ? '+' : '-'}${Math.abs(cfg.gain).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                <span className="text-[10px] ml-1 opacity-75">({cfg.gainPct >= 0 ? '+' : ''}{cfg.gainPct.toFixed(2)}%)</span>
              </p>
            </div>
          </div>
        </button>
        {expanded && (
          lotCount === 0 ? (
            <div className="ml-3 rounded border border-[#E5E5EA] bg-white px-6 py-8 text-center text-slate-400 text-xs italic">
              No {cfg.label.toLowerCase()} entries for the current filter.
            </div>
          ) : (
            <div className="ml-3 space-y-2">
              {renderSubSection(`${cfg.key}-EQ`, 'Equity', cfg.eqData, false, cfg.eqMV, cfg.eqGain, cfg.eqPct)}
              {renderSubSection(`${cfg.key}-OPT`, 'Options', cfg.optData, true, cfg.optMV, cfg.optGain, cfg.optPct)}
            </div>
          )
        )}
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
          <div className="max-h-80 overflow-y-auto p-1.5 space-y-0.5">{children}</div>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6">

      {/* Sub-tabs — underline style */}
      <div className="flex items-center border-b border-[#D2D2D7]">
        {(['unrealized', 'realized'] as const).map(tab => (
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

      {/* Chart + table — blurred when numbers hidden */}
      <div className={`space-y-4 ${!numbersVisible ? 'blur-sm select-none pointer-events-none' : ''}`}>
      <div>
        <div className="bg-white p-6 rounded border border-[#D2D2D7]">
          <div className="flex items-center justify-between mb-5">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              {activeSubTab === 'realized' ? 'Yearly Realized Profit Split' : 'Unrealized Gain · Ticker Heatmap'}
            </p>
            {activeSubTab === 'unrealized' && (
              <div className="flex rounded overflow-hidden border border-[#D2D2D7] text-[10px] font-bold">
                {(['daily', 'overall'] as const).map(mode => (
                  <button key={mode} onClick={() => setHeatmapMode(mode)}
                    className={`px-3 py-1 uppercase tracking-widest transition-colors ${heatmapMode === mode ? 'bg-[#1D1D1F] text-white' : 'bg-white text-slate-400 hover:text-slate-600'}`}>
                    {mode}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="h-[393px]">
            {activeSubTab === 'unrealized' ? (
              heatmapMode === 'overall' ? (
                treemapData.length > 0 ? (
                  <div className="h-full flex flex-col gap-1">
                    <div className="flex-1 min-h-0">
                      <GainHeatmap data={treemapData} />
                    </div>
                    {/* Legend */}
                    <div className="flex items-center gap-4 px-1">
                      <div className="flex items-center gap-1.5">
                        <span className="w-6 h-2 rounded-sm inline-block" style={{ backgroundColor: ST_COLOR }} />
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Short-Term</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-6 h-2 rounded-sm inline-block" style={{ backgroundColor: LT_COLOR }} />
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Long-Term</span>
                      </div>
                      <span className="text-[9px] text-slate-300 italic ml-1">stripe at tile base</span>
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center text-slate-400 text-xs italic">No data to visualize</div>
                )
              ) : (
                dailyHeatmapData.length > 0 ? (
                  <div className="h-full flex flex-col gap-1">
                    <div className="flex-1 min-h-0">
                      <DailyHeatmap data={dailyHeatmapData} />
                    </div>
                    <div className="flex items-center gap-1 px-1">
                      <span className="text-[9px] text-slate-300 italic">sized by |day P&amp;L|  ·  equities only  ·  prev close → current price</span>
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center text-slate-400 text-xs italic">No daily data available — sync to refresh prices</div>
                )
              )
            ) : (
              waterfallData.length > 1 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={waterfallData} margin={{ top: 24, right: 8, left: 8, bottom: 5 }} barCategoryGap="30%">
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }}
                      tickFormatter={(v) => `${v < 0 ? '-' : ''}$${Math.abs(v) >= 1000 ? `${(Math.abs(v) / 1000).toFixed(0)}k` : Math.abs(v)}`} />
                    <ReferenceLine y={0} stroke="#D2D2D7" strokeWidth={1} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: '700', paddingTop: '8px' }}
                      formatter={(value) => <span style={{ color: value === 'Short Term' ? ST_COLOR : LT_COLOR }}>{value}</span>}
                    />
                    <Tooltip
                      cursor={{ fill: '#f8fafc' }}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0]?.payload;
                        if (!d) return null;
                        const total = Math.abs(d.shortTerm) + Math.abs(d.longTerm);
                        const stPct = total > 0 ? (Math.abs(d.shortTerm) / total * 100).toFixed(0) : '0';
                        const ltPct = total > 0 ? (Math.abs(d.longTerm) / total * 100).toFixed(0) : '0';
                        return (
                          <div style={{ background: '#fff', border: '1px solid #E5E5E5', borderRadius: 8, padding: '10px 14px', fontSize: 11, boxShadow: '0 4px 16px rgba(0,0,0,0.10)' }}>
                            <p style={{ fontWeight: 800, color: '#1D1D1F', marginBottom: 6 }}>{d.label}</p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 4 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
                                <span style={{ color: ST_COLOR, fontWeight: 700 }}>ST <span style={{ opacity: 0.6, fontSize: 10 }}>{stPct}%</span></span>
                                <span style={{ color: d.shortTerm >= 0 ? '#10b981' : '#f43f5e', fontWeight: 700 }}>{fmt(d.shortTerm)}</span>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
                                <span style={{ color: LT_COLOR, fontWeight: 700 }}>LT <span style={{ opacity: 0.6, fontSize: 10 }}>{ltPct}%</span></span>
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
                    <Bar dataKey="shortTerm" name="Short Term" stackId="a" fill={ST_COLOR} radius={[0, 0, 0, 0]}
                      label={{
                        content: (props: any) => {
                          const d = waterfallData[props.index];
                          if (!d || Math.abs(d.shortTerm) < 1) return null;
                          const barH = Math.abs(props.height);
                          if (barH < 16) return null;
                          const total = Math.abs(d.shortTerm) + Math.abs(d.longTerm);
                          const pct = total > 0 ? (Math.abs(d.shortTerm) / total * 100).toFixed(0) : '0';
                          return <text x={props.x + props.width / 2} y={props.y + barH / 2 + 4} textAnchor="middle" fontSize={9} fontWeight="700" fill="#fff">{pct}%</text>;
                        }
                      }}
                    >
                      {waterfallData.map((d, i) => (
                        <Cell key={i} fill={ST_COLOR} fillOpacity={d.label === 'Total' ? 1 : 0.85} />
                      ))}
                    </Bar>
                    <Bar dataKey="longTerm" name="Long Term" stackId="a" fill={LT_COLOR} radius={[3, 3, 0, 0]}
                      label={{
                        content: (props: any) => {
                          const d = waterfallData[props.index];
                          if (!d || Math.abs(d.longTerm) < 1) return null;
                          const barH = Math.abs(props.height);
                          const total = Math.abs(d.shortTerm) + Math.abs(d.longTerm);
                          const pct = total > 0 ? (Math.abs(d.longTerm) / total * 100).toFixed(0) : '0';
                          const topOfStack = Math.min(props.y, props.y + props.height);
                          return (
                            <g>
                              {/* % inside LT bar segment */}
                              {barH >= 16 && <text x={props.x + props.width / 2} y={props.y + barH / 2 + 4} textAnchor="middle" fontSize={9} fontWeight="700" fill="#fff">{pct}%</text>}
                              {/* net total above bar */}
                              {Math.abs(d.net) >= 1 && (() => {
                                const abs = Math.abs(d.net);
                                const lbl = abs >= 1000 ? `${d.net >= 0 ? '+' : '-'}$${(abs / 1000).toFixed(1)}k` : `${d.net >= 0 ? '+' : '-'}$${abs.toFixed(0)}`;
                                return <text x={props.x + props.width / 2} y={topOfStack - 5} textAnchor="middle" fontSize={9} fontWeight="bold" fill="#1e293b">{lbl}</text>;
                              })()}
                            </g>
                          );
                        }
                      }}
                    >
                      {waterfallData.map((d, i) => (
                        <Cell key={i} fill={LT_COLOR} fillOpacity={d.label === 'Total' ? 1 : 0.85} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-400 text-xs italic">No data to visualize</div>
              )
            )}
          </div>
        </div>
      </div>

      {/* Row 2 — Filter card (filters only, no duplicate stats) */}
      <div className="bg-white rounded border border-[#D2D2D7] px-5 py-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 mr-2">
          <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Filters</span>
        </div>

        {activeSubTab === 'realized' && (
          <div className="relative">
            <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)}
              className="appearance-none pl-3 pr-7 py-1.5 bg-white border border-[#D2D2D7] rounded text-[11px] font-bold text-slate-600 uppercase tracking-wide focus:outline-none focus:ring-2 focus:ring-[#0F52BA] cursor-pointer hover:border-[#0F52BA] transition-colors">
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

        <FilterDropdown label="Ticker" refEl={tickerMenuRef} isOpen={isTickerMenuOpen} onToggle={() => setIsTickerMenuOpen(v => !v)} count={selectedTickers.length} onClear={() => setSelectedTickers([])}>
          {uniqueTickers.map(ticker => (
            <label key={ticker} className="flex items-center gap-2.5 px-3 py-1.5 rounded hover:bg-slate-50 cursor-pointer">
              <input type="checkbox" className="w-3.5 h-3.5 rounded border-slate-300 text-[#0F52BA] focus:ring-[#0F52BA]" checked={selectedTickers.includes(ticker)} onChange={() => toggleTicker(ticker)} />
              <span className="text-xs font-medium text-slate-700">{ticker}</span>
            </label>
          ))}
        </FilterDropdown>

        <span className="ml-auto text-[10px] text-slate-400 font-medium">{filteredData.length} lots</span>
      </div>

      {/* Row 3 — Stats card */}
      <div className="bg-white rounded border border-[#D2D2D7] px-6 py-4">
        <div className="flex">

          {/* Col 1 — Total Gain + Tax Est. */}
          <div className="flex-1 flex flex-col justify-between gap-3 pr-6 border-r border-[#E5E5EA]">
            <div className="flex flex-col gap-3 w-fit">
              <div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Total {activeSubTab === 'realized' ? 'Realized' : 'Unrealized'} Gain</p>
                <p className={`text-2xl font-black ${stats.total >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {stats.total >= 0 ? '+' : ''}{fmt(stats.total)}
                </p>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded px-2.5 py-1.5">
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Tax Est.</p>
                <p className="text-sm font-black text-slate-500">{fmt(stats.taxEst)}</p>
              </div>
            </div>
          </div>

          {/* Col 2 — Short-Term (equity + options) + ST Tax (orange) */}
          <div className="flex-1 flex flex-col justify-between gap-3 px-6 border-r border-[#E5E5EA]">
            <div className="flex flex-col gap-3 w-fit">
              <div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Short-Term</p>
                <p className={`text-2xl font-black ${stats.stTotal >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{fmt(stats.stTotal)}</p>
                <p className="text-[9px] text-slate-400 font-medium mt-0.5">eq {fmt(stats.stEqTotal)} · opt {fmt(stats.stOptTotal)}</p>
              </div>
              <div className="bg-orange-50 border border-orange-100 rounded px-2.5 py-1.5">
                <p className="text-[8px] font-black uppercase tracking-widest mb-0.5" style={{ color: ST_COLOR }}>ST Tax</p>
                <p className="text-sm font-black" style={{ color: ST_COLOR }}>{fmt(stats.stTax)}</p>
              </div>
            </div>
          </div>

          {/* Col 3 — Long-Term (equity + options) + LT Tax (blue) */}
          <div className="flex-1 flex flex-col justify-between gap-3 px-6 border-r border-[#E5E5EA]">
            <div className="flex flex-col gap-3 w-fit">
              <div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Long-Term</p>
                <p className={`text-2xl font-black ${stats.ltTotal >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{fmt(stats.ltTotal)}</p>
                <p className="text-[9px] text-slate-400 font-medium mt-0.5">eq {fmt(stats.ltEqTotal)} · opt {fmt(stats.ltOptTotal)}</p>
              </div>
              <div className="bg-blue-50 border border-blue-100 rounded px-2.5 py-1.5">
                <p className="text-[8px] font-black uppercase tracking-widest mb-0.5" style={{ color: LT_COLOR }}>LT Tax</p>
                <p className="text-sm font-black" style={{ color: LT_COLOR }}>{fmt(stats.ltTax)}</p>
              </div>
            </div>
          </div>

          {/* Col 5 — Rate inputs */}
          <div className="flex-1 flex flex-col justify-center gap-2.5 pl-6">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Tax Rates</p>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-400 w-6">ST</span>
              <input type="number" value={stTaxRate} onChange={e => setStTaxRate(Number(e.target.value))}
                className="w-12 px-1.5 py-1 bg-orange-50 border border-orange-200 rounded text-[11px] font-bold text-center focus:outline-none focus:ring-1 focus:ring-orange-400" style={{ color: ST_COLOR }} title="Short-term rate %" />
              <span className="text-[10px] text-slate-400">%</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-400 w-6">LT</span>
              <input type="number" value={ltTaxRate} onChange={e => setLtTaxRate(Number(e.target.value))}
                className="w-12 px-1.5 py-1 bg-blue-50 border border-blue-200 rounded text-[11px] font-bold text-center focus:outline-none focus:ring-1 focus:ring-blue-400" style={{ color: LT_COLOR }} title="Long-term rate %" />
              <span className="text-[10px] text-slate-400">%</span>
            </div>
          </div>

        </div>
      </div>

      {/* Short-Term / Long-Term sections — each split into Equity + Options */}
      <div className="space-y-4">
        {renderTerm({
          key: 'ST', label: 'Short-Term', heldText: 'held ≤ 1 year', color: ST_COLOR,
          eqData: stEquity, optData: stOptions,
          mv: stats.stMV, gain: stats.stTotal, gainPct: stats.stPct,
          eqMV: stats.stEqMV, eqGain: stats.stEqTotal, eqPct: stats.stEqPct,
          optMV: stats.stOptMV, optGain: stats.stOptTotal, optPct: stats.stOptPct,
        })}
        {renderTerm({
          key: 'LT', label: 'Long-Term', heldText: 'held > 1 year', color: LT_COLOR,
          eqData: ltEquity, optData: ltOptions,
          mv: stats.ltMV, gain: stats.ltTotal, gainPct: stats.ltPct,
          eqMV: stats.ltEqMV, eqGain: stats.ltEqTotal, eqPct: stats.ltEqPct,
          optMV: stats.ltOptMV, optGain: stats.ltOptTotal, optPct: stats.ltOptPct,
        })}
      </div>
      </div>

    </div>
  );
};

export default GainsLossesView;
