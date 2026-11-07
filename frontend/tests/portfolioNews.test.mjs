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
const {default:News,newsPage}=await load('../components/Dashboard/News/PortfolioNews.tsx');
const Login=(await load('../components/LoginPage.tsx')).default;
const Overview=(await load('../components/Dashboard/PortfolioOverview.tsx')).default;
const {previewNewsFeed}=await load('../preview/newsData.ts');
const {previewDataset}=await load('../preview/portfolioScenarios.ts');
const {fetchPortfolioNews}=await load('../services/apiService.ts');
const {previewApiFetch}=await load('../preview/api.ts');
const feed=previewNewsFeed(previewDataset().holdings,new Date('2026-11-07T12:00:00Z'));
const state={data:feed,loading:false,error:'',refresh:()=>{}};
const render=props=>renderToStaticMarkup(React.createElement(News,{state,...props}));

test('twenty stories produce four pages of five without repeating between pages',()=>{
  const stories=Array.from({length:25},(_,i)=>({...feed.items[0],title:`Story ${i}`}));
  const pages=[1,2,3,4].map(page=>newsPage(stories,page));
  assert.ok(pages.every(page=>page.items.length===5 && page.pages===4 && page.total===20));
  assert.equal(new Set(pages.flatMap(page=>page.items.map(item=>item.title))).size,20);
  assert.equal(newsPage(stories,99).page,4);assert.equal(newsPage(stories,-1).page,1);assert.equal(newsPage([],1).items.length,0);
});
test('news renders five previews, publisher/times, related holdings and numbered controls',()=>{
  const html=render({initialPage:2});
  assert.equal((html.match(/<article>/g)||[]).length,5);
  for(const text of ['Showing 6–10 of 20 stories','News page 4','Design preview · fictional','Related to','combined weight']) assert.ok(html.includes(text),text);
  assert.match(html,/aria-current="page">2<\/button>/);assert.match(html,/<time dateTime=/);
});
test('hidden figures remove news associations, weights and story contents from the DOM',()=>{
  const html=render({numbersVisible:false});
  assert.match(html,/Your portfolio news is hidden/);assert.doesNotMatch(html,/Illustrative|AAPL|combined weight|news-list/);
});
test('source failures, pending requests and empty feeds are explicit',()=>{
  assert.match(render({state:{...state,data:null,loading:true}}),/Finding news for your portfolio/);
  assert.match(render({state:{...state,data:null,error:'News could not be refreshed.'}}),/News could not be refreshed/);
  assert.match(render({state:{...state,data:{...feed,items:[],preview:false,message:'No recent stories were returned.'}}}),/No recent stories were returned/);
});
test('unsafe publisher URLs never become links and supplied HTML is escaped',()=>{
  const story={...feed.items[0],url:'javascript:alert(1)',title:'<script>bad</script>',summary:'<img onerror=alert(1)>'};
  const html=render({state:{...state,data:{...feed,items:[story]}}});
  assert.doesNotMatch(html,/href="javascript|<script>|<img onerror/);assert.match(html,/&lt;script&gt;/);
});
test('each live refresh posts without browser caching or sending portfolio data from the client',async()=>{
  const originalWindow=globalThis.window,originalFetch=globalThis.fetch,calls=[];
  try {
    globalThis.window={location:{pathname:'/'}};
    globalThis.fetch=async(url,options)=>{calls.push([url,options]);return new Response(JSON.stringify({...feed,preview:false}),{status:200});};
    await fetchPortfolioNews();await fetchPortfolioNews();
    assert.equal(calls.length,2);
    assert.ok(calls.every(([url,options])=>url==='/api/v1/news/refresh' && options.method==='POST' && options.cache==='no-store' && options.body===undefined));
  } finally { globalThis.fetch=originalFetch;if(originalWindow===undefined) delete globalThis.window;else globalThis.window=originalWindow; }
});
test('isolated preview supplies twenty labelled examples without a network fallback',async()=>{
  const originalWindow=globalThis.window,originalFetch=globalThis.fetch;
  try {
    globalThis.window={location:{pathname:'/design-preview',search:'?portfolio=100-mixed'}};
    globalThis.fetch=()=>{throw Error('Preview must not fetch real news');};
    const result=await (await previewApiFetch('/api/v1/news/refresh',{method:'POST'})).json();
    assert.equal(result.preview,true);assert.equal(result.items.length,20);assert.ok(result.items.every(item=>item.source==='Design sample' && item.url===null));
  } finally { globalThis.fetch=originalFetch;if(originalWindow===undefined) delete globalThis.window;else globalThis.window=originalWindow; }
});
test('enriched login retains form labels and autocomplete without publishing credentials',()=>{
  const html=renderToStaticMarkup(React.createElement(Login,{onLogin:()=>{}}));
  for(const text of ['A clearer direction.','Sign in to your account','See the whole picture','How it works','Your account, explained','Save the recovery key','ILLUSTRATIVE VIEW']) assert.ok(html.includes(text),text);
  assert.match(html,/for="login-email"/);assert.match(html,/autoComplete="current-password"/);assert.doesNotMatch(html,/demouser@gmail.com|demo password|guaranteed return|FDIC|SIPC/);
});
test('local login preview makes disabled sign-in explicit',()=>{
  const html=renderToStaticMarkup(React.createElement(Login,{preview:true,onLogin:()=>{}}));
  assert.match(html,/sign-in is disabled here/);assert.match(html,/<button type="submit" disabled=""/);assert.match(html,/Open dashboard preview/);
});
test('news appears in Snapshot without changing Overview Performance',()=>{
  const data=previewDataset(),props={preview:true,refined:true,holdings:data.holdings,cashByBrokerage:data.cash,news:React.createElement(News,{state}),onOpenHoldings:()=>{},onConnect:()=>{},onRefresh:()=>{},performance:React.createElement('div',{},'Existing performance')};
  assert.match(renderToStaticMarkup(React.createElement(Overview,{...props,initialSection:'snapshot'})),/portfolio-news-title/);
  const performance=renderToStaticMarkup(React.createElement(Overview,{...props,initialSection:'performance'}));
  assert.match(performance,/Existing performance/);assert.doesNotMatch(performance,/portfolio-news-title/);
});

test('related holding badges show ticker logos without losing ticker and weight labels',()=>{
  const story={...feed.items[0],tickers:['AAPL','VTI'],weight:.304};
  const html=render({state:{...state,data:{...feed,items:[story]}}});
  assert.equal((html.match(/class="news-related-logo"/g)||[]).length,2);
  assert.match(html,/alt="AAPL logo"/);assert.match(html,/width="16" height="16"/);
  assert.match(html,/<span>VTI<\/span>/);assert.match(html,/30.4% combined weight/);
});
