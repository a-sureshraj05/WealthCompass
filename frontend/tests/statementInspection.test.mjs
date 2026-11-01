import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectStatement } from '../components/Accounts/statementInspection.ts';

const header = 'Date,Action,Symbol,Description,Quantity,Price,Commissions & Fees,Amount,Settlement Date';
const source = (action = 'Buy') => `2025-06-10,${action},AAPL,Apple Inc,10,150,0,-1500,2025-06-11`;

test('source review preserves action casing, amounts and unrecognized values without guessing asset types', () => {
  const csv = `${header}\n${source('BTO')}\n${source('Transfer in')}\n${source('Buy')}`;
  const report = inspectStatement(csv, 'Schwab');
  assert.equal(report.error, '');
  assert.equal(report.rowCount, 3);
  assert.deepEqual(report.rows.map(row => row[1]), ['BTO', 'Transfer in', 'Buy']);
  assert.equal(report.rows[0][7], '-1500');
  assert.ok(!report.columns.includes('Asset Type'));
  assert.equal(csv, `${header}\n${source('BTO')}\n${source('Transfer in')}\n${source('Buy')}`);
});

test('CSV inspection reads quoted commas, escaped quotes, CRLF and multiline cells as one source row', () => {
  const csv = `\uFEFF${header}\r\n2025-06-10,Buy,AAPL,"Apple, Inc. ""Class A""\nExport note",10,"$1,500.00",0,-15000,2025-06-11\r\n`;
  const report = inspectStatement(csv, 'Schwab');
  assert.equal(report.error, '');
  assert.equal(report.rowCount, 1);
  assert.equal(report.rows[0][3], 'Apple, Inc. "Class A"\nExport note');
  assert.equal(report.rows[0][5], '$1,500.00');
});

test('inspection counts every source row while retaining only the first five for display', () => {
  const report = inspectStatement(`${header}\n${Array.from({ length: 32 }, () => source()).join('\n')}\n\n`, 'Schwab');
  assert.equal(report.error, '');
  assert.equal(report.rowCount, 32);
  assert.equal(report.rows.length, 5);
});

test('wrong formats, duplicate headers, unfinished quotes and empty exports cannot reach review', () => {
  assert.match(inspectStatement(`${header}\n${source()}`, 'Robinhood').error, /Missing columns/);
  assert.match(inspectStatement(`${header},Date\n${source()},2025-06-10`, 'Schwab').error, /duplicate/);
  assert.match(inspectStatement(`${header}\n2025-01-01,Buy,AAPL,"unfinished`, 'Schwab').error, /unfinished/);
  assert.match(inspectStatement(`${header}\n2025-01-01,Buy,AAPL,"bad"extra`, 'Schwab').error, /Unexpected text/);
  assert.match(inspectStatement(header, 'Schwab').error, /no source rows/);
  assert.match(inspectStatement('', 'Schwab').error, /Add a CSV/);
  assert.match(inspectStatement(header, 'Fidelity').error, /supported brokerage/);
});

test('Robinhood review uses its own exact source column names', () => {
  const csv = 'Activity Date,Process Date,Settle Date,Instrument,Description,Trans Code,Quantity,Price,Amount\n06/10/2025,06/10/2025,06/11/2025,AAPL,Apple Inc,BTO,1,10,-1000';
  const report = inspectStatement(csv, 'Robinhood');
  assert.equal(report.error, '');
  assert.equal(report.columns[2], 'Trans Code');
  assert.equal(report.rows[0][report.headers.indexOf('Trans Code')], 'BTO');
});
