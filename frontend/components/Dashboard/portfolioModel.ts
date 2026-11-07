import type { StockHolding } from '../../types';
import { compareValues } from '../../utils/sort.ts';
import type { SortDirection } from '../../utils/sort.ts';

export const MAX_ALLOCATION_SEGMENTS = 8;
export const ALLOCATION_COLORS = ['#2458d3', '#7096ed', '#50a4ae', '#9c8acb', '#e6b769', '#75a885', '#be889e', '#b9c7dc'];
export const cashBrokerage = (key: string) => key.split(' · ')[0];

export type ContributorUnit = 'dollars' | 'percent';
export interface DailyContributor { ticker: string; change: number; percent: number }
export type ContributorSortKey = keyof DailyContributor;

/** Rank the biggest moves in either direction without changing the source data. */
export function rankContributors<T extends DailyContributor>(contributors: readonly T[], unit: ContributorUnit): T[] {
  const value = (contributor: T) => unit === 'dollars' ? contributor.change : contributor.percent;
  return [...contributors].sort((a, b) => Math.abs(value(b)) - Math.abs(value(a)) || a.ticker.localeCompare(b.ticker));
}

export function sortContributorTable<T extends DailyContributor>(contributors: readonly T[], unit: ContributorUnit, key: ContributorSortKey | null, direction: SortDirection): T[] {
  if (!key || !direction) return rankContributors(contributors, unit);
  // Explicit column sorts use signed values, so descending puts the biggest
  // gains first and ascending puts the biggest losses first.
  return [...contributors].sort((a, b) => compareValues(a[key], b[key], direction) || a.ticker.localeCompare(b.ticker));
}

/** Snapshot metrics, not a cash-flow-adjusted investment return. */
export function portfolioModel(holdings: StockHolding[], cash: Record<string, number>, brokerages: string[] = []) {
  const included = (brokerage: string) => !brokerages.length || brokerages.includes(brokerage);
  const positions = holdings.filter(h => included(h.brokerage));
  const cashEntries = Object.entries(cash).filter(([key]) => included(cashBrokerage(key)));
  const investmentValue = positions.reduce((sum, h) => sum + h.marketValue, 0);
  const cost = positions.reduce((sum, h) => sum + h.totalCost, 0);
  const cashValue = cashEntries.reduce((sum, [, value]) => sum + value, 0);
  const byTicker = new Map<string, { ticker: string; value: number; cost: number }>();
  const daily = new Map<string, { ticker: string; change: number; previousValue: number }>();
  const byBrokerage = new Map<string, { name: string; invested: number; cash: number }>();
  for (const h of positions) {
    const item = byTicker.get(h.ticker) ?? { ticker: h.ticker, value: 0, cost: 0 };
    item.value += h.marketValue;
    item.cost += h.totalCost;
    byTicker.set(h.ticker, item);
    const broker = byBrokerage.get(h.brokerage) ?? { name: h.brokerage, invested: 0, cash: 0 };
    broker.invested += h.marketValue;
    byBrokerage.set(h.brokerage, broker);
    // Options need contract-aware, reliable quotes; never mix them into equity daily P&L.
    if ((h.assetType || '').toLowerCase() !== 'options' && h.previousClose > 0 && Number.isFinite(h.currentPrice)) {
      const day = daily.get(h.ticker) ?? { ticker: h.ticker, change: 0, previousValue: 0 };
      day.change += h.quantity * (h.currentPrice - h.previousClose);
      day.previousValue += h.quantity * h.previousClose;
      daily.set(h.ticker, day);
    }
  }
  for (const [key, value] of cashEntries) {
    const name = cashBrokerage(key);
    const broker = byBrokerage.get(name) ?? { name, invested: 0, cash: 0 };
    broker.cash += value;
    byBrokerage.set(name, broker);
  }
  const tickers = [...byTicker.values()].sort((a, b) => b.value - a.value);
  // Pie segments represent positive assets only. Debt/short exposure is shown separately.
  const positive = tickers.filter(t => t.value > 0);
  const allocationTotal = positive.reduce((sum, t) => sum + t.value, 0);
  // Eight or fewer assets need no grouping. Otherwise reserve the eighth slice
  // for Other. A holding over 20% is always in the seven largest: at most four
  // holdings can exceed that threshold within the same positive-asset total.
  const namedCount = positive.length > MAX_ALLOCATION_SEGMENTS ? MAX_ALLOCATION_SEGMENTS - 1 : positive.length;
  const allocation = positive.slice(0, namedCount).map((t, i) => ({ name: t.ticker, value: t.value, color: ALLOCATION_COLORS[i] }));
  const other = positive.slice(namedCount).reduce((sum, t) => sum + t.value, 0);
  if (other > 0) allocation.push({ name: 'Other', value: other, color: ALLOCATION_COLORS[MAX_ALLOCATION_SEGMENTS - 1] });
  const contributors = [...daily.values()].map(d => ({ ...d, percent: d.previousValue !== 0 ? d.change / Math.abs(d.previousValue) * 100 : 0 })).sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
  const dayChange = contributors.reduce((sum, d) => sum + d.change, 0);
  const previousValue = contributors.reduce((sum, d) => sum + d.previousValue, 0);
  return {
    positions, tickers, allocation, allocationTotal, contributors,
    allocationOtherCount: positive.length - namedCount,
    brokers: [...byBrokerage.values()].sort((a, b) => (b.invested + b.cash) - (a.invested + a.cash)),
    investmentValue, cost, cashValue, totalValue: investmentValue + cashValue,
    gain: investmentValue - cost, gainPercent: cost > 0 ? (investmentValue - cost) / cost * 100 : null,
    dayChange, dayPercent: previousValue > 0 ? dayChange / previousValue * 100 : null,
    topFivePercent: allocationTotal > 0 ? positive.slice(0, 5).reduce((sum, t) => sum + t.value, 0) / allocationTotal * 100 : 0,
    hasShorts: tickers.some(t => t.value < 0),
  };
}
