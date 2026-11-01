import { previewAccounts, previewHoldings, previewOptions, previewTransactions } from './data';

let preferences: Record<string, unknown> = {};
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

/** No fetch fallback: preview reads/writes stay in memory, including unknown routes. */
export async function previewApiFetch(rawUrl: string, options: RequestInit = {}): Promise<Response> {
  const url = new URL(rawUrl, 'http://design-preview.local');
  const method = options.method || 'GET';
  const body = typeof options.body === 'string' ? JSON.parse(options.body) : {};
  const route = url.pathname.replace('/api/v1', '');
  if (route === '/preferences') {
    if (method === 'PUT') preferences = { ...preferences, ...body.preferences };
    return json({ preferences });
  }
  if (route === '/analyst/batch' || route === '/analyst/cached') return json(previewHoldings.filter(h => h.assetType !== 'Options').map(h => ({ ticker: h.ticker, currentPrice: h.currentPrice, targetLow: h.currentPrice * .9, targetMedian: h.currentPrice * 1.12, targetMean: h.currentPrice * 1.1, targetHigh: h.currentPrice * 1.25, analystCount: 12, recommendation: 'Sample estimate', sector: h.assetType === 'ETF' ? 'Diversified' : 'Technology' })));
  if (route === '/lot-assignments') return method === 'GET' ? json([]) : json({ detail: 'Lot assignment writes are unavailable in this design preview.' }, 409);
  if (route === '/lot-assignments/open-buys') return json([]);
  if (route === '/options/positions') return json(previewOptions);
  if (route === '/options/retain' && method === 'PUT') {
    const p = previewOptions.find(p => p.brokerage === body.brokerage && p.ticker === body.ticker && p.buyDate === body.buy_date);
    if (p) { p.retainQuantity = Math.min(p.quantity, Math.max(0, Number(body.retain_quantity) || 0)); p.sellableQuantity = p.quantity - p.retainQuantity; }
    return json({ message: 'Sample retention updated in memory.' });
  }
  if (route === '/options/calculator') return json({ outstandingPremium: 0, realizedLosses: 0, currentYearShortTermGains: 0, unrealizedGains: 1200, taxEstimate: 444, totalNeeded: 0, totalSellableValue: 2400, totalSellableQty: 2, projectedGainPct: null, targetPricePerContract: null, taxYear: 2026 });
  if (route === '/brokerage/connections') return json(previewAccounts.map(a => ({ id: a.id, brokerage: a.brokerage, authorization_id: `sample-auth-${a.id}` })));
  if (route === '/brokerage/accounts' && method === 'GET') return json(previewAccounts);
  if (route === '/brokerage/provider-accounts' && method === 'GET') return json(previewAccounts.map(a => ({ ...a, id: a.snaptrade_account_id, authorization_id: `sample-auth-${a.id}` })));
  if (route === '/brokerage/sync') return json({ message: 'Synced sample activity in memory. No brokerage was contacted.' });
  if (route === '/import/parse-statement') return json({ transactions: previewTransactions.slice(0, 2).map((t, i) => ({ ...t, id: `sample-import-${Date.now()}-${i}`, brokerage: body.brokerageName || 'Fidelity' })) });
  return json({ detail: 'This action is unavailable in the local design preview. No request was sent.' }, 409);
}
