import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'esbuild';
import Module from 'node:module';
import { fileURLToPath } from 'node:url';
import { portfolioModel, rankContributors } from '../components/Dashboard/portfolioModel.ts';
import { normalizeGainRows, summarizeGains } from '../components/GainsLosses/gainsModel.ts';

async function load(relative) {
  const path = fileURLToPath(new URL(relative, import.meta.url));
  const result = await build({ entryPoints: [path], bundle: true, write: false, format: 'cjs', platform: 'node', packages: 'external', define: { 'import.meta.env.DEV': 'true' }, loader: { '.css': 'empty', '.png': 'dataurl', '.svg': 'dataurl' } });
  const loaded = new Module(path);
  loaded.paths = Module._nodeModulePaths(fileURLToPath(new URL('../', import.meta.url)));
  loaded._compile(result.outputFiles[0].text, path);
  return loaded.exports;
}
const { previewDataset } = await load('../preview/portfolioScenarios.ts');
const Overview = (await load('../components/Dashboard/PortfolioOverview.tsx')).default;
const Preview = (await load('../components/Dashboard/DashboardPreview.tsx')).default;
const ContributorTable = (await load('../components/Dashboard/ContributorTable.tsx')).default;
const sample = previewDataset('?portfolio=50-stocks');

test('the large fictional sample has exactly fifty stocks with matching lots and ledger rows', () => {
  assert.equal(sample.holdings.length, 50);
  assert.equal(new Set(sample.holdings.map(holding => holding.ticker)).size, 50);
  assert.equal(sample.unrealized.length, 50);
  assert.equal(sample.transactions.length, 50);
  assert.equal(sample.options.length, 0);
  assert.equal(sample.realized.length, 0);
  sample.holdings.forEach((holding, index) => {
    assert.equal(holding.assetType, 'Equity');
    assert.ok(Math.abs(holding.marketValue - holding.quantity * holding.currentPrice) < 1e-8);
    assert.ok(Math.abs(holding.totalCost - holding.quantity * holding.averageCostPerShare) < 1e-8);
    assert.equal(sample.transactions[index].ticker, holding.ticker);
    assert.equal(sample.unrealized[index].gain, holding.marketValue - holding.totalCost);
    assert.ok(sample.accounts.some(account => account.id === holding.account_id && account.brokerage === holding.brokerage));
  });
  const standard = previewDataset();
  assert.equal(standard.holdings.length, 10);
  assert.equal(previewDataset('?portfolio=unknown'), standard);
  assert.ok(Math.abs(portfolioModel(sample.holdings, sample.cash).totalValue - portfolioModel(standard.holdings, standard.cash).totalValue) < 1e-8);
});

test('fifty holdings keep a eight-segment allocation with all forty-three remaining stocks accounted for', () => {
  const before = JSON.stringify(sample);
  const model = portfolioModel(sample.holdings, sample.cash);
  assert.equal(model.tickers.length, 50);
  assert.equal(model.contributors.length, 50);
  assert.equal(model.allocation.length, 8);
  assert.equal(model.allocationOtherCount, 43);
  assert.equal(model.allocation[7].name, 'Other');
  assert.ok(Math.abs(model.allocation.reduce((sum, slice) => sum + slice.value, 0) - model.investmentValue) < 1e-8);
  assert.ok(Math.abs(model.dayChange - model.contributors.reduce((sum, holding) => sum + holding.change, 0)) < 1e-8);
  assert.equal(JSON.stringify(sample), before);
});

test('the overview explains its abbreviated charts and table while showing the full portfolio totals', () => {
  const noop = () => {};
  const html = renderToStaticMarkup(React.createElement(Overview, {
    holdings: sample.holdings, cashByBrokerage: sample.cash,
    onOpenHoldings: noop, onRefresh: noop, onConnect: noop, preview: true,
  }));
  assert.match(html, /\$212,995\.75/);
  assert.match(html, /<strong>50<\/strong><span>holdings<\/span>/);
  assert.match(html, /Other · 43/);
  assert.match(html, /Showing 10 of 50 holdings/);
  assert.match(html, /View all 50 contributors/);
  assert.match(html, /equity change across 50 holdings/);
  assert.match(html, /View all 50/);
  assert.equal((html.match(/class="holding-identity"/g) || []).length, 5);
  assert.equal((html.match(/class="broker-item"/g) || []).length, 3);
});

test('brokerage filtering updates the remaining-stock count and full aggregate together', () => {
  const brokerage = sample.accounts[0].brokerage;
  const model = portfolioModel(sample.holdings, sample.cash, [brokerage]);
  assert.equal(model.brokers.length, 1);
  assert.ok(model.tickers.length < 50);
  assert.equal(model.allocationOtherCount, model.tickers.length - 7);
  assert.equal(model.contributors.length, model.tickers.length);
  assert.ok(Math.abs(model.allocation.reduce((sum, slice) => sum + slice.value, 0) - model.investmentValue) < 1e-8);
});

