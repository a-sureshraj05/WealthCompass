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

test('preview profile edits stay in memory and real session logout is blocked', async () => {
  assert.equal((await api.fetchAccountProfile()).email, 'jordan.doe@example.test');
  await api.saveAccountDisplayName('Preview Person');
  assert.equal((await api.fetchAccountProfile()).displayName, 'Preview Person');
  await assert.rejects(() => api.logoutAccount());
  assert.equal(networkCalls, 0);
});

test('preview visibility survives a fresh adapter load through an isolated browser key without touching live preferences', async () => {
  const storage = new Map();
  globalThis.window.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  await api.saveFinancialVisibility(false);
  assert.deepEqual([...storage], [['wealthcompass:design-preview:financial-visibility', 'false']]);
  // A new bundled module has no in-memory preference state, like reloading the preview.
  const fresh = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text + '\n// fresh preview adapter').toString('base64')}`);
  assert.equal(await fresh.fetchFinancialVisibility(), false);
  assert.equal((await fresh.fetchAccountProfile()).displayName, '');
  await fresh.saveFinancialVisibility(true);
  assert.equal(await api.fetchFinancialVisibility(), true);
  assert.equal(networkCalls, 0);
});

test('the fifty-stock scenario uses matching quotes and statement rows with no leftover option positions', async () => {
  globalThis.window.location.search = '?portfolio=50-stocks';
  try {
    const quotes = await api.fetchAnalystData(['AAPL']);
    assert.equal(quotes.length, 50);
    assert.ok(quotes.some(quote => quote.ticker === 'ABT'));
    assert.deepEqual(await api.fetchOptionsPositions(), []);
    const imported = await api.parseStatement('Fictional statement', 'Fidelity');
    assert.deepEqual(imported.map(row => row.ticker), ['AAPL', 'MSFT']);
    assert.equal(networkCalls, 0);
  } finally { delete globalThis.window.location.search; }
});

for (const size of [50, 100]) {
  test(`${size}-holding mixed preview serves ETFs and contracts with matching calculator and retention data`, async () => {
    globalThis.window.location.search = `?portfolio=${size}-mixed`;
    let original;
    try {
      const quotes = await api.fetchAnalystData(['VTI']);
      assert.equal(quotes.length, size);
      assert.ok(quotes.some(quote => quote.ticker === 'VTI' && quote.sector === 'Diversified'));
      const options = await api.fetchOptionsPositions();
      assert.equal(options.length, size === 50 ? 6 : 12);
      assert.ok(options.some(option => option.ticker === 'SPY'));
      const calculator = await api.fetchOptionsCalculator();
      assert.ok(Math.abs(calculator.outstandingPremium - options.reduce((sum, option) => sum + option.quantity * 100 * option.buyPrice, 0)) < 1e-8);
      assert.ok(Math.abs(calculator.totalSellableValue - options.reduce((sum, option) => sum + option.sellableQuantity * 100 * option.currentPrice, 0)) < 1e-8);
      assert.ok(calculator.realizedLosses > 0);
      original = options[0];
      await api.updateOptionsRetain(original.brokerage, original.ticker, original.buyDate, 999);
      const updated = (await api.fetchOptionsPositions()).find(option => option.id === original.id);
      assert.equal(updated.retainQuantity, original.quantity);
      assert.equal(updated.sellableQuantity, 0);
      const nextCalculator = await api.fetchOptionsCalculator();
      assert.equal(nextCalculator.totalSellableQty, calculator.totalSellableQty - original.sellableQuantity);
      assert.equal(networkCalls, 0);
    } finally {
      if (original) await api.updateOptionsRetain(original.brokerage, original.ticker, original.buyDate, original.retainQuantity);
      delete globalThis.window.location.search;
    }
  });
}
