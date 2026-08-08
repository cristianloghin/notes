import { describe, expect, it, vi } from "vitest";
import { serialize } from "./markdown";
import { NoteStore } from "./store";

describe("NoteStore", () => {
  it("initializes from markdown; rows serialize back losslessly", () => {
    const store = new NoteStore({ initial: "# A\n- [ ] b" });
    expect(store.getState().rows).toHaveLength(2);
    expect(serialize(store.getState().rows)).toBe("# A\n- [ ] b");
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

  describe("onRowsChange", () => {
    it("fires registered listeners on rows changes, after subscribers", () => {
      const order: string[] = [];
      const store = new NoteStore({ initial: "- [ ] b" });
      store.subscribe(() => order.push("subscriber"));
      const rowsListener = vi.fn(() => order.push("rows"));
      store.onRowsChange(rowsListener);
      const id = store.getState().rows[0].id;

      store.dispatch({ type: "setText", id, text: "bb", caret: 2 });
      expect(rowsListener).toHaveBeenCalledTimes(1);
      expect(rowsListener).toHaveBeenCalledWith(store.getState().rows);
      expect(order).toEqual(["subscriber", "rows"]);
    });

    it("does not fire for caret-only updates", () => {
      const store = new NoteStore({ initial: "- [ ] bb" });
      const rowsListener = vi.fn();
      store.onRowsChange(rowsListener);
      const id = store.getState().rows[0].id;
      store.dispatch({ type: "focusRow", id, offset: 1 });
      store.dispatch({ type: "focusRow", id, offset: 2, origin: "dom" });
      expect(rowsListener).not.toHaveBeenCalled();
    });

    it("returns an unsubscribe function", () => {
      const store = new NoteStore({ initial: "- [ ] b" });
      const rowsListener = vi.fn();
      const unsubscribe = store.onRowsChange(rowsListener);
      unsubscribe();
      store.dispatch({ type: "toggleDone", id: store.getState().rows[0].id });
      expect(rowsListener).not.toHaveBeenCalled();
    });
  });

  describe("injected genId", () => {
    it("mints every new row id through the host factory — splits AND pastes", () => {
      let n = 0;
      const store = new NoteStore({
        initial: "- [ ] a",
        genId: () => `host-${++n}`,
      });
      // initial parse uses the factory
      expect(store.getState().rows[0].id).toBe("host-1");

      // split mints through the factory
      store.dispatch({ type: "split", id: "host-1", offset: 1 });
      expect(store.getState().rows[1].id).toBe("host-2");

      // paste (the previously blocked path: parseMarkdown inside pasteText)
      store.dispatch({
        type: "pasteText",
        id: "host-2",
        offset: 0,
        text: "x\n# Y\n- [x] z",
      });
      const ids = store.getState().rows.map((r) => r.id);
      for (const id of ids) {
        expect(id).toMatch(/^host-\d+$/);
      }
    });
  });
});
