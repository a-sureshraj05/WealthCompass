import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchPreferences, savePreferences } from '../services/apiService';
import { moveColumn, normalizeColumnOrder, normalizeVisibleColumns } from '../utils/tableColumns';

export function useTableColumns<T extends string>(key: string, defaults: readonly T[], recommended: readonly T[], required: readonly T[]) {
  const visibilityKey = `${key}-visible`;
  const cachePrefix = import.meta.env.DEV && typeof window !== 'undefined' && window.location.pathname === '/design-preview' ? 'design-preview:' : '';
  const cache = useCallback((order: T[], visible: T[]) => { try { localStorage.setItem(`${cachePrefix}${key}`, JSON.stringify(order)); localStorage.setItem(`${cachePrefix}${visibilityKey}`, JSON.stringify(visible)); } catch { /* Browser cache is optional. */ } }, [key, visibilityKey, cachePrefix]);
  const [settings, setSettings] = useState(() => {
    let order: T[] = [...defaults], visible: T[] = [...recommended];
    try { order = normalizeColumnOrder(JSON.parse(localStorage.getItem(`${cachePrefix}${key}`) || 'null'), defaults); visible = normalizeVisibleColumns(JSON.parse(localStorage.getItem(`${cachePrefix}${visibilityKey}`) || 'null'), order, recommended, required); } catch { /* Use the recommended layout. */ }
    return { order, visible };
  });
  const current = useRef(settings);
  const edited = useRef(false);
  const writes = useRef<Promise<unknown>>(Promise.resolve());
  const commit = useCallback((order: T[], visible: T[]) => {
    edited.current = true;
    const next = { order, visible: normalizeVisibleColumns(visible, order, recommended, required) };
    current.current = next;
    setSettings(next);
    cache(next.order, next.visible);
    // Send one merged preference update and serialize rapid edits. In particular,
    // moving a column never triggers a state update inside another state updater.
    writes.current = writes.current.catch(() => {}).then(() => savePreferences({ [key]: next.order, [visibilityKey]: next.visible })).catch(() => {});
  }, [key, visibilityKey, recommended, required, cache]);
  useEffect(() => {
    let cancelled = false;
    fetchPreferences().then(preferences => {
      if (cancelled || edited.current) return;
      const initial = current.current;
      const order = normalizeColumnOrder(preferences[key] ?? initial.order, defaults);
      const visible = normalizeVisibleColumns(preferences[visibilityKey] ?? initial.visible, order, recommended, required);
      const next = { order, visible };
      current.current = next; setSettings(next); cache(order, visible);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [key, visibilityKey, defaults, recommended, required, cache]);
  const reorder = useCallback((from: T, to: T) => commit(moveColumn(current.current.order, from, to), current.current.visible), [commit]);
  const move = useCallback((column: T, direction: -1 | 1) => { const order = current.current.order; const index = order.indexOf(column), target = index + direction; if (index >= 0 && target >= 0 && target < order.length) reorder(column, order[target]); }, [reorder]);
  const toggle = useCallback((column: T) => { if (required.includes(column)) return; const { order, visible } = current.current; commit(order, visible.includes(column) ? visible.filter(key => key !== column) : [...visible, column]); }, [commit, required]);
  const reset = useCallback(() => commit([...defaults], [...recommended]), [commit, defaults, recommended]);
  const preset = useCallback((visible: readonly T[]) => commit(current.current.order, [...visible]), [commit]);
  return { order: settings.order, visible: settings.visible, columns: settings.order.filter(key => settings.visible.includes(key)), reorder, move, toggle, reset, preset };
}
