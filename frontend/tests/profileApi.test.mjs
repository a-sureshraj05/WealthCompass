import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const result = await build({ entryPoints: [fileURLToPath(new URL('../services/apiService.ts', import.meta.url))], bundle: true, write: false, format: 'esm', platform: 'node', define: { 'import.meta.env.DEV': 'false' } });
const api = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
const originalFetch = globalThis.fetch;
const calls = [];
let preferences = { profile_display_name: 'Jordan Doe', table_order: ['date', 'ticker'] };
let preferenceStatus = 200;
let logoutStatus = 200;
let saveStatus = 200;
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
globalThis.fetch = async (url, options = {}) => {
  calls.push({ url, options });
  if (url === '/api/v1/auth/me') return json({ email: 'profile@example.test' });
  if (url === '/api/v1/preferences' && options.method === 'PUT') {
    if (saveStatus !== 200) return json({ detail: 'Storage unavailable' }, saveStatus);
    preferences = { ...preferences, ...JSON.parse(options.body).preferences };
    return json({ preferences });
  }
  if (url === '/api/v1/preferences') return preferenceStatus === 200 ? json({ preferences }) : json({ detail: 'Profile storage unavailable' }, preferenceStatus);
  if (url === '/api/v1/auth/logout') return logoutStatus === 200 ? json({ ok: true }) : json({ detail: 'Session could not be ended' }, logoutStatus);
  throw new Error(`Unexpected request: ${url}`);
};
after(() => { globalThis.fetch = originalFetch; });

test('profile loads the signed-in email and the per-user saved display name', async () => {
  assert.deepEqual(await api.fetchAccountProfile(), { email: 'profile@example.test', displayName: 'Jordan Doe' });
  assert.ok(calls.some(call => call.url === '/api/v1/auth/me'));
});

test('name edits submit only the profile preference and leave table-layout preferences intact', async () => {
  assert.equal(await api.saveAccountDisplayName(' Suresh Raj '), 'Suresh Raj');
  const save = calls.findLast(call => call.options.method === 'PUT');
  assert.equal(save.url, '/api/v1/preferences');
  assert.deepEqual(JSON.parse(save.options.body), { preferences: { profile_display_name: 'Suresh Raj' } });
  assert.deepEqual(preferences.table_order, ['date', 'ticker']);
  assert.equal((await api.fetchAccountProfile()).displayName, 'Suresh Raj');
  const count = calls.length;
  await assert.rejects(() => api.saveAccountDisplayName(' '), /display name/);
  assert.equal(calls.length, count);
});

test('failed profile reads are reported instead of appearing to clear a saved name', async () => {
  preferenceStatus = 503;
  await assert.rejects(() => api.fetchAccountProfile(), /Profile storage unavailable/);
  preferenceStatus = 200;
});

test('logout calls the real session endpoint and propagates failure for the menu to display', async () => {
  logoutStatus = 500;
  await assert.rejects(() => api.logoutAccount(), /Session could not be ended/);
  assert.equal(calls.at(-1).url, '/api/v1/auth/logout');
  assert.equal(calls.at(-1).options.method, 'POST');
  logoutStatus = 200;
  await assert.doesNotReject(() => api.logoutAccount());
});

test('visibility restores booleans, defaults new accounts to visible, and rejects invalid or failed reads', async () => {
  assert.equal(await api.fetchFinancialVisibility(), true);
  preferences.financial_numbers_visible = false;
  assert.equal(await api.fetchFinancialVisibility(), false);
  preferences.financial_numbers_visible = true;
  assert.equal(await api.fetchFinancialVisibility(), true);
  preferences.financial_numbers_visible = 'false';
  await assert.rejects(api.fetchFinancialVisibility(), /Invalid visibility/);
  delete preferences.financial_numbers_visible;
  preferenceStatus = 503;
  await assert.rejects(api.fetchFinancialVisibility(), /Profile storage unavailable/);
  preferenceStatus = 200;
});

test('visibility saves only its account key, preserving the display name and table layouts', async () => {
  const name = preferences.profile_display_name;
  await api.saveFinancialVisibility(false);
  assert.deepEqual(JSON.parse(calls.at(-1).options.body), { preferences: { financial_numbers_visible: false } });
  assert.equal(await api.fetchFinancialVisibility(), false);
  assert.equal(preferences.profile_display_name, name);
  assert.deepEqual(preferences.table_order, ['date', 'ticker']);
  await api.saveFinancialVisibility(true);
  assert.equal(await api.fetchFinancialVisibility(), true);
  saveStatus = 503;
  await assert.rejects(api.saveFinancialVisibility(false), /Failed to save preferences/);
  assert.equal(preferences.financial_numbers_visible, true);
  saveStatus = 200;
});
