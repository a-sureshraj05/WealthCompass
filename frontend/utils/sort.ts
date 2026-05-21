export type SortDirection = 'asc' | 'desc' | null;

export function compareValues(a: any, b: any, direction: 'asc' | 'desc'): number {
  if (a < b) return direction === 'asc' ? -1 : 1;
  if (a > b) return direction === 'asc' ? 1 : -1;
  return 0;
}

export function toggleSort<T extends string>(
  key: T,
  current: T | null,
  direction: SortDirection,
): { key: T | null; direction: SortDirection } {
  if (current !== key) return { key, direction: 'asc' };
  if (direction === 'asc') return { key, direction: 'desc' };
  return { key: null, direction: null };
}
