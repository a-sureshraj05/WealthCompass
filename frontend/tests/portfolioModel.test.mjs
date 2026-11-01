import test from 'node:test';
import assert from 'node:assert/strict';
import { portfolioModel, rankContributors, sortContributorTable } from '../components/Dashboard/portfolioModel.ts';
import { toggleSort } from '../utils/sort.ts';

const position = (overrides = {}) => ({
  id: '1', ticker: 'ABC', brokerage: 'Fidelity', quantity: 10,
  averageCostPerShare: 8, totalCost: 80, currentPrice: 12,
  previousClose: 10, marketValue: 120, assetType: 'Equity', ...overrides,
});

test('combines a ticker across brokers without losing daily dollar contribution', () => {
  const m = portfolioModel([position(), position({ id: '2', brokerage: 'Schwab', quantity: 5, marketValue: 60, totalCost: 45 })], { Fidelity: 25, Schwab: 10 });
  assert.equal(m.totalValue, 215);
  assert.equal(m.gain, 55);
  assert.equal(m.tickers.length, 1);
  assert.equal(m.contributors[0].change, 30);
  assert.equal(m.contributors[0].percent, 20);
  assert.equal(m.dayPercent, 20);
});

test('broker filtering applies equally to positions, account cash and summaries', () => {
  const m = portfolioModel([position(), position({ brokerage: 'Schwab', marketValue: 800 })], { 'Fidelity · IRA': 30, 'Fidelity · Individual': 20, 'Schwab · Individual': 900 }, ['Fidelity']);
  assert.equal(m.totalValue, 170);
  assert.equal(m.cashValue, 50);
  assert.equal(m.brokers.length, 1);
  assert.equal(m.brokers[0].cash, 50);
});

test('options and missing previous closes never fabricate daily equity performance', () => {
  const m = portfolioModel([position({ assetType: 'Options', marketValue: 12000 }), position({ ticker: 'NOQUOTE', previousClose: 0 })], {});
  assert.equal(m.contributors.length, 0);
  assert.equal(m.dayPercent, null);
  assert.equal(m.investmentValue, 12120);
});

test('negative cash and short exposure affect net value but do not create negative pie segments', () => {
  const m = portfolioModel([position(), position({ ticker: 'SHORT', quantity: -4, totalCost: -60, marketValue: -40 })], { Fidelity: -50 });
  assert.equal(m.totalValue, 30);
  assert.equal(m.cashValue, -50);
  assert.equal(m.hasShorts, true);
  assert.equal(m.allocationTotal, 120);
  assert.ok(m.allocation.every(d => d.value > 0));
});

test('seven named holdings plus Other preserves the allocation denominator within eight slices', () => {
  const m = portfolioModel(Array.from({ length: 9 }, (_, i) => position({ ticker: `T${i}`, marketValue: (i + 1) * 100 })), {});
  assert.equal(m.allocation.length, 8);
  assert.equal(m.allocationOtherCount, 2);
  assert.equal(m.allocation[7].name, 'Other');
  assert.equal(m.allocation[7].value, 300);
  assert.equal(m.allocation.reduce((sum, d) => sum + d.value, 0), 4500);
});

test('up to eight holdings each get a separate slice, including the eighth holding', () => {
  for (const count of [1, 6, 7, 8]) {
    const m = portfolioModel(Array.from({ length: count }, (_, index) => position({ ticker: `T${index}` })), {});
    assert.equal(m.allocation.length, count);
    assert.equal(m.allocationOtherCount, 0);
    assert.ok(m.allocation.every(slice => slice.name !== 'Other'));
    assert.equal(new Set(m.allocation.map(slice => slice.color)).size, count);
  }
});

test('every holding above 20% stays separate after aggregation across brokerages', () => {
  const holdings = [
    position({ ticker: 'LARGE', marketValue: 1000 }),
    position({ ticker: 'LARGE', brokerage: 'Schwab', marketValue: 1100 }),
    position({ ticker: 'SECOND', marketValue: 2100 }),
    position({ ticker: 'THIRD', marketValue: 2100 }),
    position({ ticker: 'FOURTH', marketValue: 2100 }),
    ...Array.from({ length: 16 }, (_, index) => position({ ticker: `SMALL${index}`, marketValue: 100 })),
  ];
  const m = portfolioModel(holdings, { Fidelity: 100000 });
  assert.equal(m.allocationTotal, 10000); // The pie excludes cash.
  assert.equal(m.allocation.length, 8);
  for (const holding of m.tickers.filter(holding => holding.value / m.allocationTotal > .2)) {
    assert.ok(m.allocation.some(slice => slice.name === holding.ticker && slice.value === holding.value));
  }
  assert.equal(m.allocationOtherCount, 13);
  assert.equal(m.allocation.reduce((sum, slice) => sum + slice.value, 0), m.allocationTotal);
});

