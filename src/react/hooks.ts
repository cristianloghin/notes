import { useEffect, useRef, useState } from "react";
import type { NoteStore } from "../core/store";
import type { Action, Row } from "../core/types";

/**
 * React binding for the store's `onRowsChange` seam: maps edit-driven rows
 * changes into client-shaped React state. The mapper receives the rows and
 * the previous mapped value (for adapters that preserve client-side data
 * across saves). Seeded eagerly from the store's current rows with
 * `previous` undefined.
 *
 * Same semantics as the seam itself: fires for edits made through the
 * store, never for caret-only updates or external pushes. For a plain
 * derived view of the document (including pushes), derive from
 * `useNote().state` instead.
 */
export function useOnRowsChange<T>(
  store: NoteStore,
  map: (rows: Row[], previous: T | undefined) => T,
): T {
  const mapRef = useRef(map);
  mapRef.current = map;
  const [value, setValue] = useState<T>(() =>
    map(store.getState().rows, undefined),
  );
  useEffect(
    () =>
      store.onRowsChange((rows) =>
        setValue((previous) => mapRef.current(rows, previous)),
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
