import type { RealizedGain, UnrealizedLot } from '../../types';
import { optionsMultiplier } from '../../utils/finance.ts';

export type GainsMode = 'unrealized' | 'realized';
export type TaxTerm = 'short' | 'long';
export interface GainFilters { brokerages: readonly string[]; tickers: readonly string[]; terms: readonly TaxTerm[]; year: string }
export interface GainRow {
  id: string; ticker: string; brokerage: string; assetType: string; buyDate: string; sellDate?: string;
  quantity: number; buyPrice: number; price: number; cost: number; value: number; gain: number;
  term: TaxTerm; isOption: boolean; previousClose?: number; washSale: boolean; washAmount: number; washRisk: boolean;
  optionSymbol?: string;
}
export interface HoldingResult { ticker: string; gain: number; cost: number; value: number; exposure: number; percent: number | null; lots: number; shortTerm: number; longTerm: number }
export const gainPercent = (gain: number, cost: number): number | null => cost > 0 ? gain / cost * 100 : null;
export const clampTaxRate = (value: number) => Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;

export function normalizeGainRows(rows: readonly (RealizedGain | UnrealizedLot)[], mode: GainsMode): GainRow[] {
  return rows.map(row => {
    const multiplier = optionsMultiplier(row.assetType);
    const price = mode === 'realized' ? (row as RealizedGain).sellPrice : (row as UnrealizedLot).currentPrice;
    return {
      id: row.id, ticker: row.ticker, brokerage: row.brokerage, assetType: row.assetType || 'Equity', buyDate: row.buyDate,
      sellDate: mode === 'realized' ? (row as RealizedGain).sellDate : undefined,
      quantity: row.quantity, buyPrice: row.buyPrice, price,
      cost: row.quantity * row.buyPrice * multiplier, value: row.quantity * price * multiplier,
      gain: row.gain, term: row.isLongTerm ? 'long' : 'short', isOption: multiplier === 100,
      previousClose: mode === 'unrealized' ? (row as UnrealizedLot).prevClose ?? undefined : undefined,
      washSale: mode === 'realized' ? !!(row as RealizedGain).is_wash_sale : !!(row as UnrealizedLot).wash_sale_adjustment,
      washAmount: mode === 'realized' ? (row as RealizedGain).wash_sale_disallowed_amount || 0 : (row as UnrealizedLot).wash_sale_adjustment || 0,
      washRisk: mode === 'unrealized' && !!(row as UnrealizedLot).wash_sale_at_risk,
      optionSymbol: mode === 'unrealized' ? (row as UnrealizedLot).option_symbol || undefined : undefined,
    };
  });
}

export function filterGainRows(rows: readonly GainRow[], mode: GainsMode, filters: GainFilters): GainRow[] {
  return rows.filter(row =>
    (!filters.brokerages.length || filters.brokerages.includes(row.brokerage)) &&
    (!filters.tickers.length || filters.tickers.includes(row.ticker)) &&
    (!filters.terms.length || filters.terms.includes(row.term)) &&
    (mode !== 'realized' || filters.year === 'all' || row.sellDate?.slice(0, 4) === filters.year),
  );
}

/** Preserve the existing simplified cross-term offset calculation; not a tax return. */
export function estimateGainsTax(shortGain: number, longGain: number, shortRate: number, longRate: number) {
  let shortTax = 0, longTax = 0;
  if (shortGain >= 0 && longGain >= 0) {
    shortTax = shortGain * clampTaxRate(shortRate) / 100;
    longTax = longGain * clampTaxRate(longRate) / 100;
  } else if (shortGain < 0 && longGain > 0) {
    longTax = Math.max(0, longGain + shortGain) * clampTaxRate(longRate) / 100;
  } else if (shortGain > 0 && longGain < 0) {
    shortTax = Math.max(0, shortGain + longGain) * clampTaxRate(shortRate) / 100;
  }
  return { shortTax, longTax, total: shortTax + longTax };
}

export function summarizeGains(rows: readonly GainRow[], shortRate: number, longRate: number) {
  const summary = { gain: 0, grossGains: 0, grossLosses: 0, cost: 0, value: 0, shortGain: 0, longGain: 0, shortLots: 0, longLots: 0, winning: 0, losing: 0 };
  for (const row of rows) {
    summary.gain += row.gain; summary.cost += row.cost; summary.value += row.value;
    if (row.term === 'short') { summary.shortGain += row.gain; summary.shortLots++; }
    else { summary.longGain += row.gain; summary.longLots++; }
    if (row.gain > 0) { summary.winning++; summary.grossGains += row.gain; }
    if (row.gain < 0) { summary.losing++; summary.grossLosses += row.gain; }
  }
  return { ...summary, percent: gainPercent(summary.gain, summary.cost), tax: estimateGainsTax(summary.shortGain, summary.longGain, shortRate, longRate) };
}

