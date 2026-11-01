import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const result = await build({
  entryPoints: [fileURLToPath(new URL('../services/apiService.ts', import.meta.url))],
  bundle: true, write: false, format: 'esm', platform: 'node',
  define: { 'import.meta.env.DEV': 'true' },
});
const api = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
const originalWindow = globalThis.window;
const originalFetch = globalThis.fetch;
let networkCalls = 0;
globalThis.window = { location: { pathname: '/design-preview', reload() { throw new Error('Preview must not reload for authentication'); } } };
globalThis.fetch = async () => { networkCalls++; throw new Error('Preview must not reach the network'); };
after(() => { globalThis.window = originalWindow; globalThis.fetch = originalFetch; });

test('preview connections, analyst prices, options and lots resolve through the in-memory adapter', async () => {
  const connections = await api.fetchBrokerageConnections();
  const accounts = await api.fetchBrokerageAccounts();
  assert.equal(connections.length, 3);
  assert.equal(accounts.length, 3);
  assert.ok(accounts.every(account => connections.some(connection => connection.authorization_id === account.authorization_id)));
  assert.ok((await api.fetchAnalystData(['NVDA'])).every(row => Number.isFinite(row.targetMedian)));
  assert.equal((await api.fetchOptionsPositions())[0].quantity, 3);
  assert.deepEqual(await api.fetchLotAssignments(), []);
  assert.equal(networkCalls, 0);
});

test('preview preferences and options retention write only to in-memory sample state', async () => {
  await api.savePreferences({ sample_order: ['ticker', 'price'] });
  assert.deepEqual((await api.fetchPreferences()).sample_order, ['ticker', 'price']);
  await api.updateOptionsRetain('Schwab', 'NVDA', '2026-09-18', 99);
  let [position] = await api.fetchOptionsPositions();
  assert.equal(position.retainQuantity, 3);
  assert.equal(position.sellableQuantity, 0);
  await api.updateOptionsRetain('Schwab', 'NVDA', '2026-09-18', 1);
  [position] = await api.fetchOptionsPositions();
  assert.equal(position.sellableQuantity, 2);
  assert.equal(networkCalls, 0);
});

test('preview sync and statement imports produce clearly fictional records without contacting a brokerage', async () => {
  assert.match((await api.syncBrokerageTransactions()).message, /sample/);
  const rows = await api.parseStatement('Example statement', 'Fidelity');
  assert.equal(rows.length, 2);
  assert.ok(rows.every(row => row.id.startsWith('sample-import-')));
  assert.equal(networkCalls, 0);
});

test('unsupported preview writes and account connections fail closed without live fallback', async () => {
  await assert.rejects(() => api.getBrokerageConnectUrl('Fidelity'));
  await assert.rejects(() => api.deleteRawData());
  await assert.rejects(() => api.splitTransaction('sample-1', 3));
  assert.equal(networkCalls, 0);
});
