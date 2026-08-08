import { serialize } from "./markdown";
import { createInitialState, reducer } from "./reducer";
import type { Action, Row, State } from "./types";

/**
 * The document as a plain external store: state lives here, not in React.
 * Components subscribe via useSyncExternalStore (see context.tsx) and read
 * whatever slice they need — nothing is threaded through props.
 *
 * Dispatches from React discrete events (taps, keys) still flush
 * subscribers synchronously within the event, so the focus contract
 * (spec §6) holds exactly as it did with component-owned state.
 */
export class ChecklistStore {
  private state: State;
  private listeners = new Set<() => void>();

  constructor(options?: { initial?: Row[] | string }) {
    this.state = createInitialState(options?.initial);
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
    const next = reducer(this.state, action);
    if (next === this.state) return;
    this.state = next;
    for (const listener of [...this.listeners]) listener();
  };

  toMarkdown = (): string => serialize(this.state.rows);
}
