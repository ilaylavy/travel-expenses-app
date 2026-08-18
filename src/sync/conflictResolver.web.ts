// Web build of the conflictResolver module. Web has no local SQLite, so
// the SQLite-write helpers from the native variant (applyRemote, applyTrip,
// applyExpense, …) don't exist here. The realtime subscription module on
// web just calls refreshStores directly when an event arrives — Zustand
// stores re-fetch from Supabase, no local row mutation needed.

import { formatError } from './errorUtils';

let refreshTimer: ReturnType<typeof setTimeout> | null = null;

async function doRefreshStores(): Promise<void> {
  try {
    const { useTripStore } = await import('@/stores/tripStore');
    await useTripStore.getState().refresh();
  } catch (e) {
    console.warn(`sync: failed to refresh tripStore: ${formatError(e)}`);
  }
  try {
    const { useCategoryStore } = await import('@/stores/categoryStore');
    await useCategoryStore.getState().refresh();
  } catch (e) {
    console.warn(`sync: failed to refresh categoryStore: ${formatError(e)}`);
  }
  try {
    const { useExpenseStore } = await import('@/stores/expenseStore');
    const state = useExpenseStore.getState();
    if (state.activeTripId) await state.refresh();
  } catch (e) {
    console.warn(`sync: failed to refresh expenseStore: ${formatError(e)}`);
  }
  try {
    const { useSettlementStore } = await import('@/stores/settlementStore');
    const state = useSettlementStore.getState();
    if (state.activeTripId) await state.refresh();
  } catch (e) {
    console.warn(`sync: failed to refresh settlementStore: ${formatError(e)}`);
  }
}

export async function refreshStores(): Promise<void> {
  await doRefreshStores();
}

export function refreshStoresDebounced(delayMs = 150): void {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    void doRefreshStores();
  }, delayMs);
}