export function gainsByHolding(rows: readonly GainRow[]): HoldingResult[] {
  const grouped = new Map<string, Omit<HoldingResult, 'percent'>>();
  for (const row of rows) {
    const holding = grouped.get(row.ticker) || { ticker: row.ticker, gain: 0, cost: 0, value: 0, exposure: 0, lots: 0, shortTerm: 0, longTerm: 0 };
    holding.gain += row.gain; holding.cost += row.cost; holding.value += row.value;
    holding.exposure += Math.abs(row.value); holding.lots++;
    if (row.term === 'short') holding.shortTerm += row.gain; else holding.longTerm += row.gain;
    grouped.set(row.ticker, holding);
  }
  return [...grouped.values()].map(h => ({ ...h, percent: gainPercent(h.gain, h.cost) })).sort((a, b) => Math.abs(b.gain) - Math.abs(a.gain));
}

export function dailyGainMap(rows: readonly GainRow[]): HoldingResult[] {
  const grouped = new Map<string, Omit<HoldingResult, 'percent'>>();
  for (const row of rows) {
    if (row.isOption || !(row.previousClose > 0) || !Number.isFinite(row.price)) continue;
    const holding = grouped.get(row.ticker) || { ticker: row.ticker, gain: 0, cost: 0, value: 0, exposure: 0, lots: 0, shortTerm: 0, longTerm: 0 };
    const gain = row.quantity * (row.price - row.previousClose);
    holding.gain += gain; holding.cost += Math.abs(row.quantity * row.previousClose);
    holding.value += row.value; holding.exposure += Math.abs(row.value); holding.lots++;
    if (row.term === 'short') holding.shortTerm += gain; else holding.longTerm += gain;
    grouped.set(row.ticker, holding);
  }
  return [...grouped.values()].map(h => ({ ...h, percent: gainPercent(h.gain, h.cost) })).sort((a, b) => b.exposure - a.exposure);
}

export interface PeriodResult { key: string; label: string; gain: number; shortTerm: number; longTerm: number; lots: number }
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function realizedByPeriod(rows: readonly GainRow[], year: string): PeriodResult[] {
  const grouped = new Map<string, PeriodResult>();
  if (year !== 'all') MONTHS.forEach((label, month) => { const key = `${year}-${String(month + 1).padStart(2, '0')}`; grouped.set(key, { key, label, gain: 0, shortTerm: 0, longTerm: 0, lots: 0 }); });
  for (const row of rows) {
    if (!row.sellDate) continue;
    const key = row.sellDate.slice(0, year === 'all' ? 4 : 7);
    if (year !== 'all' && !key.startsWith(`${year}-`)) continue;
    const period = grouped.get(key) || { key, label: key, gain: 0, shortTerm: 0, longTerm: 0, lots: 0 };
    period.gain += row.gain; period.lots++;
    if (row.term === 'short') period.shortTerm += row.gain; else period.longTerm += row.gain;
    grouped.set(key, period);
  }
  return [...grouped.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export interface MapTile { ticker: string; x: number; y: number; width: number; height: number }
/** Partition by absolute current position value; zero-value positions do not get fake area. */
export function layoutGainTiles(items: readonly HoldingResult[], width: number, height: number): MapTile[] {
  const positive = items.filter(item => item.exposure > 0 && Number.isFinite(item.exposure)).sort((a, b) => b.exposure - a.exposure);
  const split = (list: readonly HoldingResult[], x: number, y: number, w: number, h: number): MapTile[] => {
    if (!list.length || w <= 0 || h <= 0) return [];
    if (list.length === 1) return [{ ticker: list[0].ticker, x, y, width: w, height: h }];
    const total = list.reduce((sum, item) => sum + item.exposure, 0);
    let sum = 0, index = 1;
    for (let i = 0; i < list.length - 1; i++) { sum += list[i].exposure; index = i + 1; if (sum >= total / 2) break; }
    const ratio = sum / total;
    if (w >= h) return [...split(list.slice(0, index), x, y, w * ratio, h), ...split(list.slice(index), x + w * ratio, y, w * (1 - ratio), h)];
    return [...split(list.slice(0, index), x, y, w, h * ratio), ...split(list.slice(index), x, y + h * ratio, w, h * (1 - ratio))];
  };
  return split(positive, 0, 0, width, height);
}
