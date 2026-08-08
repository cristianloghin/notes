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

  describe("onAction — the edits-out seam", () => {
    it("fires with the action and both row snapshots when rows changed", () => {
      const store = new NoteStore({ initial: "- [ ] a" });
      const listener = vi.fn();
      store.onAction(listener);
      const id = store.getState().rows[0].id;
      const before = store.getState().rows;

      store.dispatch({ type: "toggleDone", id });
      expect(listener).toHaveBeenCalledTimes(1);
      const [action, prevRows, nextRows] = listener.mock.calls[0];
      expect(action).toEqual({ type: "toggleDone", id });
      expect(prevRows).toBe(before);
      expect(nextRows).toBe(store.getState().rows);
    });

    it("does not fire for caret-only actions or external pushes", () => {
      const store = new NoteStore({ initial: "- [ ] ab" });
      const listener = vi.fn();
      store.onAction(listener);
      const id = store.getState().rows[0].id;
      store.dispatch({ type: "focusRow", id, offset: 1 });
      store.applyExternal([
        { id: "x9", type: "item", text: "pushed", done: false },
      ]);
      expect(listener).not.toHaveBeenCalled();
    });

    it("fires after subscribers", () => {
      const order: string[] = [];
      const store = new NoteStore({ initial: "- [ ] a" });
      store.subscribe(() => order.push("subscriber"));
      store.onAction(() => order.push("action"));
      store.dispatch({ type: "toggleDone", id: store.getState().rows[0].id });
      expect(order).toEqual(["subscriber", "action"]);
    });

    it("returns an unsubscribe function", () => {
      const store = new NoteStore({ initial: "- [ ] a" });
      const listener = vi.fn();
      const unsubscribe = store.onAction(listener);
      unsubscribe();
      store.dispatch({ type: "toggleDone", id: store.getState().rows[0].id });
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("connect / applyExternal — the data-in channel", () => {
    it("loads initial data through the connected source's push", () => {
      const store = new NoteStore();
      store.connect((push) => {
        push([{ id: "x1", type: "item", text: "from host", done: false }]);
      });
      expect(store.getState().rows).toEqual([
        { id: "x1", type: "item", text: "from host", done: false },
      ]);
    });

    it("applyExternal notifies subscribers but never action listeners", () => {
      const store = new NoteStore({ initial: "- [ ] a" });
      const subscriber = vi.fn();
      const actionListener = vi.fn();
      store.subscribe(subscriber);
      store.onAction(actionListener);
      store.applyExternal([
        { id: "x1", type: "item", text: "pushed", done: true },
      ]);
      expect(subscriber).toHaveBeenCalledTimes(1);
      expect(actionListener).not.toHaveBeenCalled();
    });

    it("ignores echo pushes that equal current rows", () => {
      const store = new NoteStore({ initial: "- [x] a\n- [ ] b" });
      const subscriber = vi.fn();
      store.subscribe(subscriber);
      const echo = store.getState().rows.map((r) => ({ ...r }));
      store.applyExternal(echo);
      expect(subscriber).not.toHaveBeenCalled();
    });

    it("disconnect runs the source cleanup; dispose runs outstanding ones", () => {
      const cleanupA = vi.fn();
      const cleanupB = vi.fn();
      const store = new NoteStore();
      const disconnectA = store.connect(() => cleanupA);
      store.connect(() => cleanupB);

      disconnectA();
      expect(cleanupA).toHaveBeenCalledTimes(1);
      expect(cleanupB).not.toHaveBeenCalled();

      store.dispose();
      store.dispose();
      expect(cleanupA).toHaveBeenCalledTimes(1); // not re-run
      expect(cleanupB).toHaveBeenCalledTimes(1);
      expect(store.isDisposed()).toBe(true);
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
