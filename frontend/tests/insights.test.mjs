import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'esbuild';
import Module from 'node:module';
import { fileURLToPath } from 'node:url';
import { sampleInsightSnapshot } from '../preview/insights.ts';

async function component(relative, dev = true) {
  const path = fileURLToPath(new URL(relative, import.meta.url));
  const result = await build({ entryPoints: [path], bundle: true, write: false, format: 'cjs', platform: 'node', packages: 'external', define: { 'import.meta.env.DEV': String(dev) }, loader: { '.css': 'empty', '.svg': 'dataurl', '.png': 'dataurl' } });
  const loaded = new Module(path);
  loaded.paths = Module._nodeModulePaths(fileURLToPath(new URL('../', import.meta.url)));
  loaded._compile(result.outputFiles[0].text, path);
  return loaded.exports;
}
const AIInsights = (await component('../components/Dashboard/AIInsights.tsx')).default;
const Panel = (await component('../components/Dashboard/Insights/InsightsPanel.tsx')).default;
const noop = () => {};
const holdings = [
  { id: 'fictional-a', ticker: 'ABC', brokerage: 'Sample brokerage', quantity: 10, averageCostPerShare: 8, totalCost: 80, currentPrice: 10, previousClose: 9, marketValue: 100, assetType: 'Equity' },
  { id: 'fictional-b', ticker: 'XYZ', brokerage: 'Sample brokerage', quantity: 10, averageCostPerShare: 7, totalCost: 70, currentPrice: 5, previousClose: 6, marketValue: 50, assetType: 'Equity' },
];
const props = { holdings, cashByBrokerage: { 'Sample brokerage': 50 }, onOpenHoldings: noop, onOpenGains: noop, preview: true };

test('sample observations calculate portfolio context and preserve source rows', () => {
  const before = JSON.stringify(holdings);
  const sample = sampleInsightSnapshot(holdings, { 'Sample brokerage': 50 });
  assert.match(sample.observations[0].text, /ABC represents 66.7%/);
  assert.match(sample.observations[1].text, /Cash represents 25.0%/);
  assert.match(sample.observations[2].text, /1 brokerage position is above cost and 1 is below cost/);
  assert.equal(sample.answer('What is my largest holding?'), sample.observations[0].text);
  assert.equal(sample.answer('How much cash?'), sample.observations[1].text);
  assert.match(sample.answer('Tell me tomorrow’s prices'), /sample Q&A supports/);
  assert.equal(JSON.stringify(holdings), before);
  assert.deepEqual(sampleInsightSnapshot([], {}).observations, []);
  assert.match(sampleInsightSnapshot(holdings, { 'Sample brokerage': -50 }).observations[1].text, /negative cash/);
});

test('preview displays sample observations immediately and explains full-portfolio scope', () => {
  const html = renderToStaticMarkup(React.createElement(AIInsights, { ...props, scopeFiltered: true }));
  assert.match(html, />AI Insights</);
  assert.match(html, />Sample insights</);
  assert.match(html, /ABC represents 66.7%/);
  assert.match(html, /No AI service is used/);
  assert.match(html, /outside the current overview filter/);
  assert.match(html, /Try sample Q&amp;A/);
  assert.match(html, /Explore gains &amp; losses/);
});

test('Hide figures suppresses insight text and blocks chat and generation', () => {
  const html = renderToStaticMarkup(React.createElement(AIInsights, { ...props, numbersVisible: false }));
  assert.match(html, /Insights are hidden/);
  assert.doesNotMatch(html, /ABC represents|66.7%|25.0%|above cost/);
  assert.match(html, /disabled=""[^>]*>Try sample Q&amp;A/);
  assert.match(html, /disabled=""[^>]*>Refresh sample/);
});

test('production never activates the preview branch even when passed the preview prop', async () => {
  const ProductionInsights = (await component('../components/Dashboard/AIInsights.tsx', false)).default;
  const html = renderToStaticMarkup(React.createElement(ProductionInsights, props));
  assert.match(html, /Loading AI insights/);
  assert.doesNotMatch(html, />Sample insights<|ABC represents|Try sample/);
});

test('cached live observations remain visible on errors, with additional lines retained', () => {
  const html = renderToStaticMarkup(React.createElement(Panel, {
    items: [1, 2, 3, 4].map(i => ({ title: `Observation ${i}`, text: `Result ${i}` })),
    hasHoldings: true, numbersVisible: true, scopeFiltered: false, generatedAt: null,
    stale: true, error: 'Provider unavailable', onGenerate: noop, onAsk: noop, onOpenHoldings: noop, onOpenGains: noop,
  }));
  assert.match(html, /Portfolio changed/);
  assert.match(html, /previously generated insights are still shown/);
  assert.match(html, /Read 1 more observation/);
  assert.match(html, /Result 4/);
});

test('the complete overview mounts AI Insights between the summary and charts', async () => {
  const Preview = (await component('../components/Dashboard/DashboardPreview.tsx')).default;
  const html = renderToStaticMarkup(React.createElement(Preview, { initialTab: 'dashboardView' }));
  const summary = html.indexOf('aria-label="Portfolio summary"');
  const insights = html.indexOf('class="portfolio-insights"');
  const charts = html.indexOf('class="overview-chart-grid"');
  assert.ok(summary >= 0 && insights > summary && charts > insights);
  assert.equal((html.match(/class="portfolio-insights"/g) || []).length, 1);
  assert.match(html, /Insights are hidden/);
  assert.doesNotMatch(html, /\$212,995\.75/);
  assert.match(html, /Open account menu for Jordan Doe/);
  assert.match(html, /aria-haspopup="dialog"/);
});
