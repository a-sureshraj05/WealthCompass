import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'esbuild';
import Module from 'node:module';
import { fileURLToPath } from 'node:url';

async function load(relative) {
  const path = fileURLToPath(new URL(relative, import.meta.url));
  const result = await build({ entryPoints: [path], bundle: true, write: false, format: 'cjs', platform: 'node', packages: 'external', define: { 'import.meta.env.DEV': 'false' }, loader: { '.css': 'empty', '.svg': 'dataurl', '.png': 'dataurl' } });
  const loaded = new Module(path);
  loaded.paths = Module._nodeModulePaths(fileURLToPath(new URL('../', import.meta.url)));
  loaded._compile(result.outputFiles[0].text, path);
  return loaded.exports;
}
const Dashboard = (await load('../components/Dashboard/DashboardView.tsx')).default;
const { fetchPerformanceDemoEnabled } = await load('../services/apiService.ts');
const originalFetch = globalThis.fetch;
after(() => { globalThis.fetch = originalFetch; });
const noop = () => {};
const props = {
  activeTab: 'dashboardView', preview: false, numbersVisible: true,
  holdings: [], transactions: [], realizedGains: [], unrealizedGains: [], accounts: [],
  buyingPower: {}, selectedBrokerages: [], selectedAssetTypes: [], selectedTickers: [], allKnownBrokerages: [],
  stats: { totalValue: 0, investmentValue: 0, totalGain: 0, gainPercentage: 0, dayChange: 0, dayChangePercentage: 0, buyingPower: 0 },
  setActiveTab: noop, onRefresh: noop, setSelectedBrokerages: noop, setSelectedTickers: noop, setSelectedAssetTypes: noop,
};
const render = extra => renderToStaticMarkup(React.createElement(Dashboard, { ...props, ...extra }));

test('production-mode dashboard omits simulated performance unless the runtime feature is enabled', () => {
  assert.doesNotMatch(render(), /portfolio-performance|Demo performance vs SPY/);
  assert.doesNotMatch(render({ performanceDemo: false }), /portfolio-performance/);
});

test('enabled staging loads transaction history without rendering the old simulated curve', () => {
  const html = render({ performanceDemo: true });
  assert.match(html, /Performance vs SPY/);
  assert.match(html, /Preparing your performance history/);
  assert.match(html, /recorded transactions and historical market prices/);
  assert.doesNotMatch(html, /STAGING · DEMO DATA|Demo performance|fictional|212,995|perf-scoreboard/);
  assert.deepEqual(props.transactions, []);
});

test('the staging demo honors hidden figures without revealing chart, returns or balances', () => {
  const html = render({ performanceDemo: true, numbersVisible: false });
  assert.match(html, /Your performance figures are hidden/);
  assert.doesNotMatch(html, /perf-line-chart|perf-scoreboard|perf-balance-equation|212,995/);
});

test('runtime flag reader uses authenticated user metadata and rejects missing, string or failed flags', async () => {
  for (const [status, body, expected] of [
    [200, { performance_demo: true }, true], [200, { performance_demo: false }, false],
    [200, {}, false], [200, { performance_demo: 'true' }, false], [503, {}, false],
  ]) {
    globalThis.fetch = async url => {
      assert.equal(url, '/api/v1/auth/me');
      return new Response(JSON.stringify(body), { status });
    };
    assert.equal(await fetchPerformanceDemoEnabled(), expected);
  }
});
