import { useEffect, useState, useSyncExternalStore } from 'react';
import { fetchFinancialVisibility, saveFinancialVisibility } from '../services/apiService';
import { createFinancialVisibility, initialVisibilityState } from '../utils/financialVisibility';

export default function useFinancialVisibility() {
  const [store] = useState(() => createFinancialVisibility(fetchFinancialVisibility, saveFinancialVisibility));
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, () => initialVisibilityState);
  useEffect(() => { void store.load(); }, [store]);
  return {
    ...state,
    setVisible: (visible: boolean) => { void store.setVisible(visible).catch(() => {}); },
    retry: () => { void store.retry().catch(() => {}); },
    flush: store.flush,
  };
}

export type FinancialVisibility = ReturnType<typeof useFinancialVisibility>;
