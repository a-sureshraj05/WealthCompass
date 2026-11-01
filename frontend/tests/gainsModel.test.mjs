import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeGainRows, filterGainRows, summarizeGains, gainsByHolding, dailyGainMap, realizedByPeriod, estimateGainsTax, layoutGainTiles, gainPercent } from '../components/GainsLosses/gainsModel.ts';

const openLot = (overrides = {}) => ({ id: '1', ticker: 'ABC', brokerage: 'Fidelity', quantity: 10, buyDate: '2025-01-10', buyPrice: 10, currentPrice: 15, prevClose: 14, gain: 50, isLongTerm: true, assetType: 'Equity', ...overrides });
const sale = (overrides = {}) => ({ id: 'sale-1', ticker: 'ABC', brokerage: 'Fidelity', quantity: 10, buyDate: '2025-01-10', sellDate: '2026-07-01', buyPrice: 10, sellPrice: 15, gain: 50, isLongTerm: true, assetType: 'Equity', ...overrides });

test('options use the contract multiplier consistently for cost and value, while reported gain remains authoritative', () => {
  const [option] = normalizeGainRows([openLot({ assetType: 'Options', quantity: 2, buyPrice: 8, currentPrice: 12, gain: 800 })], 'unrealized');
  assert.equal(option.cost, 1600);
  assert.equal(option.value, 2400);
  assert.equal(option.gain, 800);
  const [adjusted] = normalizeGainRows([sale({ assetType: 'Options', quantity: 2, buyPrice: 8, sellPrice: 12, gain: 700, is_wash_sale: true, wash_sale_disallowed_amount: 100 })], 'realized');
  assert.equal(adjusted.cost, 1600);
  assert.equal(adjusted.value, 2400);
  assert.equal(adjusted.gain, 700);
  assert.equal(adjusted.washAmount, 100);
});

test('brokerage, ticker, term and closing-year filters produce one consistent scope for cards and charts', () => {
  const rows = normalizeGainRows([sale(), sale({ id: '2', brokerage: 'Schwab' }), sale({ id: '3', sellDate: '2025-12-31' }), sale({ id: '4', isLongTerm: false }), sale({ id: '5', ticker: 'XYZ' })], 'realized');
  const filtered = filterGainRows(rows, 'realized', { brokerages: ['Fidelity'], tickers: ['ABC'], terms: ['long'], year: '2026' });
  assert.deepEqual(filtered.map(row => row.id), ['sale-1']);
  assert.equal(summarizeGains(filtered, 37, 20).gain, 50);
  assert.equal(gainsByHolding(filtered).reduce((sum, row) => sum + row.gain, 0), 50);
  assert.equal(realizedByPeriod(filtered, '2026').reduce((sum, row) => sum + row.gain, 0), 50);
  assert.equal(filterGainRows(rows, 'unrealized', { brokerages: [], tickers: [], terms: [], year: '2000' }).length, 5);
});

test('holding results combine brokerages and term buckets without losing or duplicating P&L', () => {
  const rows = normalizeGainRows([openLot(), openLot({ id: '2', brokerage: 'Schwab', gain: -20, isLongTerm: false })], 'unrealized');
  const [holding] = gainsByHolding(rows);
  assert.equal(holding.lots, 2);
  assert.equal(holding.gain, 30);
  assert.equal(holding.shortTerm, -20);
  assert.equal(holding.longTerm, 50);
  assert.equal(holding.percent, 15);
  assert.equal(summarizeGains(rows, 37, 20).gain, holding.gain);
  const report = summarizeGains(rows, 37, 20);
  assert.equal(report.grossGains, 50);
  assert.equal(report.grossLosses, -20);
  assert.equal(report.grossGains + report.grossLosses, report.gain);
  assert.equal(report.winning, 1);
  assert.equal(report.losing, 1);
});

