import test from 'node:test';
import assert from 'node:assert/strict';
import { moveColumn, normalizeColumnOrder, normalizeVisibleColumns } from '../utils/tableColumns.ts';

const columns = ['ticker', 'quantity', 'cost', 'market'];

test('saved layouts retain user ordering while adding new columns and removing obsolete or duplicate keys', () => {
  assert.deepEqual(normalizeColumnOrder(['cost', 'ticker', 'cost', 'obsolete'], columns), ['cost', 'ticker', 'quantity', 'market']);
  assert.deepEqual(normalizeColumnOrder(null, columns), columns);
  assert.deepEqual(normalizeColumnOrder(['invalid'], columns), columns);
});

test('column presets and saved visibility always retain required identity columns', () => {
  assert.deepEqual(normalizeVisibleColumns(['market'], columns, ['ticker', 'quantity'], ['ticker']), ['ticker', 'market']);
  assert.deepEqual(normalizeVisibleColumns([], columns, ['ticker', 'quantity'], ['ticker']), ['ticker']);
  assert.deepEqual(normalizeVisibleColumns(['obsolete'], columns, ['ticker', 'quantity'], ['ticker']), ['ticker']);
});

test('new layouts use recommended columns while legacy saved order remains authoritative', () => {
  const order = normalizeColumnOrder(['market', 'ticker', 'quantity', 'cost'], columns);
  assert.deepEqual(normalizeVisibleColumns(undefined, order, ['ticker', 'market'], ['ticker']), ['market', 'ticker']);
});

test('column moves work in both directions without mutating stored input or dropping hidden fields', () => {
  assert.deepEqual(moveColumn(columns, 'market', 'quantity'), ['ticker', 'market', 'quantity', 'cost']);
  assert.deepEqual(moveColumn(columns, 'ticker', 'cost'), ['quantity', 'cost', 'ticker', 'market']);
  assert.deepEqual(columns, ['ticker', 'quantity', 'cost', 'market']);
});

test('unknown or unchanged move targets preserve the layout', () => {
  assert.deepEqual(moveColumn(columns, 'unknown', 'ticker'), columns);
  assert.deepEqual(moveColumn(columns, 'ticker', 'unknown'), columns);
  assert.deepEqual(moveColumn(columns, 'ticker', 'ticker'), columns);
});