test('empty and cash-only portfolios have finite, meaningful summaries', () => {
  const empty = portfolioModel([], {});
  assert.equal(empty.totalValue, 0);
  assert.equal(empty.gainPercent, null);
  assert.equal(empty.dayPercent, null);
  const cash = portfolioModel([], { Fidelity: 500 });
  assert.equal(cash.totalValue, 500);
  assert.equal(cash.brokers.length, 1);
  assert.equal(cash.allocation.length, 0);
});

test('contributor ranking changes between dollar impact and percentage move, including losses', () => {
  const contributors = Object.freeze([
    Object.freeze({ ticker: 'LARGE', change: 200, percent: 2 }),
    Object.freeze({ ticker: 'SMALL', change: 50, percent: 10 }),
    Object.freeze({ ticker: 'LOSS', change: -300, percent: -3 }),
  ]);
  assert.deepEqual(rankContributors(contributors, 'dollars').map(row => row.ticker), ['LOSS', 'LARGE', 'SMALL']);
  assert.deepEqual(rankContributors(contributors, 'percent').map(row => row.ticker), ['SMALL', 'LOSS', 'LARGE']);
  assert.deepEqual(contributors.map(row => row.ticker), ['LARGE', 'SMALL', 'LOSS']);
});

test('ties have a predictable ticker order and zero moves remain available in the full list', () => {
  const contributors = [
    { ticker: 'ZZZ', change: 5, percent: 2 },
    { ticker: 'AAA', change: -5, percent: -2 },
    { ticker: 'FLAT', change: 0, percent: 0 },
  ];
  for (const unit of ['dollars', 'percent']) {
    assert.deepEqual(rankContributors(contributors, unit).map(row => row.ticker), ['AAA', 'ZZZ', 'FLAT']);
  }
});

test('ranking and taking a top ten never changes the all-holdings aggregate', () => {
  const model = portfolioModel(Array.from({ length: 25 }, (_, index) => position({
    ticker: `STOCK${index}`, currentPrice: 10 + index / 10, quantity: 25 - index,
  })), {});
  const total = model.dayChange;
  const weightedPercent = model.dayPercent;
  const originalOrder = model.contributors.map(row => row.ticker);
  for (const unit of ['dollars', 'percent']) {
    const ranked = rankContributors(model.contributors, unit);
    assert.equal(ranked.length, 25);
    assert.equal(ranked.slice(0, 10).length, 10);
    assert.ok(Math.abs(ranked.reduce((sum, row) => sum + row.change, 0) - total) < 1e-8);
  }
  assert.equal(model.dayPercent, weightedPercent);
  assert.deepEqual(model.contributors.map(row => row.ticker), originalOrder);
});

test('full contributor column sorts use signed dollar and percentage values and support A–Z / Z–A', () => {
  const rows = Object.freeze([
    Object.freeze({ ticker: 'SMALL', change: 50, percent: 10 }),
    Object.freeze({ ticker: 'LOSS', change: -300, percent: -3 }),
    Object.freeze({ ticker: 'LARGE', change: 200, percent: 2 }),
  ]);
  const sorted = (key, direction) => sortContributorTable(rows, 'dollars', key, direction).map(row => row.ticker);
  assert.deepEqual(sorted('change', 'asc'), ['LOSS', 'SMALL', 'LARGE']);
  assert.deepEqual(sorted('change', 'desc'), ['LARGE', 'SMALL', 'LOSS']);
  assert.deepEqual(sorted('percent', 'asc'), ['LOSS', 'LARGE', 'SMALL']);
  assert.deepEqual(sorted('percent', 'desc'), ['SMALL', 'LARGE', 'LOSS']);
  assert.deepEqual(sorted('ticker', 'asc'), ['LARGE', 'LOSS', 'SMALL']);
  assert.deepEqual(sorted('ticker', 'desc'), ['SMALL', 'LOSS', 'LARGE']);
  assert.deepEqual(rows.map(row => row.ticker), ['SMALL', 'LOSS', 'LARGE']);
});

test('the Holdings sort cycle restores the selected mode’s absolute ranking after the third click', () => {
  const rows = [
    { ticker: 'SMALL', change: 50, percent: 10 },
    { ticker: 'LOSS', change: -300, percent: -3 },
    { ticker: 'LARGE', change: 200, percent: 2 },
  ];
  let state = { key: null, direction: null };
  state = toggleSort('change', state.key, state.direction);
  assert.deepEqual(state, { key: 'change', direction: 'asc' });
  state = toggleSort('change', state.key, state.direction);
  assert.deepEqual(state, { key: 'change', direction: 'desc' });
  state = toggleSort('ticker', state.key, state.direction);
  assert.deepEqual(state, { key: 'ticker', direction: 'asc' });
  state = toggleSort('ticker', state.key, state.direction);
  state = toggleSort('ticker', state.key, state.direction);
  assert.deepEqual(state, { key: null, direction: null });
  assert.deepEqual(sortContributorTable(rows, 'dollars', state.key, state.direction).map(row => row.ticker), ['LOSS', 'LARGE', 'SMALL']);
  assert.deepEqual(sortContributorTable(rows, 'percent', state.key, state.direction).map(row => row.ticker), ['SMALL', 'LOSS', 'LARGE']);
});
