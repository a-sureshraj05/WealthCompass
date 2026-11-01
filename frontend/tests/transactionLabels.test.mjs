import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'esbuild';
import Module from 'node:module';
import { fileURLToPath } from 'node:url';
import { assetTypeLabel, actionLabel } from '../components/Transactions/labelPresentation.ts';

test('asset labels distinguish the supported classes while presenting Equity as Stock', () => {
  assert.equal(assetTypeLabel('Equity').label, 'Stock');
  assert.equal(assetTypeLabel('eTf').label, 'ETF');
  assert.equal(assetTypeLabel('Options').icon, 'option');
  assert.equal(assetTypeLabel('Cash').icon, 'cash');
  assert.equal(assetTypeLabel('Crypto').icon, 'crypto');
});

test('option action labels preserve the distinction between opening and closing either side', () => {
  assert.equal(actionLabel('BTO').label, 'Buy to open');
  assert.equal(actionLabel('BTC').label, 'Buy to close');
  assert.equal(actionLabel('STO').label, 'Sell to open');
  assert.equal(actionLabel('STC').label, 'Sell to close');
  assert.equal(actionLabel(' buy ').label, 'Buy');
  assert.notEqual(actionLabel('BUY').tone, actionLabel('SELL').tone);
});

test('non-trade events are not classified as sales and unknown values remain readable', () => {
  assert.equal(actionLabel('EXTERNAL_ASSET_TRANSFER_IN').label, 'Transfer in');
  assert.equal(actionLabel('TRANSFER').label, 'Transfer out');
  assert.equal(actionLabel('OPTIONEXPIRATION').label, 'Expired');
  assert.equal(actionLabel('DIV').label, 'Dividend');
  assert.equal(actionLabel('FEE').tone, 'amber');
  assert.equal(actionLabel('Unrecognized event').label, 'Unrecognized event');
  assert.equal(actionLabel('Unrecognized event').tone, 'slate');
  assert.equal(assetTypeLabel('Custom security').label, 'Custom security');
  assert.equal(assetTypeLabel(null).label, 'Unspecified');
  assert.equal(actionLabel(undefined).label, 'Unspecified');
});

test('the actual transaction table renders the new cells without mutating source values', async () => {
  const path = fileURLToPath(new URL('../components/TransactionsView.tsx', import.meta.url));
  const result = await build({ entryPoints: [path], bundle: true, write: false, format: 'cjs', platform: 'node', packages: 'external', define: { 'import.meta.env.DEV': 'true' }, loader: { '.css': 'empty', '.svg': 'dataurl' } });
  const loaded = new Module(path);
  loaded.paths = Module._nodeModulePaths(fileURLToPath(new URL('../', import.meta.url)));
  loaded._compile(result.outputFiles[0].text, path);
  const noop = () => {};
  const rows = [
    Object.freeze({ id: 'label-check-1', brokerage: 'Schwab', ticker: 'AAPL', name: 'Apple', date: '2026-01-02', quantity: 10, price: 150, costPerShare: 150, totalCost: 1500, assetType: 'Equity', action: 'BUY', is_deleted: false, is_override: false, is_duplicate: false }),
    Object.freeze({ id: 'label-check-2', brokerage: 'Schwab', ticker: 'AAPL', name: 'Apple option', date: '2026-01-03', quantity: 1, price: 10, costPerShare: 10, totalCost: 1000, assetType: 'Options', action: 'STC', is_deleted: false, is_override: false, is_duplicate: false }),
  ];
  const html = renderToStaticMarkup(React.createElement(loaded.exports.default, {
    transactions: rows, onRemove: noop, onSoftDelete: noop, onUpdate: noop, onRevert: noop,
    selectedBrokerages: [], setSelectedBrokerages: noop, selectedAssetTypes: [], setSelectedAssetTypes: noop,
    selectedTickers: [], setSelectedTickers: noop,
  }));
  assert.match(html, /class="txn-asset-value" title="Asset type: Equity"/);
  assert.match(html, />Stock</);
  assert.match(html, /title="Action: STC"/);
  assert.match(html, />Sell to close</);
  assert.equal(rows[0].assetType, 'Equity');
  assert.equal(rows[0].action, 'BUY');
  assert.equal(rows[1].action, 'STC');
});
