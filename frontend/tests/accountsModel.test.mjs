import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSyncRequest, normalizeSyncTickers, validateStatementFile, MAX_STATEMENT_BYTES } from '../components/Accounts/accountsModel.ts';

const request = overrides => buildSyncRequest({ scope: 'all', selectedIds: [], availableIds: ['provider-1', 'provider-2'], period: 'history', start: '', end: '', tickerInput: '', ...overrides });

test('all-account and selected syncs always send explicit provider IDs without widening an empty scope', () => {
  assert.deepEqual(request().accountIds, ['provider-1', 'provider-2']);
  assert.deepEqual(request({ scope: 'selected', selectedIds: ['provider-2', 'provider-2'] }).accountIds, ['provider-2']);
  assert.throws(() => request({ scope: 'selected' }), /at least one account/);
  assert.throws(() => request({ availableIds: [] }), /at least one account/);
  assert.throws(() => request({ scope: 'selected', selectedIds: ['removed-account'] }), /list has changed/);
});

test('available history clears custom dates and YTD uses the current local calendar year', () => {
  const history = request({ start: '2020-01-01', end: '2020-12-31' });
  assert.equal(history.startDate, undefined);
  assert.equal(history.endDate, undefined);
  const ytd = request({ period: 'ytd', now: new Date(2027, 2, 17) });
  assert.equal(ytd.startDate, '2027-01-01');
  assert.equal(ytd.endDate, '2027-03-17');
});

test('custom ranges accept a single boundary and reject invalid, missing or reversed dates', () => {
  assert.equal(request({ period: 'custom', end: '2026-10-31' }).startDate, undefined);
  assert.equal(request({ period: 'custom', start: '2026-10-31' }).endDate, undefined);
  assert.throws(() => request({ period: 'custom' }), /start or end date/);
  assert.throws(() => request({ period: 'custom', start: '2026-02-30' }), /valid dates/);
  assert.throws(() => request({ period: 'custom', start: '2026-11-01', end: '2026-10-31' }), /on or before/);
});

test('ticker drafts normalize multiple separators and duplicates without requiring an extra Add action', () => {
  assert.deepEqual(normalizeSyncTickers(' aapl, msft;AAPL\nBRK.B  BTC-USD '), ['AAPL', 'MSFT', 'BRK.B', 'BTC-USD']);
  assert.deepEqual(request({ tickerInput: 'aapl, msft' }).tickers, ['AAPL', 'MSFT']);
  assert.equal(request({ tickerInput: ' ,  ' }).tickers, undefined);
});

test('statement file checks reject unsupported, empty and oversized files before reading or importing', () => {
  assert.doesNotThrow(() => validateStatementFile({ name: 'Export.CSV', size: MAX_STATEMENT_BYTES }));
  assert.doesNotThrow(() => validateStatementFile({ name: 'Export.txt', size: 100 }));
  assert.throws(() => validateStatementFile({ name: 'Export.pdf', size: 100 }), /not supported/);
  assert.throws(() => validateStatementFile({ name: 'Export.csv', size: 0 }), /empty/);
  assert.throws(() => validateStatementFile({ name: 'Export.csv', size: MAX_STATEMENT_BYTES + 1 }), /5 MB/);
});
