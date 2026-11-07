import type { RealizedGain, StockHolding, Transaction, UnrealizedLot } from '../types';
import type { OptionsPosition } from '../services/apiService';
import { previewAccounts, previewCash, previewHoldings, previewOptions, previewRealized, previewTransactions, previewUnrealized } from './data';

const standard = {
  accounts: previewAccounts, cash: previewCash, holdings: previewHoldings,
  options: previewOptions, realized: previewRealized, transactions: previewTransactions,
  unrealized: previewUnrealized,
};

function buildFiftyStockSample(): typeof standard {
  // All prices, quantities and returns are fictional. Keep the same total value
  // as the standard sample so the separate simulated performance concept agrees.
  const symbols = 'AAPL MSFT NVDA AMZN GOOGL META AVGO TSLA BRK.B JPM V MA COST WMT XOM UNH JNJ PG HD ABBV BAC NFLX CRM ORCL AMD ADBE CSCO QCOM IBM INTC DIS KO PEP MCD SBUX NKE CAT GE BA HON UPS LMT GS MS BLK SCHW C VZ T ABT'.split(' ');
  const weights = symbols.map((_, index) => index < 5 ? [11, 8, 6.5, 5.5, 4.5][index] : 1.8 - (index - 5) * .025);
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
  const investedCents = Math.round(previewHoldings.reduce((sum, holding) => sum + holding.marketValue, 0) * 100);
  let remaining = investedCents;
  const holdings: StockHolding[] = symbols.map((ticker, index) => {
    const cents = index === symbols.length - 1 ? remaining : Math.round(investedCents * weights[index] / weightTotal);
    remaining -= cents;
    const quantity = [20, 40, 50, 25][index % 4];
    const marketValue = cents / 100;
    const currentPrice = marketValue / quantity;
    const averageCostPerShare = Math.round(currentPrice * [.82, 1.08, .72, .94, 1.16][index % 5] * 10000) / 10000;
    const account = previewAccounts[index % previewAccounts.length];
    return {
      id: `sample-50-${index}`, ticker, brokerage: account.brokerage, account_id: account.id,
      quantity, averageCostPerShare, totalCost: quantity * averageCostPerShare,
      marketValue, currentPrice, previousClose: Math.round(currentPrice / (1 + ((index * 7) % 11 - 5) * .0048) * 10000) / 10000,
      assetType: 'Equity',
    };
  });
  const unrealized: UnrealizedLot[] = holdings.map((holding, index) => ({
    id: `sample-50-lot-${index}`, ticker: holding.ticker, brokerage: holding.brokerage,
    account_id: holding.account_id, quantity: holding.quantity,
    buyDate: index % 2 ? '2026-03-17' : '2024-06-12', buyPrice: holding.averageCostPerShare,
    currentPrice: holding.currentPrice, prevClose: holding.previousClose,
    gain: holding.marketValue - holding.totalCost, isLongTerm: index % 2 === 0, assetType: 'Equity',
  }));
  const transactions: Transaction[] = holdings.map((holding, index) => ({
    id: holding.id, date: unrealized[index].buyDate, ticker: holding.ticker, name: holding.ticker,
    brokerage: holding.brokerage, account_id: holding.account_id, quantity: holding.quantity,
    price: holding.averageCostPerShare, costPerShare: holding.averageCostPerShare,
    totalCost: holding.totalCost, action: 'BUY', assetType: 'Equity',
    is_deleted: false, is_override: false, is_duplicate: false, is_backend_verified: true,
  }));
  return { ...standard, holdings, unrealized, transactions, realized: [], options: [] as OptionsPosition[] };
}

const fiftyStocks = /* @__PURE__ */ buildFiftyStockSample();

