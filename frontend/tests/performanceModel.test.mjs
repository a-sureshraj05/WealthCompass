import test from 'node:test';
import assert from 'node:assert/strict';
import { performanceRange, performanceSummary, chartSample } from '../components/Dashboard/Performance/performanceModel.ts';

const snapshot = (date, value, deposits = 0, withdrawals = 0, spyTotalReturnIndex = value) => ({ date, value, deposits, withdrawals, spyTotalReturnIndex });

test('YTD and calendar years use calendar boundaries, with the current year capped at today', () => {
  assert.deepEqual(performanceRange('ytd', '2026-11-01'), { start: '2026-01-01', end: '2026-11-01', openingBoundary: '2025-12-31', label: '2026 YTD' });
  assert.deepEqual(performanceRange('year-2025', '2026-11-01'), { start: '2025-01-01', end: '2025-12-31', openingBoundary: '2024-12-31', label: '2025' });
  assert.equal(performanceRange('year-2026', '2026-11-01').end, '2026-11-01');
  assert.throws(() => performanceRange('year-2027', '2026-11-01'), /completed or current/);
});

test('trailing periods start the day after the prior anniversary, including leap-day handling', () => {
  assert.equal(performanceRange('1y', '2026-11-01').start, '2025-11-02');
  assert.equal(performanceRange('3y', '2026-11-01').start, '2023-11-02');
  assert.equal(performanceRange('5y', '2026-11-01').start, '2021-11-02');
  assert.equal(performanceRange('1y', '2024-02-29').start, '2023-03-01');
  assert.equal(performanceRange('1y', '2025-02-28').start, '2024-02-29');
  assert.throws(() => performanceRange('ytd', '2026-02-30'), /Invalid performance date/);
});

test('end-of-day deposits and withdrawals reconcile dollars without inflating investment return', () => {
  const rows = [snapshot('2025-12-31', 100, 0, 0, 100), snapshot('2026-01-01', 210, 100, 0, 110), snapshot('2026-01-02', 220, 0, 11, 121)];
  const before = JSON.stringify(rows);
  const result = performanceSummary(rows, performanceRange('ytd', '2026-01-02'));
  assert.ok(Math.abs(result.portfolioReturn - 21) < 1e-10);
  assert.ok(Math.abs(result.spyReturn - 21) < 1e-10);
  assert.ok(Math.abs(result.difference) < 1e-10);
  assert.equal(result.earnings, 31);
  assert.equal(result.opening.value + result.deposits - result.withdrawals + result.earnings, result.closing.value);
  assert.notEqual(result.earnings / result.opening.value * 100, result.portfolioReturn);
  assert.ok(Math.abs(result.series.at(-1).portfolioGrowth - 12100) < 1e-8);
  assert.equal(result.annualized, null);
  assert.equal(JSON.stringify(rows), before);
});

test('multi-year returns compound and annualize rather than averaging yearly percentages', () => {
  const rows = [snapshot('2022-12-31', 100), snapshot('2023-12-31', 110), snapshot('2024-12-31', 121), snapshot('2025-12-31', 133.1)];
  const result = performanceSummary(rows, performanceRange('3y', '2025-12-31'));
  assert.ok(Math.abs(result.portfolioReturn - 33.1) < 1e-9);
  assert.ok(Math.abs(result.annualized - 10) < .02);
  assert.equal(result.series[0].portfolio, 0);
  assert.equal(result.series[0].spy, 0);
});

test('opening and ending valuations align to available dates without shortening a missing-history period', () => {
  const rows = [snapshot('2025-10-31', 100), snapshot('2025-11-03', 101), snapshot('2026-10-30', 110)];
  const result = performanceSummary(rows, performanceRange('1y', '2026-11-01'));
  assert.equal(result.range.start, '2025-11-02');
  assert.equal(result.range.end, '2026-11-01');
  assert.equal(result.opening.date, '2025-10-31');
  assert.equal(result.closing.date, '2026-10-30');
  assert.equal(performanceSummary(rows, performanceRange('5y', '2026-11-01')), null);
  assert.equal(performanceSummary([snapshot('2025-12-31', 0), snapshot('2026-01-02', 100)], performanceRange('ytd', '2026-01-02')), null);
});

test('chart downsampling retains exact opening and closing endpoints', () => {
  const rows = Array.from({ length: 1000 }, (_, index) => ({ index }));
  const sampled = chartSample(rows);
  assert.equal(sampled[0].index, 0);
  assert.equal(sampled.at(-1).index, 999);
  assert.ok(sampled.length <= 75);
});
