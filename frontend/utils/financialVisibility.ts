export const FINANCIAL_VISIBILITY_KEY = 'financial_numbers_visible';

export interface FinancialVisibilityState {
  visible: boolean;
  ready: boolean;
  saving: boolean;
  error: string;
}

// Start masked until the account preference is known; never reuse another
// account's browser cache. Each authenticated workspace owns its own store.
export const initialVisibilityState: FinancialVisibilityState = {
  visible: false, ready: false, saving: false, error: '',
};

export function createFinancialVisibility(
  read: () => Promise<boolean>,
  write: (visible: boolean) => Promise<void>,
) {
  let state = initialVisibilityState;
  let generation = 0;
  let dirty = false;
  let pending: Promise<void> | null = null;
  const listeners = new Set<() => void>();
  const update = (patch: Partial<FinancialVisibilityState>) => {
    state = { ...state, ...patch };
    listeners.forEach(listener => listener());
  };
  const load = async () => {
    const request = ++generation;
    update({ ready: false, visible: false, error: '' });
    try {
      const visible = await read();
      if (request === generation) { dirty = false; update({ visible, ready: true }); }
    } catch {
      if (request === generation) update({ error: 'Could not load your visibility preference. Figures remain hidden. Please retry.' });
    }
  };
  const persist = (): Promise<void> => {
    if (pending) return pending;
    update({ saving: true, error: '' });
    pending = (async () => {
      try {
        await write(state.visible);
        dirty = false;
      } catch {
        update({ error: 'Your visibility choice applies here, but could not be saved for your next login. Please retry.' });
        throw new Error('Could not save your visibility preference.');
      } finally {
        pending = null;
        update({ saving: false });
      }
    })();
    return pending;
  };
  const setVisible = async (visible: boolean) => {
    if (!state.ready || pending) return;
    dirty = true;
    update({ visible });
    await persist();
  };
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    load,
    setVisible,
    toggle: () => setVisible(!state.visible),
    retry: () => state.ready ? persist() : load(),
    // Finish or retry the final choice when the session ends.
    flush: async () => { if (pending) await pending; else if (dirty) await persist(); },
  };
}