function buildMixedSample(size: 50 | 100): typeof standard {
  const stocks = 'AAPL MSFT NVDA AMZN GOOGL META AVGO TSLA BRK.B JPM V MA COST WMT XOM UNH JNJ PG HD ABBV BAC NFLX CRM ORCL AMD ADBE CSCO QCOM IBM INTC DIS KO PEP MCD SBUX NKE CAT GE BA HON UPS LMT GS MS BLK SCHW C VZ T ABT DE RTX GD NOC EMR ETN MMM F DX GM UBER PYPL TGT NOW INTU AMAT LRCX MU PANW CRWD ADP ISRG MDT DHR TMO MRK PFE GILD CVX COP'.split(' ');
  const funds = 'VTI SPY QQQ VXUS BND VOO SCHD IWM DIA VEA VWO TLT AGG XLK XLF XLV XLE VNQ GLD IAU'.split(' ');
  const stockCount = size === 50 ? 40 : 80;
  const optionCount = size === 50 ? 6 : 12;
  // Put funds among the larger allocations as well as the smaller positions.
  const symbols = [funds[0], ...stocks.slice(0, 4), funds[1], ...stocks.slice(4, stockCount), ...funds.slice(2, size - stockCount)];
  const optionTickers = size === 50
    ? [stocks[0], stocks[1], stocks[2], stocks[3], funds[1], funds[2]]
    : [stocks[0], stocks[1], stocks[2], stocks[2], stocks[3], stocks[4], stocks[5], stocks[6], stocks[7], stocks[8], funds[1], funds[2]];
  const id = `sample-${size}-mixed`;
  const options: OptionsPosition[] = Array.from({ length: optionCount }, (_, index) => {
    const quantity = 1 + index % 3;
    const buyPrice = 3.5 + index * .45;
    const currentPrice = Math.round(buyPrice * [1.4, .7, 1.2, .85][index % 4] * 100) / 100;
    const retainQuantity = index % 2;
    const account = previewAccounts[index % previewAccounts.length];
    return {
      id: size * 100 + index, ticker: optionTickers[index], brokerage: account.brokerage,
      account_id: account.id, buyDate: `2026-09-${String(index + 1).padStart(2, '0')}`,
      quantity, retainQuantity, sellableQuantity: quantity - retainQuantity,
      buyPrice, currentPrice, prevClose: Math.round(currentPrice * (index % 2 ? 1.06 : .95) * 100) / 100,
      unrealizedGain: quantity * 100 * (currentPrice - buyPrice), isLongTerm: false,
    };
  });
  const totalCents = Math.round(previewHoldings.reduce((sum, holding) => sum + holding.marketValue, 0) * 100);
  const optionCents = Math.round(options.reduce((sum, option) => sum + option.quantity * 100 * option.currentPrice, 0) * 100);
  const equityCents = totalCents - optionCents;
  const weights = symbols.map((_, index) => index < 5 ? [11, 8, 6.5, 5.5, 4.5][index] : 1.8 - (index - 5) * (1.1 / (size - 6)));
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
  let remaining = equityCents;
  const holdings: StockHolding[] = symbols.map((ticker, index) => {
    const cents = index === symbols.length - 1 ? remaining : Math.round(equityCents * weights[index] / weightTotal);
    remaining -= cents;
    const quantity = [20, 40, 50, 25][index % 4];
    const currentPrice = cents / 100 / quantity;
    const averageCostPerShare = Math.round(currentPrice * [.82, 1.08, .72, .94, 1.16][index % 5] * 10000) / 10000;
    const account = previewAccounts[index % previewAccounts.length];
    return {
      id: `${id}-${index}`, ticker, brokerage: account.brokerage, account_id: account.id,
      quantity, currentPrice, averageCostPerShare, marketValue: cents / 100,
      totalCost: quantity * averageCostPerShare,
      previousClose: Math.round(currentPrice / (1 + ((index * 7) % 11 - 5) * .0048) * 10000) / 10000,
      assetType: funds.includes(ticker) ? 'ETF' : 'Equity',
    };
  });
  options.forEach((option, index) => {
    const underlying = holdings.find(holding => holding.ticker === option.ticker)!;
    const strike = Math.max(5, Math.round(underlying.currentPrice * (index % 2 ? .9 : 1.1) / 5) * 5);
    option.option_symbol = `${option.ticker}${index % 2 ? '270319P' : '270115C'}${String(strike * 1000).padStart(8, '0')}`;
    holdings.push({
      id: `${id}-option-${index}`, ticker: option.ticker, brokerage: option.brokerage,
      account_id: option.account_id, quantity: option.quantity,
      averageCostPerShare: option.buyPrice, currentPrice: option.currentPrice,
      previousClose: option.prevClose!, totalCost: option.quantity * 100 * option.buyPrice,
      marketValue: option.quantity * 100 * option.currentPrice, assetType: 'Options',
    });
  });
  const unrealized: UnrealizedLot[] = holdings.map((holding, index) => ({
    id: `${id}-lot-${index}`, ticker: holding.ticker, brokerage: holding.brokerage,
    account_id: holding.account_id, quantity: holding.quantity,
    buyDate: index < size ? (index % 2 ? '2026-03-17' : '2024-06-12') : options[index - size].buyDate,
    buyPrice: holding.averageCostPerShare, currentPrice: holding.currentPrice, prevClose: holding.previousClose,
    gain: holding.marketValue - holding.totalCost, isLongTerm: index < size && index % 2 === 0,
    assetType: holding.assetType, option_symbol: index < size ? undefined : options[index - size].option_symbol,
  }));
  // Closed example lots provide stock, ETF and option gains/losses in both years.
  const closed = [holdings[1], holdings[2], holdings[0], holdings[5], holdings[size], holdings[size + 1]];
  const realized: RealizedGain[] = closed.map((holding, index) => {
    const quantity = holding.assetType === 'Options' ? 1 : 5;
    const buyPrice = holding.averageCostPerShare;
    const sellPrice = Math.round(buyPrice * (index % 2 ? .85 : 1.25) * 10000) / 10000;
    return {
      id: `${id}-sale-${index}`, ticker: holding.ticker, brokerage: holding.brokerage,
      buyDate: index < 2 ? '2024-02-05' : '2026-01-12',
      sellDate: index < 2 ? '2025-11-05' : `2026-0${index + 2}-12`,
      quantity, buyPrice, sellPrice, gain: quantity * (holding.assetType === 'Options' ? 100 : 1) * (sellPrice - buyPrice),
      isLongTerm: index < 2, assetType: holding.assetType,
    };
  });
  const transaction = (holding: StockHolding, date: string, action = 'BUY', rowId = holding.id, quantity = holding.quantity, price = holding.averageCostPerShare): Transaction => ({
    id: rowId, date, ticker: holding.ticker, name: holding.ticker, brokerage: holding.brokerage,
    account_id: holding.account_id, quantity, price, costPerShare: holding.averageCostPerShare,
    totalCost: quantity * price * (holding.assetType === 'Options' ? 100 : 1), action,
    assetType: holding.assetType!, is_deleted: false, is_override: false, is_duplicate: false, is_backend_verified: true,
  });
  const transactions = holdings.map((holding, index) => transaction(holding, unrealized[index].buyDate));
  realized.forEach((gain, index) => {
    transactions.push(transaction(closed[index], gain.buyDate, 'BUY', `${gain.id}-buy`, gain.quantity, gain.buyPrice));
    transactions.push(transaction(closed[index], gain.sellDate, 'SELL', gain.id, gain.quantity, gain.sellPrice));
  });
  return { ...standard, holdings, options, unrealized, transactions, realized };
}

const fiftyMixed = /* @__PURE__ */ buildMixedSample(50);
const hundredMixed = /* @__PURE__ */ buildMixedSample(100);

export const PREVIEW_SCENARIOS = [
  { id: 'standard', label: 'Original sample', description: 'Original stocks, funds and options sample' },
  { id: '50-stocks', label: '50 stocks only', description: '50 fictional stocks across three brokerages' },
  { id: '50-mixed', label: '50 stocks & ETFs + options', description: '40 stocks · 10 ETFs · 6 option positions · 3 brokerages' },
  { id: '100-mixed', label: '100 stocks & ETFs + options', description: '80 stocks · 20 ETFs · 12 option positions · 3 brokerages' },
] as const;

export const previewScenario = (search = '') => {
  const requested = new URLSearchParams(search).get('portfolio');
  return PREVIEW_SCENARIOS.find(scenario => scenario.id === requested)?.id ?? 'standard';
};
export const previewDataset = (search = '') => {
  switch (previewScenario(search)) {
    case '50-stocks': return fiftyStocks;
    case '50-mixed': return fiftyMixed;
    case '100-mixed': return hundredMixed;
    default: return standard;
  }
};
