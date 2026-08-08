import { describe, expect, it, vi } from "vitest";
import { NoteStore } from "./store";

describe("NoteStore", () => {
  it("initializes from markdown and serializes back", () => {
    const store = new NoteStore({ initial: "# A\n- [ ] b" });
    expect(store.getState().rows).toHaveLength(2);
    expect(store.toMarkdown()).toBe("# A\n- [ ] b");
  });

  it("notifies subscribers on state changes and swaps the snapshot", () => {
    const store = new NoteStore({ initial: "- [ ] b" });
    const before = store.getState();
    const listener = vi.fn();
    store.subscribe(listener);
    store.dispatch({ type: "toggleDone", id: before.rows[0].id });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getState()).not.toBe(before);
    expect(store.getState().rows[0]).toMatchObject({ done: true });
  });

  it("does not notify when the reducer returns the same state", () => {
    const store = new NoteStore({ initial: "- [ ] b" });
    const listener = vi.fn();
    store.subscribe(listener);
    // mergeBackward on the first row is a no-op by spec
    store.dispatch({ type: "mergeBackward", id: store.getState().rows[0].id });
    expect(listener).not.toHaveBeenCalled();
  });

  it("unsubscribes cleanly", () => {
    const store = new NoteStore({ initial: "- [ ] b" });
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    unsubscribe();
    store.dispatch({ type: "toggleDone", id: store.getState().rows[0].id });
    expect(listener).not.toHaveBeenCalled();
  });

  it("calls onRowsChange when rows change, after subscribers", () => {
    const order: string[] = [];
    const onRowsChange = vi.fn(() => order.push("rows"));
    const store = new NoteStore({ initial: "- [ ] b", onRowsChange });
    store.subscribe(() => order.push("subscriber"));
    const id = store.getState().rows[0].id;

    store.dispatch({ type: "setText", id, text: "bb", caret: 2 });
    expect(onRowsChange).toHaveBeenCalledTimes(1);
    expect(onRowsChange).toHaveBeenCalledWith(store.getState().rows);
    expect(order).toEqual(["subscriber", "rows"]);

    store.dispatch({ type: "toggleDone", id });
    expect(onRowsChange).toHaveBeenCalledTimes(2);
  });

  it("does not call onRowsChange for caret-only updates", () => {
    const onRowsChange = vi.fn();
    const store = new NoteStore({ initial: "- [ ] bb", onRowsChange });
    const id = store.getState().rows[0].id;
    store.dispatch({ type: "focusRow", id, offset: 1 });
    store.dispatch({ type: "focusRow", id, offset: 2, origin: "dom" });
    expect(onRowsChange).not.toHaveBeenCalled();
  });
});
