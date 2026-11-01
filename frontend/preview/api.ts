import { previewDataset } from './portfolioScenarios';
import { FINANCIAL_VISIBILITY_KEY } from '../utils/financialVisibility';
import type { OptionsCalculator, OptionsPosition } from '../services/apiService';
import type { RealizedGain } from '../types';

let preferences: Record<string, unknown> = {};
// Isolated from real account preferences. Only the sample privacy choice
// survives a preview reload; fictional profile edits and other data stay in memory.
const previewVisibilityStorageKey = 'wealthcompass:design-preview:financial-visibility';
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

function sampleOptionsCalculator(positions: OptionsPosition[], realized: RealizedGain[]): OptionsCalculator {
  // Follow the existing calculator's formula using only the selected fictional
  // positions. Its sample tax year stays fixed with the rest of the fixture.
  const optionSales = realized.filter(gain => gain.assetType === 'Options');
  const realizedLosses = -optionSales.reduce((sum, gain) => sum + Math.min(0, gain.gain), 0);
  const currentYearShortTermGains = optionSales.filter(gain => !gain.isLongTerm && gain.sellDate.startsWith('2026')).reduce((sum, gain) => sum + Math.max(0, gain.gain), 0);
  const outstandingPremium = positions.reduce((sum, position) => sum + position.quantity * 100 * position.buyPrice, 0);
  const unrealizedGains = positions.reduce((sum, position) => sum + Math.max(0, position.unrealizedGain), 0);
  const taxEstimate = Math.max(0, currentYearShortTermGains + unrealizedGains) * .4;
  const totalNeeded = outstandingPremium + realizedLosses + taxEstimate;
  const totalSellableQty = positions.reduce((sum, position) => sum + position.sellableQuantity, 0);
  const totalSellableValue = positions.reduce((sum, position) => sum + position.sellableQuantity * 100 * position.currentPrice, 0);
  return {
    outstandingPremium, realizedLosses, currentYearShortTermGains, unrealizedGains, taxEstimate,
    totalNeeded, totalSellableQty, totalSellableValue, taxYear: 2026,
    projectedGainPct: totalSellableValue > 0 && totalSellableQty > 0 ? (totalNeeded / totalSellableValue - 1) * 100 : null,
    targetPricePerContract: totalSellableQty > 0 && totalSellableValue > 0 ? totalNeeded / (totalSellableQty * 100) : null,
  };
}

/** No fetch fallback: only the sample privacy choice also uses isolated browser storage. */
export async function previewApiFetch(rawUrl: string, options: RequestInit = {}): Promise<Response> {
  const { accounts: previewAccounts, holdings: previewHoldings, options: previewOptions, transactions: previewTransactions, realized: previewRealized } = previewDataset(typeof window === 'undefined' ? '' : window.location.search || '');
  const url = new URL(rawUrl, 'http://design-preview.local');
  const method = options.method || 'GET';
  const body = typeof options.body === 'string' ? JSON.parse(options.body) : {};
  const route = url.pathname.replace('/api/v1', '');
  if (route === '/auth/me' && method === 'GET') return json({ email: 'jordan.doe@example.test' });
  if (route === '/preferences') {
    try {
      const cached = window.localStorage?.getItem(previewVisibilityStorageKey);
      if (cached === 'true' || cached === 'false') preferences[FINANCIAL_VISIBILITY_KEY] = cached === 'true';
    } catch { /* Preview still works in memory when browser storage is unavailable. */ }
    if (method === 'PUT') {
      preferences = { ...preferences, ...body.preferences };
      const visible = body.preferences?.[FINANCIAL_VISIBILITY_KEY];
      if (typeof visible === 'boolean') {
        try { window.localStorage?.setItem(previewVisibilityStorageKey, String(visible)); }
        catch { /* The preview can still demonstrate changes for this session. */ }
      }
    }
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
  if (route === '/options/calculator') return json(sampleOptionsCalculator(previewOptions, previewRealized));
  if (route === '/brokerage/connections') return json(previewAccounts.map(a => ({ id: a.id, brokerage: a.brokerage, authorization_id: `sample-auth-${a.id}` })));
  if (route === '/brokerage/accounts' && method === 'GET') return json(previewAccounts);
  if (route === '/brokerage/provider-accounts' && method === 'GET') return json(previewAccounts.map(a => ({ ...a, id: a.snaptrade_account_id, authorization_id: `sample-auth-${a.id}` })));
  if (route === '/brokerage/sync') return json({ message: 'Synced sample activity in memory. No brokerage was contacted.' });
  if (route === '/import/parse-statement') return json({ transactions: previewTransactions.slice(0, 2).map((t, i) => ({ ...t, id: `sample-import-${Date.now()}-${i}`, brokerage: body.brokerageName || 'Fidelity' })) });
  return json({ detail: 'This action is unavailable in the local design preview. No request was sent.' }, 409);
}
