import test from 'node:test';
import assert from 'node:assert/strict';
import { portfolioModel } from '../components/Dashboard/portfolioModel.ts';

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

test('top five plus Other preserves the allocation denominator', () => {
  const m = portfolioModel(Array.from({ length: 8 }, (_, i) => position({ ticker: `T${i}`, marketValue: (i + 1) * 100 })), {});
  assert.equal(m.allocation.length, 6);
  assert.equal(m.allocation[5].name, 'Other');
  assert.equal(m.allocation[5].value, 600);
  assert.equal(m.allocation.reduce((sum, d) => sum + d.value, 0), 3600);
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
