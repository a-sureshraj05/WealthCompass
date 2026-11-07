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

test('release build renders authenticated V3 navigation and chart tabs without the DEV preview flag',()=>{
  const overview=render({refinedPreview:true});
  assert.match(overview,/Views within Portfolio Overview/);assert.match(overview,/summary-tile--portfolio/);
  assert.doesNotMatch(overview,/Fictional portfolio · no brokerage connection|LOCAL ONLY/);
  const gains=render({refinedPreview:true,activeTab:'gainsLosses'});
  assert.match(gains,/role="tablist" aria-label="Holdings visualization"/);
  assert.match(gains,/Ranked holdings/);
  const holdings=render({refinedPreview:true,holdingPerformanceSample:true,activeTab:'holdings'});
  assert.match(holdings,/>Performance<\/button>/);
  assert.doesNotMatch(render({refinedPreview:false,holdingPerformanceSample:true,activeTab:'holdings'}),/>Performance<\/button>/);
});

test('staging holding performance uses isolated fictional fixtures rather than supplied account data',()=>{
  const originalWindow=globalThis.window;
  try {
    globalThis.window={location:{search:'?holdingsView=performance'}};
    const html=render({refinedPreview:true,holdingPerformanceSample:true,activeTab:'holdings',
      holdings:[{id:'personal',ticker:'PRIVATE',brokerage:'Personal broker',marketValue:987654321,currentPrice:987654321,quantity:1,totalCost:1,averageCostPerShare:1,previousClose:1}],
      transactions:[{id:'secret',ticker:'PRIVATE',brokerage:'Personal broker',date:'2020-01-01',action:'BUY',quantity:1,totalCost:1,price:1,assetType:'Equity'}],selectedBrokerages:['Personal broker']});
    assert.match(html,/SAMPLE PORTFOLIO · STAGING/);assert.match(html,/AAPL · your investment/);
    assert.doesNotMatch(html,/PRIVATE|Personal broker|987,654,321|987654321|Recalculate positions|From position to transaction/);
    const hidden=render({refinedPreview:true,holdingPerformanceSample:true,activeTab:'holdings',numbersVisible:false});
    assert.match(hidden,/Your performance figures are hidden/);assert.doesNotMatch(hidden,/holding-scorecards|holding-performance-canvas|holding-data-scroll/);
  } finally { if(originalWindow===undefined) delete globalThis.window;else globalThis.window=originalWindow; }
});

test('production and legacy metadata disable V3 samples unless explicitly supplied as real booleans',async()=>{
  const {parseRuntimeFeatures}=await load('../services/apiService.ts');
  assert.deepEqual(parseRuntimeFeatures({}),{performanceDemo:false,refinedUi:false,holdingPerformancePreview:false});
  assert.deepEqual(parseRuntimeFeatures({refined_ui:'true',holding_performance_preview:true}),{performanceDemo:false,refinedUi:false,holdingPerformancePreview:false});
  assert.deepEqual(parseRuntimeFeatures({refined_ui:true,holding_performance_preview:true}),{performanceDemo:false,refinedUi:true,holdingPerformancePreview:true});
});

test('V3 Overview preserves transaction-based SPY history and never substitutes the holding sample',()=>{
  const html=render({refinedPreview:true,performanceDemo:true,overviewSection:'performance'});
  assert.match(html,/Preparing your performance history/);assert.doesNotMatch(html,/SAMPLE PORTFOLIO|simulated daily prices/);
});
