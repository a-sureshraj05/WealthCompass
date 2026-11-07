import test from 'node:test';
import assert from 'node:assert/strict';
import { holdingComparisonPlot, sampleHoldingPlot } from '../components/Dashboard/Performance/holdingComparisonModel.ts';
const point=(date,profit,wealth)=>({date,profit,wealth});
const lines=[{key:'AAPL',label:'AAPL',color:'blue',series:[point('2024-01-02',0,100),point('2024-01-03',10,110)]},{key:'MSFT',label:'MSFT',color:'teal',series:[point('2024-01-03',20,1020),point('2024-01-04',40,1040)]}];
test('multiple stock lines retain their own amounts and actual entry/exit dates',()=>{
  const plot=holdingComparisonPlot(lines,'profit');
  assert.deepEqual(plot.map(row=>row.AAPL),[0,10,null]);
  assert.deepEqual(plot.map(row=>row.MSFT),[null,20,40]);
  assert.ok(plot.every(row=>row.time===Date.parse(row.date)));
  const wealth=holdingComparisonPlot(lines,'wealth');
  assert.equal(wealth[1].AAPL,110);assert.equal(wealth[1].MSFT,1020);
});
test('chart sampling preserves every stock entry, exit and recorded activity',()=>{
  const points=Array.from({length:1000},(_,index)=>({date:new Date(Date.parse('2020-01-01')+index*86400000).toISOString().slice(0,10),profit:index,wealth:index+100}));
  const stock={key:'ABC',label:'ABC',color:'blue',series:points.slice(43,887),activityDates:[points[155].date]};
  const sampled=sampleHoldingPlot(points,[stock]);
  for(const date of [points[43].date,points[886].date,points[155].date]) assert.ok(sampled.some(row=>row.date===date));
  assert.ok(sampled.length<300);
});
