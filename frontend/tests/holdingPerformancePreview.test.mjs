import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'esbuild';
import Module from 'node:module';
import { fileURLToPath } from 'node:url';
async function load(relative) {
  const path=fileURLToPath(new URL(relative,import.meta.url));
  const result=await build({entryPoints:[path],bundle:true,write:false,format:'cjs',platform:'node',packages:'external',define:{'import.meta.env.DEV':'true'},loader:{'.css':'empty','.svg':'dataurl','.png':'dataurl'}});
  const loaded=new Module(path);loaded.paths=Module._nodeModulePaths(fileURLToPath(new URL('../',import.meta.url)));loaded._compile(result.outputFiles[0].text,path);return loaded.exports;
}
const HoldingPerformance=(await load('../preview/PreviewHoldingPerformance.tsx')).default;
const Dashboard=(await load('../components/Dashboard/DashboardView.tsx')).default;
const {previewDataset}=await load('../preview/portfolioScenarios.ts');
const {holdingAsOf,holdingSessions,simulatedHoldingPrices}=await load('../preview/holdingPerformanceData.ts');
const {personalHoldingPerformance}=await load('../components/Dashboard/Performance/holdingPerformanceModel.ts');
const {rankHoldings,default:Ranked}=await load('../components/GainsLosses/RankedHoldings.tsx');
const {GainsHeatmap}=await load('../components/GainsLosses/GainsCharts.tsx');
const {normalizeGainRows,gainsByHolding,dailyGainMap}=await load('../components/GainsLosses/gainsModel.ts');
const data=previewDataset();
const props={holdings:data.holdings,transactions:data.transactions,numbersVisible:true,selectedBrokerages:[]};
const render=extra=>renderToStaticMarkup(React.createElement(HoldingPerformance,{...props,...extra}));

test('holdings chart defaults to multiple independently funded stock lines',()=>{
  const html=render();
  for(const text of ['Holdings performance','Compare holdings','annualized XIRR','simulated daily prices','Your results by holding','AAPL · your investment','MSFT · your investment','NVDA · your investment']) assert.ok(html.includes(text),text);
  assert.doesNotMatch(html,/NaN|Infinity|SPY · AAPL cash flows/);
});
test('optional SPY comparison is labelled per holding cash-flow schedule',()=>{
  const html=render({initialSpy:true});
  assert.match(html,/SPY · AAPL cash flows/);assert.match(html,/SPY · MSFT cash flows/);
});
const noop=()=>{};
const dashboardProps={preview:true,refinedPreview:true,activeTab:'dashboardView',initialOverviewSection:'performance',holdings:data.holdings,transactions:data.transactions,realizedGains:data.realized,unrealizedGains:data.unrealized,numbersVisible:true,selectedBrokerages:[],setSelectedBrokerages:noop,selectedTickers:[],setSelectedTickers:noop,selectedAssetTypes:[],setSelectedAssetTypes:noop,accounts:data.accounts,buyingPower:data.cash,allKnownBrokerages:['Fidelity','Schwab','Vanguard'],setActiveTab:noop,onRefresh:noop,onProcessGains:noop,refreshNonce:0};
test('overview performance keeps its original chart with no holding analysis picker',()=>{
  const html=renderToStaticMarkup(React.createElement(Dashboard,dashboardProps));
  assert.match(html,/Performance vs SPY/);assert.match(html,/Balance details/);
  assert.doesNotMatch(html,/holding-performance-title|Analyze|Compare holdings/);
});
test('holdings exposes aligned performance navigation and opens its own multi-stock panel',()=>{
  const original=globalThis.window;
  try {
    globalThis.window={location:{search:'?holdingsView=performance'}};
    const html=renderToStaticMarkup(React.createElement(Dashboard,{...dashboardProps,activeTab:'holdings'}));
    assert.match(html,/aria-label="Holdings views"/);assert.match(html,/aria-pressed="true" class="active">Performance/);
    assert.match(html,/Stocks &amp; funds/);assert.match(html,/>Options<\/button>/);assert.match(html,/Holdings performance/);
    assert.doesNotMatch(html,/Performance vs SPY|Gain to Sell uses/);
  } finally { if(original===undefined) delete globalThis.window; else globalThis.window=original; }
});
test('hidden figures have no chart values, scores, activity or daily price data in the DOM',()=>{
  const html=render({numbersVisible:false});
  assert.match(html,/Your performance figures are hidden/);assert.doesNotMatch(html,/holding-scorecards|holding-data-scroll|holding-performance-canvas|\$\d/);
});
test('brokerage selection scopes the personal holding and empty scope is explicit',()=>{
  const html=render({selectedBrokerages:['Vanguard']});
  assert.match(html,/Vanguard · Stocks/);assert.doesNotMatch(html,/<strong>AAPL<\/strong>/);
  assert.match(render({selectedBrokerages:['Missing']}),/Choose holdings to compare/);
});

