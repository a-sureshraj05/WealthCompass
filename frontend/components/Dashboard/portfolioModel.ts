import type { StockHolding } from '../../types';

export const ALLOCATION_COLORS = ['#2458d3', '#7096ed', '#50a4ae', '#9c8acb', '#e6b769', '#b9c7dc'];
export const cashBrokerage = (key: string) => key.split(' · ')[0];

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
  const allocation = positive.slice(0, 5).map((t, i) => ({ name: t.ticker, value: t.value, color: ALLOCATION_COLORS[i] }));
  const other = positive.slice(5).reduce((sum, t) => sum + t.value, 0);
  if (other > 0) allocation.push({ name: 'Other', value: other, color: ALLOCATION_COLORS[5] });
  const contributors = [...daily.values()].map(d => ({ ...d, percent: d.previousValue !== 0 ? d.change / Math.abs(d.previousValue) * 100 : 0 })).sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
  const dayChange = contributors.reduce((sum, d) => sum + d.change, 0);
  const previousValue = contributors.reduce((sum, d) => sum + d.previousValue, 0);
  return {
    positions, tickers, allocation, allocationTotal, contributors,
    brokers: [...byBrokerage.values()].sort((a, b) => (b.invested + b.cash) - (a.invested + a.cash)),
    investmentValue, cost, cashValue, totalValue: investmentValue + cashValue,
    gain: investmentValue - cost, gainPercent: cost > 0 ? (investmentValue - cost) / cost * 100 : null,
    dayChange, dayPercent: previousValue > 0 ? dayChange / previousValue * 100 : null,
    topFivePercent: allocationTotal > 0 ? positive.slice(0, 5).reduce((sum, t) => sum + t.value, 0) / allocationTotal * 100 : 0,
    hasShorts: tickers.some(t => t.value < 0),
  };
}
