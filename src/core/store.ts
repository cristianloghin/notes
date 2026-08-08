import { createInitialState, reducer } from "./reducer";
import type { Action, GenId, Row, State } from "./types";

/**
 * Connects the store to the host's data layer. Called once at
 * construction with `push`; the host calls `push(rows)` for the initial
 * load and for every external update (e.g. realtime edits from another
 * device). May return a cleanup function, which `dispose()` calls.
 */
export type NoteSource = (push: (rows: Row[]) => void) => (() => void) | void;

/** Structural equality for external pushes, so echoes of state we already
    hold don't cause render churn or focus re-emission. */
function sameRows(a: Row[], b: Row[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const ra = a[i];
    const rb = b[i];
    if (ra.id !== rb.id || ra.type !== rb.type || ra.text !== rb.text) {
      return false;
    }
    if (ra.type === "item" && rb.type === "item" && ra.done !== rb.done) {
      return false;
    }
  }
  return true;
}

/**
 * The document as a plain external store facing two directions: edits flow
 * OUT to the host through `onRowsChange` listeners; external data flows IN
 * through `source`/`applyExternal`. React only observes (components
 * subscribe via useSyncExternalStore) — data arrival can never remount or
 * reset anything.
 *
 * External pushes are reconciled, not replaced-into: focus survives by row
 * id with the caret clamped to the new text length, and pushes notify
 * subscribers but never fire `onRowsChange` — "the user edited here" and
 * "the world changed elsewhere" are different events, and conflating them
 * creates echo loops through the host's persistence.
 *
 * Lifecycle: a store with a `source` owns a subscription — call
 * `dispose()` when the note session ends. Create the instance outside
 * React (or guard against StrictMode's double-invoked initializers) so a
 * discarded instance doesn't hold a live subscription.
 *
 * Dispatches from React discrete events (taps, keys) flush subscribers
 * synchronously within the event, so the focus contract (spec §6) holds
 * exactly as it did with component-owned state.
 */
export class NoteStore {
  private state: State;
  private listeners = new Set<() => void>();
  private rowsListeners = new Set<(rows: Row[]) => void>();
  private genId?: GenId;
  private teardown?: () => void;

  /** External-update primitive; also the `push` handed to `source`.
      Reconciles rather than replaces — see class docs. Never fires
      `onRowsChange`. Declared before the constructor so `source` can be
      invoked synchronously during construction. */
  applyExternal = (rows: Row[]): void => {
    const prev = this.state;
    // Normalize through the same invariant as initialization: a pushed
    // empty document becomes one empty item.
    const { rows: nextRows } = createInitialState(rows, this.genId);
    if (sameRows(prev.rows, nextRows)) return;
    let focus: State["focus"] = null;
    if (prev.focus) {
      const target = nextRows.find((r) => r.id === prev.focus?.id);
      if (target) {
        // Fresh model-origin object: the view re-applies the caret after
        // the re-render, clamped to the row's new text.
        focus = {
          id: target.id,
          offset: Math.min(prev.focus.offset, target.text.length),
        };
      }
    }
    this.state = { rows: nextRows, focus };
    for (const listener of [...this.listeners]) listener();
  };

  constructor(options?: {
    initial?: Row[] | string;
    /** Mints ids for all newly created rows (splits, pastes, parses) —
        inject to get host/DB-compatible ids. */
    genId?: GenId;
    /** Subscribe the store to the host's data layer; initial load and
        live updates arrive through the same push channel. */
    source?: NoteSource;
  }) {
    this.genId = options?.genId;
    this.state = createInitialState(options?.initial, this.genId);
    const cleanup = options?.source?.(this.applyExternal);
    if (cleanup) this.teardown = cleanup;
  }

  /** Stable identity — safe to pass to useSyncExternalStore directly. */
  getState = (): State => this.state;

  /** Stable identity — safe to pass to useSyncExternalStore directly. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Register a rows listener; returns an unsubscribe function. Fires
      after subscribers, only when rows actually changed, and only for
      edits made through this store — never for external pushes. */
  onRowsChange = (listener: (rows: Row[]) => void): (() => void) => {
    this.rowsListeners.add(listener);
    return () => {
      this.rowsListeners.delete(listener);
    };
  };

  dispatch = (action: Action): void => {
    const prev = this.state;
    const next = reducer(prev, action, this.genId);
    if (next === prev) return;
    this.state = next;
    for (const listener of [...this.listeners]) listener();
    if (next.rows !== prev.rows) {
      for (const listener of [...this.rowsListeners]) listener(next.rows);
    }
  };

  /** End the note session: tears down the source subscription and drops
      all listeners. Idempotent. */
  dispose = (): void => {
    this.teardown?.();
    this.teardown = undefined;
    this.listeners.clear();
    this.rowsListeners.clear();
  };
}
