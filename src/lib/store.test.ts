import { describe, expect, it, vi } from "vitest";
import { ChecklistStore } from "./store";

describe("ChecklistStore", () => {
  it("initializes from markdown and serializes back", () => {
    const store = new ChecklistStore({ initial: "# A\n- [ ] b" });
    expect(store.getState().rows).toHaveLength(2);
    expect(store.toMarkdown()).toBe("# A\n- [ ] b");
  });

  it("notifies subscribers on state changes and swaps the snapshot", () => {
    const store = new ChecklistStore({ initial: "- [ ] b" });
    const before = store.getState();
    const listener = vi.fn();
    store.subscribe(listener);
    store.dispatch({ type: "toggleDone", id: before.rows[0].id });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getState()).not.toBe(before);
    expect(store.getState().rows[0]).toMatchObject({ done: true });
  });

  it("does not notify when the reducer returns the same state", () => {
    const store = new ChecklistStore({ initial: "- [ ] b" });
    const listener = vi.fn();
    store.subscribe(listener);
    // mergeBackward on the first row is a no-op by spec
    store.dispatch({ type: "mergeBackward", id: store.getState().rows[0].id });
    expect(listener).not.toHaveBeenCalled();
  });

  it("unsubscribes cleanly", () => {
    const store = new ChecklistStore({ initial: "- [ ] b" });
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    unsubscribe();
    store.dispatch({ type: "toggleDone", id: store.getState().rows[0].id });
    expect(listener).not.toHaveBeenCalled();
  });
});
