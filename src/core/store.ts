import { createInitialState, reducer } from "./reducer";
import type { Action, GenId, Row, State } from "./types";

/**
 * The document as a plain external store: state lives here, not in React.
 * Components subscribe via useSyncExternalStore (see react/context.tsx)
 * and read whatever slice they need — nothing is threaded through props.
 *
 * `onRowsChange` is the integration seam for consumer applications:
 * registered listeners fire after subscribers, and only when the rows
 * themselves changed — never for caret/focus-only updates — so it is safe
 * to persist from directly. Serialization is the host's call:
 * `serialize(store.getState().rows)` for string-grain hosts.
 *
 * Dispatches from React discrete events (taps, keys) still flush
 * subscribers synchronously within the event, so the focus contract
 * (spec §6) holds exactly as it did with component-owned state.
 */
export class NoteStore {
  private state: State;
  private listeners = new Set<() => void>();
  private rowsListeners = new Set<(rows: Row[]) => void>();
  private genId?: GenId;

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

  /** Register a rows listener; returns an unsubscribe function. Fires
      after subscribers, and only when rows actually changed. */
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
}
