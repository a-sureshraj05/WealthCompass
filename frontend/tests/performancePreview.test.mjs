import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'esbuild';
import Module from 'node:module';
import { fileURLToPath } from 'node:url';

const path = fileURLToPath(new URL('../preview/PreviewPerformance.tsx', import.meta.url));
const result = await build({ entryPoints: [path], bundle: true, write: false, format: 'cjs', platform: 'node', packages: 'external', loader: { '.css': 'empty' } });
const loaded = new Module(path);
loaded.paths = Module._nodeModulePaths(fileURLToPath(new URL('../', import.meta.url)));
loaded._compile(result.outputFiles[0].text, path);
const Preview = loaded.exports.default;

test('performance design clearly labels both simulated series and shows the requested date controls and balance bridge', () => {
  const html = renderToStaticMarkup(React.createElement(Preview, { numbersVisible: true, scopeFiltered: true })).replaceAll('<!-- -->', '');
  assert.match(html, /Performance vs SPY/);
  assert.match(html, /SPY always included/);
  assert.match(html, /Portfolio and SPY results are simulated, not actual historical returns/);
  assert.match(html, /Calendar years/);
  for (const period of ['YTD', '1Y', '3Y', '5Y']) assert.ok(html.includes(`>${period}<`));
  assert.match(html, /Jan 1, 2026 – Nov 1, 2026/);
  assert.match(html, /Oct 30, 2026/);
  assert.match(html, /How the account balance changed/);
  assert.match(html, /\$212,995.75/);
  assert.match(html, /Withdrawals/);
  assert.match(html, /Investment earnings/);
  assert.match(html, /brokerage filter does not change/);
});

test('Hide figures removes chart, reconciliation and return numbers from the performance design', () => {
  const html = renderToStaticMarkup(React.createElement(Preview, { numbersVisible: false }));
  assert.match(html, /Your performance figures are hidden/);
  assert.doesNotMatch(html, /perf-line-chart|perf-scoreboard|perf-balance-equation|212,995/);
});


test('calendar design distinguishes completed years from current YTD and reconciles each row', () => {
  const html = renderToStaticMarkup(React.createElement(Preview, { numbersVisible: true, initialView: 'calendar' })).replaceAll('<!-- -->', '');
  assert.match(html, /Year by year, on the same scale/);
  assert.match(html, /class="perf-year-table"/);
  assert.match(html, />2026 YTD ↗</);
  assert.match(html, />2025 ↗</);
  for (const column of ['Opening', 'Deposits', 'Withdrawals', 'Earnings', 'Ending']) assert.ok(html.includes(`>${column}<`));
  assert.match(html, /Jan 1 – Dec 31 for completed years/);
  assert.doesNotMatch(html, /perf-balance-equation/);
});

test('the trailing-year UI displays the requested anniversary-plus-one-day range and actual valuation dates', () => {
  const html = renderToStaticMarkup(React.createElement(Preview, { numbersVisible: true, initialPeriod: '1y' })).replaceAll('<!-- -->', '');
  assert.match(html, /Nov 2, 2025 – Nov 1, 2026/);
  assert.match(html, /opening valuation Oct 31, 2025/);
  assert.match(html, /Latest sample valuation: Oct 30, 2026/);
});