test('daily maps exclude options and missing, zero or negative previous-close quotes', () => {
  const rows = normalizeGainRows([openLot(), openLot({ id: '2', ticker: 'OPT', assetType: 'Options' }), openLot({ id: '3', ticker: 'NOQUOTE', prevClose: null }), openLot({ id: '4', ticker: 'ZERO', prevClose: 0 }), openLot({ id: '5', ticker: 'NEG', prevClose: -1 })], 'unrealized');
  const daily = dailyGainMap(rows);
  assert.equal(daily.length, 1);
  assert.equal(daily[0].gain, 10);
  assert.equal(daily[0].cost, 140);
  assert.ok(Math.abs(daily[0].percent - 100 / 14) < 1e-10);
});

test('reconciliation percentages share each row cost basis so gains and losses reconcile to the net', () => {
  const rows = normalizeGainRows([openLot(), openLot({ id: '2', gain: -20, isLongTerm: false })], 'unrealized');
  const combined = summarizeGains(rows, 37, 20);
  assert.equal(gainPercent(combined.grossGains, combined.cost), 25);
  assert.equal(gainPercent(combined.grossLosses, combined.cost), -10);
  assert.equal(gainPercent(combined.gain, combined.cost), 15);
  for (const term of ['short', 'long']) {
    const row = summarizeGains(rows.filter(lot => lot.term === term), 37, 20);
    assert.equal(gainPercent(row.grossGains, row.cost) + gainPercent(row.grossLosses, row.cost), row.percent);
  }
});

test('realized month and year series use closing dates, preserve losses and never append a duplicate total bar', () => {
  const rows = normalizeGainRows([sale({ gain: 100 }), sale({ id: '2', gain: -30, isLongTerm: false, sellDate: '2026-07-31' }), sale({ id: '3', gain: 20, sellDate: '2025-12-31' })], 'realized');
  const monthly = realizedByPeriod(rows, '2026');
  assert.equal(monthly.length, 12);
  assert.equal(monthly[6].gain, 70);
  assert.equal(monthly[6].shortTerm, -30);
  assert.equal(monthly[6].longTerm, 100);
  assert.equal(monthly[6].lots, 2);
  assert.equal(monthly[0].gain, 0);
  assert.deepEqual(realizedByPeriod(rows, 'all').map(row => [row.key, row.gain]), [['2025', 20], ['2026', 70]]);
});

test('the existing cross-term tax estimate offsets opposite net gains before applying the remaining term rate', () => {
  assert.equal(estimateGainsTax(100, 100, 37, 20).total, 57);
  assert.equal(estimateGainsTax(-50, 100, 37, 20).total, 10);
  assert.equal(estimateGainsTax(100, -50, 37, 20).total, 18.5);
  assert.equal(estimateGainsTax(-200, 100, 37, 20).total, 0);
  assert.equal(estimateGainsTax(-100, -100, 37, 20).total, 0);
  assert.equal(estimateGainsTax(100, 100, -5, 150).total, 100);
});

test('heatmap area follows absolute position exposure, including break-even holdings, rather than absolute gain', () => {
  const holdings = gainsByHolding(normalizeGainRows([openLot({ ticker: 'LARGE', quantity: 20, gain: 0 }), openLot({ ticker: 'SMALL', quantity: 5, gain: 500 }), openLot({ ticker: 'WORTHLESS', quantity: 2, currentPrice: 0, gain: -20 })], 'unrealized'));
  const tiles = layoutGainTiles(holdings, 400, 200);
  assert.equal(tiles.length, 2);
  const area = ticker => { const tile = tiles.find(tile => tile.ticker === ticker); return tile.width * tile.height; };
  assert.ok(Math.abs(area('LARGE') / area('SMALL') - 4) < 1e-10);
  assert.ok(Math.abs(tiles.reduce((sum, tile) => sum + tile.width * tile.height, 0) - 80000) < 1e-6);
  assert.ok(tiles.every(tile => tile.width > 0 && tile.height > 0 && Number.isFinite(tile.x) && Number.isFinite(tile.y)));
});

test('empty views and non-positive cost basis have no fabricated percentages or invalid tile geometry', () => {
  assert.equal(gainPercent(10, 0), null);
  assert.equal(gainPercent(10, -100), null);
  assert.equal(summarizeGains([], 37, 20).percent, null);
  assert.equal(summarizeGains([], 37, 20).tax.total, 0);
  assert.deepEqual(layoutGainTiles([], 0, 0), []);
});
