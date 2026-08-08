import {
  createContext,
  useContext,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { NoteStore } from "./store";
import type { State } from "./types";

const NoteContext = createContext<NoteStore | null>(null);

/**
 * Provides a stable NoteStore instance to Editor, Toolbar, and any custom
 * component using the hooks below. Create the instance once (module scope,
 * or useState(() => new NoteStore(...))[0]) — the provider does not create
 * or own it.
 */
export function NoteProvider({
  store,
  children,
}: {
  store: NoteStore;
  children: ReactNode;
}) {
  return <NoteContext.Provider value={store}>{children}</NoteContext.Provider>;
}

/** The store instance from context. Throws outside a NoteProvider. */
export function useNoteStore(): NoteStore {
  const store = useContext(NoteContext);
  if (!store) {
    throw new Error("useNoteStore: no NoteProvider found above this component");
  }
  return store;
}

/** Subscribe to the store's state; re-renders on every state change. */
export function useNoteState(): State {
  const store = useNoteStore();
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}
