import { useEffect, useRef, useState } from "react";
import { NoteStore } from "../core/store";
import type { Action, GenId, Row } from "../core/types";

/**
 * Constructs a NoteStore whose lifetime is the owning component's: created
 * once, `dispose()`d on unmount (StrictMode's mount–unmount–remount cycle
 * is handled — the store is recreated if the dev-only cleanup disposed
 * it). Options are captured at creation; later changes are ignored.
 */
export function useNoteStore(options?: {
  initial?: Row[] | string;
  genId?: GenId;
}): NoteStore {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const [store, setStore] = useState(() => new NoteStore(optionsRef.current));
  const storeRef = useRef(store);
  storeRef.current = store;
  useEffect(() => {
    let active = storeRef.current;
    if (active.isDisposed()) {
      active = new NoteStore(optionsRef.current);
      setStore(active);
    }
    return () => active.dispose();
  }, []);
  return store;
}

/**
 * PERSISTENCE seam, not a view feed: maps edit-driven rows changes into
 * client-shaped React state — the rows-only projection of the store's
 * `onAction`. Fires for edits made through the store, never for
 * caret-only updates or external pushes; a *view* of the document
 * (which must also reflect pushes) derives from `useNote().state`
 * instead. The mapper receives the rows and the previous mapped value
 * (for adapters that preserve client-side data across saves).
 */
export function useOnRowsChange<T>(
  store: NoteStore,
  map: (rows: Row[], previous: T) => T,
  initial: T | (() => T),
): T {
  const mapRef = useRef(map);
  mapRef.current = map;
  const [value, setValue] = useState<T>(initial);
  useEffect(
    () =>
      store.onAction((_action, _prevRows, nextRows) =>
        setValue((previous) => mapRef.current(nextRows, previous)),
      ),
    [store],
  );
  return value;
}

/**
 * React binding for the store's `onAction` seam: folds each row-changing
 * action into React state. The reducer receives the previous value, the
 * dispatched action, and both row snapshots. External pushes and
 * caret-only actions never fire.
 */
export function useOnAction<T>(
  store: NoteStore,
  reduce: (previous: T, action: Action, prevRows: Row[], nextRows: Row[]) => T,
  initial: T | (() => T),
): T {
  const reduceRef = useRef(reduce);
  reduceRef.current = reduce;
  const [value, setValue] = useState<T>(initial);
  useEffect(
    () =>
      store.onAction((action, prevRows, nextRows) =>
        setValue((previous) =>
          reduceRef.current(previous, action, prevRows, nextRows),
        ),
      ),
    [store],
  );
  return value;
}
