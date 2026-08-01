import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchPreferences, savePreferences } from '../services/apiService';

/**
 * Column order that follows the user between devices.
 *
 * Previously each view kept its order in localStorage, which is per-browser —
 * so the Mac and the phone held independent copies that could never agree.
 * This reads and writes the server-side preference blob instead.
 *
 * localStorage is still written, but only as a first-paint cache: the server is
 * authoritative and overwrites it once the fetch returns. That keeps the table
 * from flashing default order on every load.
 */
export function useSyncedColumnOrder<T extends string>(
  prefKey: string,
  defaults: readonly T[],
) {
  const isValid = useCallback(
    (value: unknown): value is T[] =>
      Array.isArray(value) &&
      value.length === defaults.length &&
      defaults.every(c => value.includes(c)),
    [defaults],
  );

  const [order, setOrder] = useState<T[]>(() => {
    try {
      const cached = localStorage.getItem(prefKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (isValid(parsed)) return parsed;
      }
    } catch { /* fall through to defaults */ }
    return [...defaults];
  });

  // Suppresses the echo from our own save, so a slow response can't revert a
  // reorder the user just made.
  const pendingWrite = useRef(false);

  useEffect(() => {
    let cancelled = false;
    fetchPreferences()
      .then(prefs => {
        if (cancelled || pendingWrite.current) return;
        const remote = prefs[prefKey];
        if (isValid(remote)) {
          setOrder(remote);
          try { localStorage.setItem(prefKey, JSON.stringify(remote)); } catch { /* cache only */ }
        }
      })
      .catch(() => { /* offline or logged out — the cached order still works */ });
    return () => { cancelled = true; };
  }, [prefKey, isValid]);

  const reorder = useCallback((from: T, to: T) => {
    if (from === to) return;
    setOrder(prev => {
      const next = [...prev];
      const fi = next.indexOf(from);
      const ti = next.indexOf(to);
      if (fi === -1 || ti === -1) return prev;
      next.splice(fi, 1);
      next.splice(ti, 0, from);

      try { localStorage.setItem(prefKey, JSON.stringify(next)); } catch { /* cache only */ }
      pendingWrite.current = true;
      savePreferences({ [prefKey]: next })
        .catch(() => { /* order still applies locally; retried on next change */ })
        .finally(() => { pendingWrite.current = false; });

      return next;
    });
  }, [prefKey]);

  /** Move a column one slot in either direction — the touch-friendly path. */
  const move = useCallback((col: T, direction: -1 | 1) => {
    setOrder(prev => {
      const i = prev.indexOf(col);
      const target = i + direction;
      if (i === -1 || target < 0 || target >= prev.length) return prev;
      reorder(col, prev[target]);
      return prev;
    });
  }, [reorder]);

  return { order, reorder, move };
}
