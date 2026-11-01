import type { BrokerageAccount, StockHolding, Transaction, RealizedGain, UnrealizedLot } from '../types';
import type { OptionsPosition } from '../services/apiService';

// Fictional data shared by every preview tab. No live credentials or portfolio data.
const samples: [string, string, number, number, number, number, string][] = [
  ['VTI', 'Fidelity', 210, 218.5, 284.7, 283.1, 'ETF'],
  ['AAPL', 'Fidelity', 120, 164.2, 231.4, 228.9, 'Equity'],
  ['NVDA', 'Schwab', 190, 89.6, 138.2, 134.4, 'Equity'],
  ['MSFT', 'Schwab', 55, 310, 428.7, 433.2, 'Equity'],
  ['VXUS', 'Vanguard', 310, 52.4, 64.8, 64.3, 'ETF'],
  ['AAPL', 'Schwab', 30, 178.5, 231.4, 228.9, 'Equity'],
  ['GOOGL', 'Fidelity', 65, 126.3, 173.6, 175.8, 'Equity'],
  ['BND', 'Vanguard', 120, 73.2, 72.8, 72.95, 'ETF'],
  ['AMZN', 'Schwab', 45, 149, 187.5, 185.1, 'Equity'],
];
const accountId = (broker: string) => ({ Fidelity: 1, Schwab: 2, Vanguard: 3 })[broker];
export const previewAccounts: BrokerageAccount[] = ['Fidelity', 'Schwab', 'Vanguard'].map((brokerage, i) => ({ id: i + 1, snaptrade_account_id: `sample-account-${i + 1}`, brokerage, name: 'Individual' }));
export const previewHoldings: StockHolding[] = samples.map(([ticker, brokerage, quantity, cost, price, previousClose, assetType], i) => ({ id: `sample-${i}`, ticker, brokerage, account_id: accountId(brokerage), quantity, averageCostPerShare: cost, totalCost: quantity * cost, currentPrice: price, previousClose, marketValue: quantity * price, assetType }));
previewHoldings.push({ id: 'sample-option', ticker: 'NVDA', brokerage: 'Schwab', account_id: 2, quantity: 3, averageCostPerShare: 8, totalCost: 2400, currentPrice: 12, previousClose: 11.4, marketValue: 3600, assetType: 'Options' });
export const previewCash = { 'Fidelity · Individual': 8240.5, 'Schwab · Individual': 5176.25, 'Vanguard · Individual': 3100 };
export const previewUnrealized: UnrealizedLot[] = previewHoldings.map((h, i) => ({ id: `sample-lot-${i}`, ticker: h.ticker, buyDate: h.assetType === 'Options' ? '2026-09-18' : i % 2 ? '2026-03-17' : '2024-06-12', quantity: h.quantity, buyPrice: h.averageCostPerShare, currentPrice: h.currentPrice, prevClose: h.previousClose, gain: h.marketValue - h.totalCost, isLongTerm: h.assetType !== 'Options' && i % 2 === 0, brokerage: h.brokerage, account_id: h.account_id, assetType: h.assetType, option_symbol: h.assetType === 'Options' ? 'NVDA270115C00160000' : undefined }));
export const previewRealized: RealizedGain[] = [
  { id: 'sample-sale-1', ticker: 'AAPL', buyDate: '2024-02-05', sellDate: '2026-08-12', quantity: 20, buyPrice: 165, sellPrice: 221, gain: 1120, isLongTerm: true, brokerage: 'Fidelity', assetType: 'Equity' },
  { id: 'sample-sale-2', ticker: 'NVDA', buyDate: '2026-01-12', sellDate: '2026-09-23', quantity: 25, buyPrice: 110, sellPrice: 132, gain: 550, isLongTerm: false, brokerage: 'Schwab', assetType: 'Equity' },
  { id: 'sample-sale-3', ticker: 'BND', buyDate: '2026-02-03', sellDate: '2026-07-08', quantity: 40, buyPrice: 76, sellPrice: 72, gain: -160, isLongTerm: false, brokerage: 'Vanguard', assetType: 'ETF' },
  { id: 'sample-sale-4', ticker: 'MSFT', buyDate: '2023-04-17', sellDate: '2025-11-05', quantity: 10, buyPrice: 280, sellPrice: 405, gain: 1250, isLongTerm: true, brokerage: 'Schwab', assetType: 'Equity' },
];
export const previewTransactions: Transaction[] = [
  ...previewHoldings.map((h, i) => ({ id: h.id, date: previewUnrealized[i].buyDate, quantity: h.quantity, price: h.averageCostPerShare, brokerage: h.brokerage, account_id: h.account_id, ticker: h.ticker, name: h.ticker, action: 'BUY', costPerShare: h.averageCostPerShare, totalCost: h.totalCost, assetType: h.assetType, is_deleted: false, is_override: false, is_duplicate: false, is_backend_verified: true })),
  ...previewRealized.map(g => ({ id: g.id, date: g.sellDate, quantity: g.quantity, price: g.sellPrice, brokerage: g.brokerage, account_id: accountId(g.brokerage), ticker: g.ticker, name: g.ticker, action: 'SELL', costPerShare: g.buyPrice, totalCost: g.quantity * g.sellPrice, assetType: g.assetType, is_deleted: false, is_override: false, is_duplicate: false, is_backend_verified: true })),
];
export const previewOptions: OptionsPosition[] = [{ id: 901, ticker: 'NVDA', brokerage: 'Schwab', account_id: 2, buyDate: '2026-09-18', quantity: 3, retainQuantity: 1, sellableQuantity: 2, buyPrice: 8, currentPrice: 12, prevClose: 11.4, unrealizedGain: 1200, isLongTerm: false, option_symbol: 'NVDA270115C00160000' }];
