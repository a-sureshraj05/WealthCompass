import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'esbuild';
import Module from 'node:module';
import { fileURLToPath } from 'node:url';
import { formatHoldingQuantity, formatHoldingAmount, formatHoldingPrice, formatHoldingPercent, formatHoldingDate } from '../utils/holdingFormats.ts';

test('quantities show whole numbers when possible and retain fractional share precision', () => {
  assert.equal(formatHoldingQuantity(120), '120');
  assert.equal(formatHoldingQuantity(1200), '1,200');
  assert.equal(formatHoldingQuantity(120.5), '120.5');
  assert.equal(formatHoldingQuantity(120.000125), '120.000125');
  assert.equal(formatHoldingQuantity(0.1 + 0.2), '0.3');
  assert.equal(formatHoldingQuantity(-3), '-3');
  assert.equal(formatHoldingQuantity(-0), '0');
});

test('small real quantities and prices are not rounded into a false zero', () => {
  assert.equal(formatHoldingQuantity(.000000001), '0.000000001');
  assert.equal(formatHoldingPrice(.00004), '$0.00004');
  assert.equal(formatHoldingPrice(.000000001), '$0.000000001');
});

test('dollar totals keep cents and negative signs, including short-position balances', () => {
  assert.equal(formatHoldingAmount(1234.5), '$1,234.50');
  assert.equal(formatHoldingAmount(-1234.5), '-$1,234.50');
  assert.equal(formatHoldingAmount(0), '$0.00');
  assert.equal(formatHoldingAmount(-.0001), '$0.00');
});

test('prices and option strikes retain sub-cent precision instead of rounding to cents', () => {
  assert.equal(formatHoldingPrice(157), '$157.00');
  assert.equal(formatHoldingPrice(157.8), '$157.80');
  assert.equal(formatHoldingPrice(157.8123), '$157.8123');
  assert.equal(formatHoldingPrice(181.125), '$181.125');
  assert.equal(formatHoldingPrice(-181.125), '-$181.125');
  assert.equal(formatHoldingPrice(0), '$0.00');
});

test('percentage displays use two decimals, grouped thousands and no negative zero', () => {
  assert.equal(formatHoldingPercent(12.5), '12.50%');
  assert.equal(formatHoldingPercent(-12.5), '-12.50%');
  assert.equal(formatHoldingPercent(1234.56), '1,234.56%');
  assert.equal(formatHoldingPercent(-.0001), '0.00%');
});

test('missing numeric values remain unavailable while valid zero stays visible', () => {
  for (const formatter of [formatHoldingQuantity, formatHoldingAmount, formatHoldingPrice, formatHoldingPercent]) {
    for (const value of [undefined, null, NaN, Infinity, -Infinity]) assert.equal(formatter(value), '—');
  }
  assert.equal(formatHoldingDate('2026-03-17T00:00:00Z'), '2026-03-17');
  assert.equal(formatHoldingDate('2024-02-29'), '2024-02-29');
  assert.equal(formatHoldingDate('2026-02-30'), '—');
  assert.equal(formatHoldingDate(null), '—');
});

test('the actual stocks table displays integer and fractional quantities without mutating holdings', async () => {
  const path = fileURLToPath(new URL('../components/HoldingsView.tsx', import.meta.url));
  const bundle = await build({ entryPoints: [path], bundle: true, write: false, format: 'cjs', platform: 'node', packages: 'external', define: { 'import.meta.env.DEV': 'true' }, loader: { '.css': 'empty', '.svg': 'dataurl', '.png': 'dataurl' } });
  const loaded = new Module(path);
  loaded.paths = Module._nodeModulePaths(fileURLToPath(new URL('../', import.meta.url)));
  loaded._compile(bundle.outputFiles[0].text, path);
  const holdings = [120, 15.125].map((quantity, index) => Object.freeze({ id: `format-${index}`, ticker: index ? 'XYZ' : 'ABC', brokerage: 'Schwab', quantity, averageCostPerShare: 157.8123, totalCost: quantity * 157.8123, currentPrice: 160, previousClose: 159, marketValue: quantity * 160, assetType: 'Equity' }));
  const before = JSON.stringify(holdings);
  const noop = () => {};
  const html = renderToStaticMarkup(React.createElement(loaded.exports.default, { holdings, unrealizedGains: [], realizedGains: [], onRemove: noop, selectedBrokerages: [], setSelectedBrokerages: noop, selectedAssetTypes: [], setSelectedAssetTypes: noop, selectedTickers: [], setSelectedTickers: noop, selectedTerms: [], setSelectedTerms: noop }));
  assert.match(html, />120</);
  assert.match(html, />15\.125</);
  assert.match(html, /\$157\.8123/);
  assert.doesNotMatch(html, />120\.00<|>15\.13</);
  assert.equal(JSON.stringify(holdings), before);
});
