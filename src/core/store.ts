import { applyExternalRows, createInitialState, reducer } from "./reducer";
import type { Action, GenId, Row, State } from "./types";

/**
 * Connects the store to a host data feed. Invoked with `push` (the
 * store's `applyExternal`); the host calls it for initial data and for
 * every external update (e.g. realtime edits from another device). May
 * return a cleanup function, run on disconnect or `dispose()`.
 */
export type NoteSource = (push: (rows: Row[]) => void) => (() => void) | void;

/**
 * The document as a plain external store facing two directions: edits
 * flow OUT through `onAction` listeners — the single edits-out seam —
 * and external data flows IN through `connect`/`applyExternal`. React
 * only observes (components subscribe via useSyncExternalStore), so data
 * arrival can never remount or reset anything.
 *
 * External pushes are reconciled in core (`applyExternalRows`): focus
 * survives by row id with the caret clamped, echo pushes are ignored,
 * and pushes notify subscribers but never fire `onAction` — "the user
 * edited here" and "the world changed elsewhere" are different events,
 * and conflating them creates echo loops through the host's persistence.
 *
 * Lifecycle: `dispose()` runs all outstanding connection cleanups and
 * drops listeners. React consumers should obtain instances through
 * `useNoteStore(options)`, which constructs and disposes with the owning
 * component.
 *
 * Dispatches from React discrete events (taps, keys) flush subscribers
 * synchronously within the event, so the focus contract (spec §6) holds
 * exactly as it did with component-owned state.
 */
export class NoteStore {
  private state: State;
  private listeners = new Set<() => void>();
  private actionListeners = new Set<
    (action: Action, prevRows: Row[], nextRows: Row[]) => void
  >();
  private connections = new Set<() => void>();
  private genId?: GenId;
  private disposed = false;

  constructor(options?: {
    initial?: Row[] | string;
    /** Mints ids for all newly created rows (splits, pastes, parses) —
        inject to get host/DB-compatible ids. */
    genId?: GenId;
  }) {
    this.genId = options?.genId;
    this.state = createInitialState(options?.initial, this.genId);
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

  /** The edits-out seam. Registers a listener fired for every dispatched
      action that changed the rows, with the action and both row
      snapshots; returns an unsubscribe function. Never fires for
      caret-only actions or external pushes. Listeners receive the action
      as dispatched (internal delegation is not exposed). Rows-only
      consumers can ignore the first two arguments — or use the
      `useOnRowsChange` React projection. */
  onAction = (
    listener: (action: Action, prevRows: Row[], nextRows: Row[]) => void,
  ): (() => void) => {
    this.actionListeners.add(listener);
    return () => {
      this.actionListeners.delete(listener);
    };
  };

  /** External-update primitive: reconcile host rows into state (see
      `applyExternalRows` in core). Notifies subscribers; never fires
      `onAction`. */
  applyExternal = (rows: Row[]): void => {
    const prev = this.state;
    const next = applyExternalRows(prev, rows, this.genId);
    if (next === prev) return;
    this.state = next;
    for (const listener of [...this.listeners]) listener();
  };

  /** Register a host data feed; returns a disconnect function. The
      source receives `applyExternal` as its push. Outstanding
      connections are cleaned up by `dispose()`. */
  connect = (source: NoteSource): (() => void) => {
    const cleanup = source(this.applyExternal);
    const disconnect = () => {
      this.connections.delete(disconnect);
      cleanup?.();
    };
    this.connections.add(disconnect);
    return disconnect;
  };

  dispatch = (action: Action): void => {
    const prev = this.state;
    const next = reducer(prev, action, this.genId);
    if (next === prev) return;
    this.state = next;
    for (const listener of [...this.listeners]) listener();
    if (next.rows !== prev.rows) {
      for (const listener of [...this.actionListeners]) {
        listener(action, prev.rows, next.rows);
      }
    }
  };

  isDisposed = (): boolean => this.disposed;

  /** End the note session: disconnects all sources and drops all
      listeners. Idempotent. */
  dispose = (): void => {
    this.disposed = true;
    for (const disconnect of [...this.connections]) disconnect();
    this.listeners.clear();
    this.actionListeners.clear();
  };
}
