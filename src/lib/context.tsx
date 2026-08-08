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

/**
 * The one hook: the store from context (for dispatching) plus its state,
 * subscribed — the component re-renders on every state change. Throws
 * outside a NoteProvider.
 */
export function useNote(): { store: NoteStore; state: State } {
  const store = useContext(NoteContext);
  if (!store) {
    throw new Error("useNote: no NoteProvider found above this component");
  }
  const state = useSyncExternalStore(
    store.subscribe,
    store.getState,
    store.getState,
  );
  return { store, state };
}
