import {
  createContext,
  useContext,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { ChecklistStore } from "./store";
import type { State } from "./types";

const ChecklistContext = createContext<ChecklistStore | null>(null);

/**
 * Provides a stable ChecklistStore instance to Editor, Toolbar, and any
 * custom component using the hooks below. Create the instance once
 * (module scope, or useState(() => new ChecklistStore(...))[0]) — the
 * provider does not create or own it.
 */
export function ChecklistProvider({
  checklist,
  children,
}: {
  checklist: ChecklistStore;
  children: ReactNode;
}) {
  return (
    <ChecklistContext.Provider value={checklist}>
      {children}
    </ChecklistContext.Provider>
  );
}

/** The store instance from context. Throws outside a ChecklistProvider. */
export function useChecklistStore(): ChecklistStore {
  const store = useContext(ChecklistContext);
  if (!store) {
    throw new Error(
      "useChecklistStore: no ChecklistProvider found above this component",
    );
  }
  return store;
}

/** Subscribe to the store's state; re-renders on every state change. */
export function useChecklistState(): State {
  const store = useChecklistStore();
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}
