import { useEffect, RefObject } from 'react';

export function useClickOutside(
  refs: RefObject<HTMLElement | null>[],
  setters: ((open: boolean) => void)[],
) {
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      refs.forEach((ref, i) => {
        if (ref.current && !ref.current.contains(e.target as Node)) {
          setters[i](false);
        }
      });
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
}
