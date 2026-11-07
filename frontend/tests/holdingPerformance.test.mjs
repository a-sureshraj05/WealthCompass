import test from 'node:test';
import assert from 'node:assert/strict';
import { investorXirr, personalHoldingPerformance, matchedHoldingBenchmark } from '../components/Dashboard/Performance/holdingPerformanceModel.ts';
const tx = (date, action, quantity, amount, extra={}) => ({ id:`${date}-${action}`,date,action,ticker:'AAPL',brokerage:'Fidelity',quantity,totalCost:amount,price:quantity ? amount / quantity : 0,assetType:'Equity',is_deleted:false,is_duplicate:false,...extra });
const run = (transactions, quotes, extra={}) => personalHoldingPerformance({ticker:'AAPL', transactions,prices:Object.fromEntries(Object.entries(quotes).map(([date,close])=>[date,typeof close==='number'?{close}:close])),sessions:Object.keys(quotes).sort(),asOf:Object.keys(quotes).sort().at(-1),...extra});
const near = (actual,expected) => assert.ok(Math.abs(actual-expected)<1e-6,`${actual} != ${expected}`);

test('XIRR uses actual dates and reports multiple roots rather than choosing one',()=>{
  near(investorXirr([{date:'2023-01-01',amount:-100},{date:'2024-01-01',amount:110}]).rate,.1);
  assert.equal(investorXirr([{date:'2021-01-01',amount:-100},{date:'2022-01-01',amount:230},{date:'2023-01-01',amount:-132}]).reason,'ambiguous');
  assert.equal(investorXirr([{date:'2023-02-30',amount:-100},{date:'2024-01-01',amount:110}]).reason,'invalid');
  assert.equal(investorXirr([{date:'2023-01-01',amount:-100}]).rate,null);
});

test('partial sale, additional purchase, income and fees reconcile personal profit',()=>{
  const result=run([tx('2023-01-02','BUY',10,100),tx('2023-06-01','BUY',10,200),tx('2023-06-02','SELL',5,125),tx('2023-06-02','DIV',0,10),tx('2023-06-02','FEE',0,2)],{'2023-01-02':10,'2023-06-01':20,'2023-06-02':25,'2024-01-02':30});
  assert.equal(result.status,'ready');assert.equal(result.quantity,15);assert.equal(result.added,302);assert.equal(result.returned,135);assert.equal(result.value,450);assert.equal(result.profit,283);
  assert.equal(result.profit,result.value+result.returned-result.added);
  const benchmark=matchedHoldingBenchmark(result,Object.fromEntries(result.series.map(row=>[row.date,{close:10,totalReturnIndex:10}])));
  assert.equal(benchmark.status,'ready');near(benchmark.profit,-2);near(benchmark.value,165);
});

test('fully sold holding ends at exit, not at latest market price',()=>{
  const result=run([tx('2023-01-02','BUY',10,100),tx('2023-06-01','SELL',10,150)],{'2023-01-02':10,'2023-06-01':15,'2024-01-02':80});
  assert.equal(result.status,'ready');assert.equal(result.closed,true);assert.equal(result.end,'2023-06-01');assert.equal(result.profit,50);assert.equal(result.series.length,2);
  const benchmark=matchedHoldingBenchmark(result,{'2023-01-02':{close:10},'2023-06-01':{close:20}});
  assert.equal(benchmark.status,'ready');near(benchmark.value,50);near(benchmark.profit,100);
});

test('benchmark cannot invent funding when matching a sale',()=>{
  const result=run([tx('2023-01-02','BUY',10,100),tx('2023-06-01','SELL',10,150)],{'2023-01-02':10,'2023-06-01':15});
  assert.equal(matchedHoldingBenchmark(result,{'2023-01-02':{close:10},'2023-06-01':{close:11}}).status,'incomplete');
  assert.equal(result.profit,50);
});

