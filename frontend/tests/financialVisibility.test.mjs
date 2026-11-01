import test from 'node:test';
import assert from 'node:assert/strict';
import { createFinancialVisibility } from '../utils/financialVisibility.ts';

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

test('a saved hidden choice is masked before, during and after login loading without writing a default', async () => {
  const read = deferred();
  let writes = 0;
  const store = createFinancialVisibility(() => read.promise, async () => { writes++; });
  assert.equal(store.getSnapshot().visible, false);
  const loading = store.load();
  assert.equal(store.getSnapshot().ready, false);
  await store.setVisible(true);
  assert.equal(store.getSnapshot().visible, false);
  read.resolve(false);
  await loading;
  assert.equal(store.getSnapshot().ready, true);
  assert.equal(store.getSnapshot().visible, false);
  assert.equal(writes, 0);
});

test('both last choices restore on a fresh login and a session toggle becomes the next login default', async () => {
  let saved = false;
  const login = () => createFinancialVisibility(async () => saved, async visible => { saved = visible; });
  const first = login();
  await first.load();
  await first.toggle();
  assert.equal(first.getSnapshot().visible, true);
  const second = login();
  await second.load();
  assert.equal(second.getSnapshot().visible, true);
  await second.toggle();
  const third = login();
  await third.load();
  assert.equal(third.getSnapshot().visible, false);
});

test('a failed preference read stays hidden and can be retried without overwriting the saved choice', async () => {
  let failing = true;
  const store = createFinancialVisibility(async () => { if (failing) throw Error(); return true; }, async () => assert.fail('Must not write during load'));
  await store.load();
  assert.equal(store.getSnapshot().visible, false);
  assert.equal(store.getSnapshot().ready, false);
  assert.match(store.getSnapshot().error, /remain hidden/);
  failing = false;
  await store.retry();
  assert.equal(store.getSnapshot().visible, true);
  assert.equal(store.getSnapshot().error, '');
});

test('failed hide saves keep the current session hidden, report the unsaved choice, and support a retry', async () => {
  let failing = true;
  let saved = true;
  const store = createFinancialVisibility(async () => saved, async visible => { if (failing) throw Error(); saved = visible; });
  await store.load();
  await assert.rejects(store.setVisible(false), /Could not save/);
  assert.equal(store.getSnapshot().visible, false);
  assert.equal(store.getSnapshot().saving, false);
  assert.match(store.getSnapshot().error, /could not be saved/);
  await assert.rejects(store.flush());
  assert.equal(saved, true);
  failing = false;
  await store.retry();
  await store.flush();
  assert.equal(saved, false);
  assert.equal(store.getSnapshot().error, '');
});

test('a pending write disables further changes and logout waits for it to finish', async () => {
  const saving = deferred();
  const writes = [];
  const store = createFinancialVisibility(async () => true, async visible => { writes.push(visible); await saving.promise; });
  await store.load();
  const first = store.toggle();
  assert.equal(store.getSnapshot().visible, false);
  assert.equal(store.getSnapshot().saving, true);
  await store.toggle();
  assert.equal(store.getSnapshot().visible, false);
  let flushed = false;
  const flushing = store.flush().then(() => { flushed = true; });
  await Promise.resolve();
  assert.equal(flushed, false);
  saving.resolve();
  await Promise.all([first, flushing]);
  assert.equal(flushed, true);
  assert.deepEqual(writes, [false]);
});

test('late duplicate startup responses cannot overwrite the newer preference read', async () => {
  const first = deferred();
  const second = deferred();
  let reads = 0;
  const store = createFinancialVisibility(() => ++reads === 1 ? first.promise : second.promise, async () => {});
  const oldRead = store.load();
  const newRead = store.load();
  second.resolve(false);
  await newRead;
  await store.setVisible(true);
  first.resolve(false);
  await oldRead;
  assert.equal(store.getSnapshot().visible, true);
});

test('different authenticated workspaces never inherit each other’s visibility state', async () => {
  const first = createFinancialVisibility(async () => true, async () => {});
  await first.load();
  const second = createFinancialVisibility(async () => false, async () => {});
  assert.equal(second.getSnapshot().visible, false);
  await second.load();
  assert.equal(second.getSnapshot().visible, false);
  assert.equal(first.getSnapshot().visible, true);
});
