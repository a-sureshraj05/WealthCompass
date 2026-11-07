/** Preserve valid saved ordering, remove duplicates, and append newly added columns. */
export function normalizeColumnOrder<T extends string>(value: unknown, defaults: readonly T[]): T[] {
  const saved = Array.isArray(value) ? value.filter((key): key is T => defaults.includes(key)) : [];
  return [...new Set([...saved, ...defaults])];
}

export function normalizeVisibleColumns<T extends string>(value: unknown, order: readonly T[], recommended: readonly T[], required: readonly T[]): T[] {
  const selected = Array.isArray(value) ? value.filter((key): key is T => order.includes(key)) : [...recommended];
  const valid = new Set([...selected, ...required]);
  return order.filter(key => valid.has(key));
}

export function moveColumn<T extends string>(order: readonly T[], column: T, target: T): T[] {
  const from = order.indexOf(column), to = order.indexOf(target);
  if (from < 0 || to < 0 || from === to) return [...order];
  const next = [...order];
  next.splice(from, 1);
  next.splice(to, 0, column);
  return next;
}