test('subperiod starts all investments with equal opening value',()=>{
  const result=run([tx('2023-01-02','BUY',10,100),tx('2024-01-02','BUY',5,150)],{'2023-01-02':10,'2023-12-29':20,'2024-01-02':30,'2024-06-03':40},{start:'2024-01-01'});
  assert.equal(result.status,'ready');assert.equal(result.openingValue,200);assert.equal(result.added,350);assert.equal(result.profit,250);
  const benchmark=matchedHoldingBenchmark(result,Object.fromEntries(result.series.map(row=>[row.date,{close:50}])));
  assert.equal(benchmark.status,'ready');near(benchmark.value,350);near(benchmark.profit,0);
});

test('reinvestment and splits add shares without outside capital',()=>{
  const result=run([tx('2023-01-02','BUY',10,100),tx('2023-06-01','REI',1,10)],{'2023-01-02':10,'2023-06-01':10,'2024-01-02':{close:6,splitRatio:2}});
  assert.equal(result.status,'ready');assert.equal(result.quantity,22);assert.equal(result.added,100);assert.equal(result.returned,0);assert.equal(result.value,132);assert.equal(result.profit,32);
});

test('missing prices and opening shares remain unavailable, never manufactured',()=>{
  assert.equal(run([tx('2023-01-02','BUY',10,100)],{'2023-01-02':10,'2023-06-01':{}}).status,'incomplete');
  assert.equal(run([tx('2023-01-02','SELL',10,100)],{'2023-01-02':10}).status,'incomplete');
  assert.equal(run([tx('2022-01-02','BUY',10,100)],{'2023-01-02':10}).status,'incomplete');
  assert.equal(run([tx('2023-01-02','TRANSFER',10,100)],{'2023-01-02':10}).status,'incomplete');
});

test('non-session activity uses the next session and ignores deleted/duplicate rows and options',()=>{
  const result=run([tx('2023-01-07','BUY',10,100),tx('2023-01-09','SELL',40,400,{is_deleted:true}),tx('2023-01-09','SELL',40,400,{is_duplicate:true}),tx('2023-01-09','BUY',3,300,{assetType:'Options'})],{'2023-01-06':10,'2023-01-09':11});
  assert.equal(result.status,'ready');assert.equal(result.quantity,10);assert.equal(result.shiftedDates,1);assert.equal(result.activity[0].date,'2023-01-09');assert.equal(result.profit,10);
});

test('zero cash entries do not produce NaN benchmark balances',()=>{
  const result=run([tx('2023-01-02','BUY',1,10),tx('2023-01-03','SELL',1,10),tx('2023-01-04','DIV',0,0)],{'2023-01-02':10,'2023-01-03':10,'2023-01-04':10});
  const benchmark=matchedHoldingBenchmark(result,{'2023-01-02':{close:10},'2023-01-03':{close:10}});
  assert.equal(benchmark.status,'ready');assert.equal(benchmark.value,0);assert.equal(benchmark.profit,0);
});

test('XIRR agrees with the standard irregular-date example',()=>{
  const amounts=[-10000,2750,4250,3250,2750], dates=['2008-01-01','2008-03-01','2008-10-30','2009-02-15','2009-04-01'];
  near(investorXirr(dates.map((date,index)=>({date,amount:amounts[index]}))).rate,.3733625335);
});

test('many monthly additions still produce a unique personal return',()=>{
  const flows=Array.from({length:180},(_,index)=>({date:new Date(Date.UTC(2010+Math.floor(index/12),index%12,1)).toISOString().slice(0,10),amount:-100}));
  flows.push({date:'2025-01-01',amount:18000});
  near(investorXirr(flows).rate,0);
});

test('unlinked dividend plus reinvestment legs cannot double-count income',()=>{
  const result=run([tx('2023-01-02','BUY',10,100),tx('2023-06-01','DIV',0,10),tx('2023-06-01','REI',1,10)],{'2023-01-02':10,'2023-06-01':10});
  assert.equal(result.status,'incomplete');assert.match(result.message,/counted twice/);
});