test('fictional transaction replay reconciles to all stock/ETF holdings for small and large samples',()=>{
  for(const scenario of ['standard','50-stocks','50-mixed','100-mixed']) {
    const sample=previewDataset(scenario);
    const symbols=[...new Set(sample.holdings.filter(row=>row.assetType!=='Options').map(row=>row.ticker))];
    for(const ticker of symbols) {
      const result=personalHoldingPerformance({ticker,transactions:sample.transactions,prices:simulatedHoldingPrices(ticker,sample.transactions,sample.holdings),sessions:holdingSessions,asOf:holdingAsOf});
      assert.equal(result.status,'ready',`${scenario}/${ticker}: ${result.message}`);
      const expected=sample.holdings.filter(row=>row.ticker===ticker && row.assetType!=='Options').reduce((sum,row)=>sum+row.quantity,0);
      assert.ok(Math.abs(result.quantity-expected)<1e-6,`${scenario}/${ticker}: share mismatch`);
      assert.ok(Number.isFinite(result.profit));
    }
  }
});
test('ranked display keeps every holding, search retains the full-scope weight denominator',()=>{
  const sample=previewDataset('100-mixed');
  const entries=gainsByHolding(normalizeGainRows(sample.unrealized,'unrealized'));
  assert.equal(rankHoldings(entries,'','percent').length,entries.length);
  const row=entries[0], all=rankHoldings(entries,'','exposure'), filtered=rankHoldings(entries,row.ticker,'exposure');
  assert.equal(filtered.find(entry=>entry.ticker===row.ticker).weight,all.find(entry=>entry.ticker===row.ticker).weight);
  const html=renderToStaticMarkup(React.createElement(Ranked,{entries,daily:false}));
  assert.match(html,/Search ticker/);assert.match(html,/Largest \$ impact/);assert.match(html,/Weight/);
  for(const entry of entries) assert.ok(html.includes(`<strong>${entry.ticker}</strong>`));
  assert.doesNotMatch(html,/NaN|Infinity/);
});
test('ranked sorting handles losses, unknown percentages and zero exposure',()=>{
  const base={value:0,cost:0,exposure:0,lots:1,shortTerm:0,longTerm:0};
  const entries=[{...base,ticker:'UNK',gain:50,percent:null},{...base,ticker:'GAIN',gain:10,percent:5},{...base,ticker:'LOSS',gain:-100,percent:-20}];
  assert.deepEqual(rankHoldings(entries,'','percent').map(row=>row.ticker),['LOSS','GAIN','UNK']);
  assert.deepEqual(rankHoldings(entries,'','gain').map(row=>row.ticker),['LOSS','UNK','GAIN']);
  assert.ok(rankHoldings(entries,'','exposure').every(row=>row.weight===0));
});
test('heatmap and ranking are accessible tabs sharing the same daily control',()=>{
  const normalized=normalizeGainRows(data.unrealized,'unrealized'), overall=gainsByHolding(normalized), daily=dailyGainMap(normalized);
  const current=renderToStaticMarkup(React.createElement(GainsHeatmap,{overall,daily}));
  assert.doesNotMatch(current,/Ranked holdings/);assert.match(current,/Holdings heatmap/);
  for(const layout of ['map','ranked']) {
    const html=renderToStaticMarkup(React.createElement(GainsHeatmap,{overall,daily,alternativeViews:true,initialMode:'daily',initialLayout:layout}));
    assert.match(html,/role="tablist" aria-label="Holdings visualization"/);
    assert.match(html,new RegExp(`data-layout="${layout}"[^>]*aria-selected="true"`));
    assert.match(html,new RegExp(`gains-position-${layout === 'map' ? 'ranking' : 'map'} gains-chart-tab-panel" hidden="" role="tabpanel"`));
    assert.match(html,/Daily P&amp;L ranked by holding/);
    assert.equal((html.match(/aria-label="Heatmap gain period"/g)||[]).length,1);
    assert.match(html,/aria-pressed="true">Day<\/button>/);
  }
});
