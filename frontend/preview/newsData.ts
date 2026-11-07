import type { StockHolding } from '../types';
import type { PortfolioNewsFeed } from '../services/apiService';

// Explicit design samples. These are never returned by the real news endpoint.
export function previewNewsFeed(holdings: readonly StockHolding[], now = new Date()): PortfolioNewsFeed {
  const totals = new Map<string,number>();
  for (const holding of holdings) totals.set(holding.ticker,(totals.get(holding.ticker) || 0) + Math.abs(holding.marketValue));
  const total = [...totals.values()].reduce((sum,value) => sum + value,0);
  const symbols = [...totals].sort((a,b) => b[1] - a[1]);
  const topics = ['Earnings and guidance','Business and product developments','Industry and market context','Capital returns and dividends'];
  return { status:'ready',preview:true,checkedAt:now.toISOString(),totalHoldings:symbols.length,checkedHoldings:Math.min(20,symbols.length),coverageWeight:total ? symbols.slice(0,20).reduce((sum,[,value]) => sum + value,0) / total : 0,failedHoldings:0,
    items:Array.from({length:symbols.length ? 20 : 0},(_,index) => {
      const [ticker,value] = symbols[index % Math.min(20,symbols.length)];
      return {title:`Illustrative ${ticker} story: ${topics[Math.floor(index / Math.max(1,symbols.length)) % topics.length].toLowerCase()}`,summary:'This fictional story demonstrates a short news preview. Live stories will show a publisher-supplied excerpt and link to the original report, ranked for the investments in your portfolio.',source:'Design sample',url:null,publishedAt:new Date(now.getTime() - (index + 1) * 3600000).toISOString(),tickers:[ticker],weight:total ? value / total : 0,category:topics[index % topics.length]};
    }) };
}
