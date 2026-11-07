import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'esbuild';
import Module from 'node:module';
import { fileURLToPath } from 'node:url';

async function component(relative) {
  const path = fileURLToPath(new URL(relative, import.meta.url));
  const result = await build({ entryPoints: [path], bundle: true, write: false, format: 'cjs', platform: 'node', packages: 'external', define: { 'import.meta.env.DEV': 'true' }, loader: { '.css': 'empty', '.png': 'dataurl' } });
  const loaded = new Module(path);
  loaded.paths = Module._nodeModulePaths(fileURLToPath(new URL('../', import.meta.url)));
  loaded._compile(result.outputFiles[0].text, path);
  return loaded.exports.default;
}
const Accounts = await component('../components/ImportDataView.tsx');
const Connections = await component('../components/Accounts/AccountConnections.tsx');
const Logo = await component('../components/Accounts/BrokerageLogo.tsx');
const SourceReview = await component('../components/Accounts/StatementPreview.tsx');
const noop = () => {};
const connections = [
  { id: 1, brokerage: 'Schwab', authorization_id: 'auth-1' },
  { id: 2, brokerage: 'Schwab', authorization_id: 'auth-2' },
];
const accounts = [
  { id: 'provider-1', name: 'Individual', brokerage: 'Schwab', authorization_id: 'auth-1' },
  { id: 'provider-2', name: 'Retirement', brokerage: 'Schwab', authorization_id: 'auth-2' },
];
const connectionProps = { connections, accounts, loaded: true, loadError: '', refreshedAt: '10:30 AM', busy: false, refreshing: false, scope: 'selected', selectedIds: ['provider-2'], onRefresh: noop, onSelection: noop, onToggle: noop, onManage: noop };

test('account cards keep identically named brokerages separate and reflect exact selected scope', () => {
  const html = renderToStaticMarkup(React.createElement(Connections, connectionProps));
  assert.equal((html.match(/class="ac-connection(?: has-selection)?"/g) || []).length, 2);
  assert.equal((html.match(/class="ac-account-row(?: is-included)?"/g) || []).length, 2);
  assert.equal((html.match(/checked=""/g) || []).length, 1);
  assert.match(html, /Included in next sync/);
  assert.match(html, /Excluded from next sync/);
  assert.match(html, /Schwab logo/);
  assert.match(html, /transaction synchronization is a separate action/);
});

test('failed and empty connection states are distinct and stale accounts disappear after a failure', () => {
  const failure = renderToStaticMarkup(React.createElement(Connections, { ...connectionProps, loadError: 'Provider unavailable' }));
  assert.match(failure, /role="alert"/);
  assert.match(failure, /Provider unavailable/);
  assert.doesNotMatch(failure, /class="ac-account-row/);
  assert.doesNotMatch(failure, /Connect your first brokerage/);
  const empty = renderToStaticMarkup(React.createElement(Connections, { ...connectionProps, connections: [], accounts: [] }));
  assert.match(empty, /Connect your first brokerage/);
  assert.doesNotMatch(empty, /role="alert"/);
});

test('connected and import workflows render separately with guarded primary actions', () => {
  const props = { onAddTransactions: noop, setLoading: noop, onRefresh: noop };
  const connected = renderToStaticMarkup(React.createElement(Accounts, { ...props, initialTab: 'connect' }));
  assert.match(connected, /Synchronize activity/);
  assert.match(connected, /disabled=""[^>]*>Sync transactions/);
  assert.doesNotMatch(connected, /Prepare your statement/);
  const manual = renderToStaticMarkup(React.createElement(Accounts, { ...props, initialTab: 'manual' }));
  assert.match(manual, /Prepare your statement/);
  assert.match(manual, /Review &amp; import/);
  assert.match(manual, /This replaces manual history/);
  assert.match(manual, /disabled=""[^>]*>Review statement/);
  assert.doesNotMatch(manual, />Import statement/);
  assert.doesNotMatch(manual, /Synchronize activity/);
  assert.doesNotMatch(manual, /Parse Statement/);
});


test('recognized brokerage marks are bundled and render without external image URLs', () => {
  for (const name of ['Fidelity Investments', 'Charles Schwab', 'Robinhood', 'The Vanguard Group', 'E*TRADE']) {
    const html = renderToStaticMarkup(React.createElement(Logo, { name }));
    assert.match(html, /src="data:image\/png;base64,/);
    assert.match(html, /alt=/);
    assert.doesNotMatch(html, /https?:|google|favicon/);
  }
  const other = renderToStaticMarkup(React.createElement(Logo, { name: 'Another broker' }));
  assert.match(other, /Another broker brokerage/);
  assert.doesNotMatch(other, /<img/);
});

test('statement review exposes original action values and distinguishes source rows from imported transactions', () => {
  const inspection = { headers: ['Date', 'Action', 'Symbol'], columns: ['Date', 'Action', 'Symbol'], rows: [['2025-01-01', 'Transfer in', 'AAPL']], rowCount: 1, error: '' };
  const html = renderToStaticMarkup(React.createElement(SourceReview, { inspection, brokerage: 'Schwab', sourceName: 'sample.csv', busy: false, onEdit: noop }));
  assert.match(html, />Transfer in</);
  assert.match(html, /source row/);
  assert.match(html, /Asset classification and transaction validation happen on the server/);
  assert.doesNotMatch(html, />Import statement/);
});
