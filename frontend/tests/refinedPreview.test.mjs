import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'esbuild';
import Module from 'node:module';
import { fileURLToPath } from 'node:url';
import { previewDesign, previewDesignHref, previewOverviewSection } from '../preview/previewDesign.ts';

async function load(relative) {
  const path=fileURLToPath(new URL(relative,import.meta.url));
  const result=await build({entryPoints:[path],bundle:true,write:false,format:'cjs',platform:'node',packages:'external',define:{'import.meta.env.DEV':'true'},loader:{'.css':'empty','.svg':'dataurl','.png':'dataurl'}});
  const loaded=new Module(path);loaded.paths=Module._nodeModulePaths(fileURLToPath(new URL('../',import.meta.url)));loaded._compile(result.outputFiles[0].text,path);return loaded.exports;
}
const Overview=(await load('../components/Dashboard/PortfolioOverview.tsx')).default;
const Preview=(await load('../components/Dashboard/DashboardPreview.tsx')).default;
const { previewDataset }=await load('../preview/portfolioScenarios.ts');
const data=previewDataset();
const noop=()=>{};
const props={holdings:data.holdings,cashByBrokerage:data.cash,onOpenHoldings:noop,onRefresh:noop,onConnect:noop,preview:true,performance:React.createElement('div',{'data-sample-performance':true},'Performance content'),insights:React.createElement('div',{'data-sample-insights':true},'Insights content')};
const render=extra=>renderToStaticMarkup(React.createElement(Overview,{...props,...extra}));

test('design and sample switches stay on the isolated preview route and preserve the chosen tab and sample',()=>{
  const url=new URL(previewDesignHref('refined','100-mixed','holdings','performance'),'http://localhost:5180');
  assert.equal(url.pathname,'/design-preview');
  assert.equal(url.searchParams.get('design'),'refined');assert.equal(url.searchParams.get('portfolio'),'100-mixed');
  assert.equal(url.hash,'#holdings');assert.equal(previewOverviewSection(url.search),'performance');
  assert.equal(previewDesign('?design=unknown'),'current');assert.equal(previewOverviewSection('?section=unknown'),'snapshot');
  assert.equal(previewDesignHref('current','standard','dashboardView'),'/design-preview#dashboardView');
});

test('the current layout keeps insights, performance and the overview together by default',()=>{
  const html=render();
  assert.match(html,/data-sample-performance/);assert.match(html,/data-sample-insights/);assert.match(html,/Today&#x27;s contributors|Today&#39;s contributors/);
  assert.doesNotMatch(html,/refined-overview-tabs/);
});

test('refined sections isolate selected content while retaining the portfolio summary and navigation',()=>{
  for(const section of ['snapshot','performance','insights']) {
    const html=render({refined:true,initialSection:section});
    assert.match(html,new RegExp(`id="refined-panel-${section}"`));
    assert.match(html,/Total portfolio value/);assert.match(html,/\$212,995.75/);
    assert.equal(html.includes('data-sample-performance'),section==='performance');
    assert.equal(html.includes('data-sample-insights'),section==='insights');
    assert.equal(html.includes('daily-panel'),section==='snapshot');
    assert.match(html,/aria-label="Overview sections"/);
  }
});

test('refined snapshot honors financial visibility',()=>{
  const html=render({refined:true,numbersVisible:false});
  assert.doesNotMatch(html,/212,995|196,479|49,118/);assert.match(html,/Your portfolio figures are hidden/);
});

test('the refined shell keeps all five familiar destinations and exposes the comparison control',()=>{
  const html=renderToStaticMarkup(React.createElement(Preview,{initialDesign:'refined'}));
  assert.match(html,/refined-preview/);assert.match(html,/A familiar layout, refined/);
  assert.match(html,/Current staging/);assert.match(html,/Refined concept/);
  assert.match(html,/aria-label="Sample portfolios"/);
  for(const destination of ['Overview','Holdings','Gains &amp; Losses','Transactions','Accounts &amp; Imports']) assert.ok(html.includes(destination),destination);
});
