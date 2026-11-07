import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const result = await build({ entryPoints: [fileURLToPath(new URL('../services/apiService.ts', import.meta.url))], bundle: true, write: false, format: 'esm', platform: 'node', define: { 'import.meta.env.DEV': 'false' } });
const api = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
const originalFetch = globalThis.fetch;
const calls = [];
let responseBody = [];
let status = 200;
globalThis.fetch = async (url, options) => { calls.push({ url, options }); return new Response(JSON.stringify(responseBody), { status }); };
after(() => { globalThis.fetch = originalFetch; });

test('local portfolio accounts and provider synchronization accounts use distinct contracts', async () => {
  responseBody = [{ id: 42, snaptrade_account_id: 'provider-uuid', name: 'Individual', brokerage: 'Schwab' }];
  assert.equal((await api.fetchAccounts())[0].id, 42);
  assert.equal(calls.at(-1).url, '/api/v1/brokerage/accounts');
  responseBody = [{ id: 'provider-uuid', authorization_id: 'auth-uuid', name: 'Individual', brokerage: 'Schwab' }];
  assert.equal((await api.fetchBrokerageAccounts())[0].id, 'provider-uuid');
  assert.equal(calls.at(-1).url, '/api/v1/brokerage/provider-accounts');
});

test('account hiding uses the provider ignore route, and authorization IDs are encoded', async () => {
  await api.ignoreBrokerageAccount('account/a');
  assert.equal(calls.at(-1).url, '/api/v1/brokerage/accounts/account%2Fa/ignore');
  assert.equal(calls.at(-1).options.method, 'DELETE');
  await api.deleteBrokerageConnection('auth/a');
  assert.equal(calls.at(-1).url, '/api/v1/brokerage/connections/auth%2Fa');
});

test('sync sends repeated provider account and ticker parameters with the exact requested dates', async () => {
  await api.syncBrokerageTransactions('2026-01-01', '2026-10-31', ['provider-1', 'provider-2'], ['AAPL', 'BRK.B']);
  const call = calls.at(-1);
  const url = new URL(call.url, 'http://local.test');
  assert.deepEqual(url.searchParams.getAll('account_ids'), ['provider-1', 'provider-2']);
  assert.deepEqual(url.searchParams.getAll('tickers'), ['AAPL', 'BRK.B']);
  assert.equal(url.searchParams.get('start_date'), '2026-01-01');
  assert.equal(url.searchParams.get('end_date'), '2026-10-31');
  assert.equal(call.options.method, 'POST');
});

test('provider restrictions and parser details reach the UI instead of a generic success or failure', async () => {
  status = 503;
  responseBody = { detail: 'No brokerage connection is configured for this account.' };
  await assert.rejects(() => api.fetchBrokerageConnections(), /No brokerage connection/);
  status = 400;
  responseBody = { detail: 'Required CSV column Symbol not found.' };
  await assert.rejects(() => api.parseStatement('bad', 'Schwab'), /Required CSV column/);
  status = 200;
});
