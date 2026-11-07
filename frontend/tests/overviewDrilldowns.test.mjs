import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'esbuild';
import Module from 'node:module';
import { fileURLToPath } from 'node:url';
import { portfolioModel } from '../components/Dashboard/portfolioModel.ts';

async function load(relative) {
  const path=fileURLToPath(new URL(relative,import.meta.url));
  const built=await build({entryPoints:[path],bundle:true,write:false,format:'cjs',platform:'node',packages:'external',define:{'import.meta.env.DEV':'true'},loader:{'.css':'empty','.svg':'dataurl','.png':'dataurl'}});
  const loaded=new Module(path);loaded.paths=Module._nodeModulePaths(fileURLToPath(new URL('../',import.meta.url)));loaded._compile(built.outputFiles[0].text,path);return loaded.exports;
}
const Tiles=(await load('../components/Dashboard/OverviewSummaryTiles.tsx')).default;
const Gains=(await load('../components/GainsLossesView.tsx')).default;
const Performance=(await load('../preview/PreviewPerformance.tsx')).default;
const noop=()=>{};
const lots=[{id:'one',ticker:'ABC',quantity:10,buyPrice:100,currentPrice:125,prevClose:130,gain:250,isLongTerm:true,buyDate:'2024-01-01',brokerage:'Example',assetType:'Equity'}];
const gainsProps={realizedGains:[],unrealizedGains:lots,selectedBrokerages:[],setSelectedBrokerages:noop,selectedTickers:[],setSelectedTickers:noop,stTaxRate:37,setStTaxRate:noop,ltTaxRate:20,setLtTaxRate:noop};
const renderGains=extra=>renderToStaticMarkup(React.createElement(Gains,{...gainsProps,...extra})).replaceAll('<!-- -->','');

test('daily and open-P&L entry modes show different data without changing the open-position scope',()=>{
  const daily=renderGains({heatmapTarget:'daily'});
  const overall=renderGains({heatmapTarget:'overall'});
  assert.match(daily,/aria-pressed="true"[^>]*>Unrealized/);
  assert.match(daily,/aria-pressed="true"[^>]*>Day</);
  assert.match(overall,/aria-pressed="true"[^>]*>Open P&amp;L</);
  assert.match(daily,/ABC: −\$50.00/);
  assert.match(overall,/ABC: \+\$250.00/);
  assert.match(daily,/Holdings heatmap opened from Overview/);
});

test('targeting a heatmap preserves brokerage filtering and financial privacy',()=>{
  const filtered=renderGains({heatmapTarget:'daily',selectedBrokerages:['Different brokerage']});
  assert.doesNotMatch(filtered,/aria-label="ABC:/);
  const hidden=renderGains({heatmapTarget:'daily',numbersVisible:false});
  assert.match(hidden,/Your portfolio figures are hidden/);
  assert.doesNotMatch(hidden,/Holdings heatmap|\$250.00|\$50.00/);
});

test('separate summary cards use native buttons and hidden figures never appear in accessible labels',()=>{
  const model=portfolioModel([{id:'one',ticker:'ABC',quantity:10,currentPrice:125,previousClose:130,marketValue:1250,totalCost:1000,averageCostPerShare:100,brokerage:'Example',assetType:'Equity'}],{Example:500});
  const props={model,onHoldings:noop,onHeatmap:noop,onAccounts:noop};
  const visible=renderToStaticMarkup(React.createElement(Tiles,{...props,numbersVisible:true}));
  assert.equal((visible.match(/<button type="button"/g)||[]).length,4);
  for(const destination of ['View holdings','Day heatmap','Open P&amp;L heatmap','View accounts']) assert.ok(visible.includes(destination),destination);
  const hidden=renderToStaticMarkup(React.createElement(Tiles,{...props,numbersVisible:false}));
  assert.doesNotMatch(hidden,/\$1,750|\$1,250|\$500|\$250|\$50|width:/);
});

test('V3 balance details start collapsed while the current comparison keeps the original visible reconciliation',()=>{
  const compact=renderToStaticMarkup(React.createElement(Performance,{numbersVisible:true,compactBalance:true}));
  assert.match(compact,/<details class="perf-balance-disclosure"><summary>/);
  assert.doesNotMatch(compact,/<details[^>]*class="perf-balance-disclosure"[^>]*open/);
  assert.match(compact,/Balance details/);assert.match(compact,/Reconcile this period/);
  assert.doesNotMatch(compact,/Fictional account dollars, separate/);
  const current=renderToStaticMarkup(React.createElement(Performance,{numbersVisible:true}));
  assert.doesNotMatch(current,/perf-balance-disclosure/);assert.match(current,/How the account balance changed/);
});


test('Gains & Losses follows filters, lots, tax assumptions, net result, then chart tabs',()=>{
  const html=renderGains({alternativeHeatmapViews:true});
  const markers=['aria-label="Table filters"','class="gains-detail-section"','class="gains-tax-assumptions"','UNDERSTAND THE NET RESULT','class="gains-heatmap-only"'];
  const positions=markers.map(marker=>html.indexOf(marker));
  assert.ok(positions.every(position=>position>=0));
  assert.deepEqual(positions,[...positions].sort((a,b)=>a-b));
  assert.match(html,/aria-expanded="false"/);
  const hidden=renderGains({alternativeHeatmapViews:true,numbersVisible:false});
  assert.doesNotMatch(hidden,/role="tablist"|Holdings heatmap|ranked-holdings|gains-detail-section/);
});


test('Overview gain and loss values use shared up/down triangles instead of written signs',()=>{
  const model=portfolioModel([{id:'one',ticker:'ABC',quantity:10,currentPrice:125,previousClose:130,marketValue:1250,totalCost:1000,averageCostPerShare:100,brokerage:'Example',assetType:'Equity'}],{Example:500});
  const props={model,onHoldings:noop,onHeatmap:noop,onAccounts:noop};
  const html=renderToStaticMarkup(React.createElement(Tiles,{...props,numbersVisible:true}));
  assert.match(html,/M12 5l7 11H5z/);assert.match(html,/M12 19L5 8h14z/);
  assert.match(html,/class="sr-only">down<\/span>\$50.00/);
  assert.match(html,/class="sr-only">up<\/span>\$250.00/);
  assert.doesNotMatch(html,/\+\$|−\$/);
  const hidden=renderToStaticMarkup(React.createElement(Tiles,{...props,numbersVisible:false}));
  assert.doesNotMatch(hidden,/overview-change-arrow|class="sr-only">up|class="sr-only">down/);
});

test('zero and missing Overview changes never show a direction triangle',async()=>{
  const Change=(await load('../components/Dashboard/OverviewChange.tsx')).default;
  for(const value of [0,null,NaN]) {
    const html=renderToStaticMarkup(React.createElement(Change,{value,format:value=>String(value)}));
    assert.doesNotMatch(html,/overview-change-arrow|class="sr-only">up|class="sr-only">down/);
  }
});
