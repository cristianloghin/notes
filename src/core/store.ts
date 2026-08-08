import { serialize } from "./markdown";
import { createInitialState, reducer } from "./reducer";
import type { Action, Row, State } from "./types";

/**
 * The document as a plain external store: state lives here, not in React.
 * Components subscribe via useSyncExternalStore (see context.tsx) and read
 * whatever slice they need — nothing is threaded through props.
 *
 * `onRowsChange` is the integration seam for consumer applications: it
 * fires after subscribers, and only when the rows themselves changed —
 * never for caret/focus-only updates — so it is safe to persist from
 * directly.
 *
 * Dispatches from React discrete events (taps, keys) still flush
 * subscribers synchronously within the event, so the focus contract
 * (spec §6) holds exactly as it did with component-owned state.
 */
export class NoteStore {
  private state: State;
  private listeners = new Set<() => void>();
  private onRowsChange?: (rows: Row[]) => void;

  constructor(options?: {
    initial?: Row[] | string;
    /** Called after every change to the rows (content, structure, order,
        done states) — not for caret-only updates. */
    onRowsChange?: (rows: Row[]) => void;
  }) {
    this.state = createInitialState(options?.initial);
    this.onRowsChange = options?.onRowsChange;
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

  dispatch = (action: Action): void => {
    const prev = this.state;
    const next = reducer(prev, action);
    if (next === prev) return;
    this.state = next;
    for (const listener of [...this.listeners]) listener();
    if (next.rows !== prev.rows) this.onRowsChange?.(next.rows);
  };

  toMarkdown = (): string => serialize(this.state.rows);
}