for (const size of [50, 100]) {
  test(`${size}-holding URL loads the complete preview with visible sample choices and a matching inventory count`, () => {
    const previousWindow = globalThis.window;
    globalThis.window = { location: { pathname: '/design-preview', search: `?portfolio=${size}-mixed`, hash: '#dashboardView' } };
    try {
      const html = renderToStaticMarkup(React.createElement(Preview, { initialTab: 'dashboardView' }));
      assert.match(html, /Choose a sample portfolio/);
      assert.match(html, /50 stocks &amp; ETFs \+ options/);
      assert.match(html, /100 stocks &amp; ETFs \+ options/);
      assert.ok(html.includes(`href="/design-preview?portfolio=${size}-mixed#dashboardView" aria-current="page"`));
      assert.ok(html.includes(`Loaded: ${size} stocks &amp; ETFs + ${size === 50 ? 6 : 12} option positions`));
      assert.match(html, /Overview shows the largest five/);
      assert.match(html, /Open Holdings →/);
    } finally { globalThis.window = previousWindow; }
  });

  test(`${size}-holding mixed sample reconciles stocks, ETFs and option contracts across overview, lots and ledger`, () => {
    const mixed = previewDataset(`?portfolio=${size}-mixed`);
    const optionCount = size === 50 ? 6 : 12;
    assert.equal(mixed.holdings.filter(holding => holding.assetType === 'Equity').length, size * .8);
    assert.equal(mixed.holdings.filter(holding => holding.assetType === 'ETF').length, size * .2);
    assert.equal(mixed.options.length, optionCount);
    assert.equal(mixed.holdings.length, size + optionCount);
    assert.equal(mixed.unrealized.length, size + optionCount);
    const model = portfolioModel(mixed.holdings, mixed.cash);
    assert.equal(model.tickers.length, size);
    assert.equal(model.contributors.length, size); // Options never enter the daily equity chart.
    assert.equal(model.allocationOtherCount, size - 7);
    assert.equal(model.allocation.length, 8);
    assert.ok(Math.abs(model.totalValue - 212995.75) < 1e-8);
    const gains = summarizeGains(normalizeGainRows(mixed.unrealized, 'unrealized'), 37, 20);
    assert.ok(Math.abs(gains.value - model.investmentValue) < 1e-8);
    assert.ok(Math.abs(gains.gain - model.gain) < 1e-8);
    mixed.options.forEach(option => {
      const lot = mixed.unrealized.find(row => row.option_symbol === option.option_symbol);
      assert.ok(lot);
      assert.match(option.option_symbol, /\d{6}[CP]\d{8}$/);
      assert.ok(Math.abs(lot.gain - option.quantity * 100 * (option.currentPrice - option.buyPrice)) < 1e-8);
      assert.equal(option.retainQuantity + option.sellableQuantity, option.quantity);
      assert.equal(option.isLongTerm, false);
    });
    assert.ok(mixed.options.some(option => /\d{6}C\d{8}$/.test(option.option_symbol)));
    assert.ok(mixed.options.some(option => /\d{6}P\d{8}$/.test(option.option_symbol)));
    assert.ok(mixed.options.some(option => option.unrealizedGain < 0));
    assert.ok(mixed.options.some(option => option.unrealizedGain > 0));
    assert.deepEqual(new Set(mixed.realized.map(gain => gain.assetType)), new Set(['Equity', 'ETF', 'Options']));
    mixed.realized.forEach(gain => {
      const sale = mixed.transactions.find(row => row.id === gain.id);
      const buy = mixed.transactions.find(row => row.id === `${gain.id}-buy`);
      assert.equal(sale.action, 'SELL');
      assert.equal(buy.action, 'BUY');
      assert.ok(Math.abs(sale.totalCost - buy.totalCost - gain.gain) < 1e-8);
    });
  });

  test(`${size}-holding mixed overview keeps the charts and holdings list compact`, () => {
    const mixed = previewDataset(`?portfolio=${size}-mixed`);
    const noop = () => {};
    const html = renderToStaticMarkup(React.createElement(Overview, {
      holdings: mixed.holdings, cashByBrokerage: mixed.cash,
      onOpenHoldings: noop, onRefresh: noop, onConnect: noop, preview: true,
    }));
    assert.match(html, new RegExp(`Other · ${size - 7}`));
    assert.match(html, new RegExp(`Showing 10 of ${size} holdings`));
    assert.match(html, new RegExp(`View all ${size} contributors`));
    assert.match(html, new RegExp(`View all ${size}`));
    assert.match(html, /\$212,995\.75/);
    assert.equal((html.match(/class="holding-identity"/g) || []).length, 5);
    assert.equal((html.match(/class="broker-item"/g) || []).length, 3);
  });

  test(`${size}-holding full contributor list retains every eligible stock and ETF in either ranking mode`, () => {
    const mixed = previewDataset(`?portfolio=${size}-mixed`);
    const contributors = portfolioModel(mixed.holdings, mixed.cash).contributors;
    for (const unit of ['dollars', 'percent']) {
      const ranked = rankContributors(contributors, unit);
      const html = renderToStaticMarkup(React.createElement(ContributorTable, { contributors: ranked, unit, onOpenHolding: () => {} }));
      assert.equal((html.match(/aria-label="View [^"]+ holding"/g) || []).length, size);
      assert.match(html, /Dollar change/);
      assert.match(html, /Daily move/);
      assert.match(html, /All daily contributors/);
      assert.match(html, /aria-label="Sort holding ascending"/);
      assert.match(html, /aria-label="Sort dollar change ascending"/);
      assert.match(html, /aria-label="Sort daily move ascending"/);
      assert.equal((html.match(/aria-sort="other"/g) || []).length, 1);
      const positions = ranked.map(row => html.indexOf(`View ${row.ticker} holding`));
      assert.ok(positions.every((position, index) => position >= 0 && (index === 0 || position > positions[index - 1])));
    }
  });
}
