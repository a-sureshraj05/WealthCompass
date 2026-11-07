import type { StockHolding, Transaction } from '../types';
import type { HoldingPrices } from '../components/Dashboard/Performance/holdingPerformanceModel';
import { performanceSnapshots } from './performanceData';

// LOCAL DESIGN FIXTURE ONLY: interpolated prices are never used by live history.
export const holdingSessions = performanceSnapshots.map(point => point.date);
export const holdingAsOf = holdingSessions.at(-1)!;
export function simulatedHoldingPrices(ticker: string, transactions: readonly Transaction[], holdings: readonly StockHolding[]): HoldingPrices {
  if (ticker === 'SPY') return Object.fromEntries(performanceSnapshots.map(point => [point.date, { close:point.spyTotalReturnIndex, totalReturnIndex:point.spyTotalReturnIndex }]));
  const anchors = new Map<string, number>();
  for (const trade of transactions.filter(row => row.ticker === ticker && row.assetType !== 'Options' && !row.is_deleted && !row.is_duplicate && ['BUY','SELL','REI'].includes(row.action) && row.price > 0)) {
    const session = holdingSessions.find(day => day >= trade.date.slice(0,10));
    if (session) anchors.set(session, trade.price!);
  }
  const current = holdings.find(row => row.ticker === ticker && row.assetType !== 'Options');
  if (current?.currentPrice > 0) anchors.set(holdingAsOf, current.currentPrice);
  const ordered = [...anchors].sort(([a],[b]) => a.localeCompare(b));
  if (!ordered.length) return {};
  const seed = [...ticker].reduce((n, letter) => n + letter.charCodeAt(0), 0);
  const points = ordered.map(([date, price]) => ({ time:Date.parse(date), price }));
  return Object.fromEntries(holdingSessions.map(date => {
    const time = Date.parse(date);
    const right = points.findIndex(point => point.time >= time);
    let price: number;
    if (right <= 0) {
      const anchor = right < 0 ? points.at(-1)! : points[0];
      price = anchor.price * Math.exp((time - anchor.time) / 86400000 * .00015);
    } else {
      const a = points[right - 1], b = points[right], weight = (time - a.time) / (b.time - a.time);
      price = Math.exp(Math.log(a.price) * (1 - weight) + Math.log(b.price) * weight + Math.sin(weight * Math.PI * 6 + seed) * Math.sin(weight * Math.PI) * .035);
    }
    return [date, { close:price, totalReturnIndex:price }];
  }));
}
