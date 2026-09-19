import { describe, expect, it } from "vitest";
import { mergeDoc, parseDoc, serializeDoc } from "./doc";
import type { NoteDoc, NotePatch, SerializeOptions } from "./doc";
import { NoteStore } from "./store";
import type { Row } from "./types";
import { actionToPatch } from "./patch";

const ROWS: Row[] = [
  { id: "h1", type: "header", text: "Hardware" },
  { id: "i1", type: "item", text: "screws", done: false },
  { id: "i2", type: "item", text: "hinges", done: true },
  { id: "i3", type: "item", text: "glue", done: false },
];

let minted = 0;

/**
 * A host that persists by merging patches only — never re-serializing.
 * `sync()` is the property every test asserts: replaying the patch stream
 * into the stored document reproduces the editor exactly.
 */
function host(options?: SerializeOptions) {
  minted = 0;
  const store = new NoteStore({
    initial: ROWS,
    genId: () => `new-${++minted}`,
  });
  let doc: NoteDoc = serializeDoc(ROWS);
  const patches: NotePatch[] = [];

  store.onAction((action, prevRows, nextRows) => {
    const patch = actionToPatch(action, prevRows, nextRows, doc, options);
    patches.push(patch);
    doc = mergeDoc(doc, patch);
  });

  return {
    store,
    patches,
    get doc() {
      return doc;
    },
    sync: () => expect(parseDoc(doc)).toEqual(store.getState().rows),
  };
}

describe("actionToPatch", () => {
  it("reduces a toggle to one attr entry, naming no row content", () => {
    const h = host();
    h.store.dispatch({ type: "toggleDone", id: "i1" });
    expect(h.patches[0]).toEqual({ attrs: { done: { i1: true } } });
    h.sync();
  });

  it("unchecks with an explicit false rather than a deletion", () => {
    const h = host();
    h.store.dispatch({ type: "toggleDone", id: "i2" });
    expect(h.patches[0]).toEqual({ attrs: { done: { i2: false } } });
    h.sync();
  });

  it("inserts a row with a minted key and leaves its neighbours alone", () => {
    const h = host();
    const before = h.doc;
    h.store.dispatch({ type: "split", id: "i1", offset: 6 });

    const inserted = h.doc.rows["new-1"];
    expect(inserted.sort > before.rows.i1.sort).toBe(true);
    expect(inserted.sort < before.rows.i2.sort).toBe(true);
    for (const id of ["h1", "i1", "i2", "i3"]) {
      expect(h.doc.rows[id].sort).toBe(before.rows[id].sort);
    }
    h.sync();
  });

  it("splits mid-text: new row carries the tail, source keeps the head", () => {
    const h = host();
    h.store.dispatch({ type: "split", id: "i1", offset: 3 });
    expect(h.doc.rows["i1"].text).toBe("scr");
    expect(h.doc.rows["new-1"].text).toBe("ews");
    h.sync();
  });

  it("chains keys for a multi-row paste without touching neighbours", () => {
    const h = host();
    const before = h.doc;
    h.store.dispatch({
      type: "pasteText",
      id: "i1",
      offset: 6,
      text: "one\ntwo\nthree",
    });

    const added = Object.keys(h.doc.rows).filter((id) => !before.rows[id]);
    expect(added.length).toBeGreaterThan(1);
    const keys = added.map((id) => h.doc.rows[id].sort);
    expect([...keys].sort()).toEqual(keys);
    expect(h.doc.rows.i2.sort).toBe(before.rows.i2.sort);
    h.sync();
  });

  it("tombstones a removed row and carries its text to the survivor", () => {
    const h = host();
    h.store.dispatch({ type: "mergeBackward", id: "i2" });

    expect(h.patches[0].attrs?.deleted).toEqual({ i2: true });
    expect(h.patches[0].rows).not.toHaveProperty("i2");
    // The row stays in the document so later patches still land on it.
    expect(h.doc.rows.i2).toBeDefined();
    expect(h.doc.attrs?.deleted?.i2).toBe(true);
    expect(h.doc.rows.i1.text).toBe("screwshinges");
    h.sync();
  });

  it("does not resurrect a tombstoned row when a stale patch edits it", () => {
    const h = host();
    h.store.dispatch({ type: "remove", id: "i2" });

    // A patch from an occurrence that still thought i2 was alive.
    const stale = mergeDoc(h.doc, { rows: { i2: { text: "brass hinges" } } });
    expect(parseDoc(stale).map((r) => r.id)).toEqual(["h1", "i1", "i3"]);
    expect(stale.rows.i2.text).toBe("brass hinges");
  });

  it("rewrites exactly one key on a move", () => {
    const h = host();
    const before = h.doc;
    h.store.dispatch({ type: "move", id: "i3", toIndex: 1 });

    const changed = Object.keys(h.doc.rows).filter(
      (id) => h.doc.rows[id].sort !== before.rows[id].sort,
    );
    expect(changed).toEqual(["i3"]);
    h.sync();
  });

  it("clears done when a row leaves 'item' — storage never resurrects it", () => {
    const h = host();
    h.store.dispatch({ type: "toggleDone", id: "i1" });
    h.store.dispatch({ type: "setRowType", id: "i1", rowType: "text" });
    expect(h.doc.attrs?.done).not.toHaveProperty("i1");
    expect(parseDoc(h.doc)[1]).toEqual({ id: "i1", type: "text", text: "screws" });
    h.sync();

    // The reducer mints a fresh unchecked item; storage agrees.
    h.store.dispatch({ type: "setRowType", id: "i1", rowType: "item" });
    expect(parseDoc(h.doc)[1]).toMatchObject({ type: "item", done: false });
    h.sync();
  });

  it("stays in sync across a long mixed edit session", () => {
    const h = host();
    h.store.dispatch({ type: "split", id: "i1", offset: 3 });
    h.store.dispatch({ type: "setText", id: "new-1", text: "ews and bolts" });
    h.store.dispatch({ type: "toggleDone", id: "i2" });
    h.store.dispatch({ type: "move", id: "i3", toIndex: 0 });
    h.store.dispatch({ type: "promoteHeader", id: "i1", text: "Fixings", caret: 7 });
    h.store.dispatch({ type: "pasteText", id: "i2", offset: 0, text: "a\nb" });
    h.store.dispatch({ type: "mergeBackward", id: "new-1" });
    h.store.dispatch({ type: "remove", id: "h1" });
    h.sync();
  });

  it("never fires for an external push — pushes-in are not edits-out", () => {
    const h = host();
    const before = h.doc;
    h.store.applyExternal([{ id: "i1", type: "item", text: "solo", done: true }]);
    expect(h.patches).toHaveLength(0);
    expect(h.doc).toBe(before);
  });
});

describe("actionToPatch with deletes: drop", () => {
  const drop: SerializeOptions = { deletes: "drop" };

  it("nulls the row instead of tombstoning it", () => {
    const h = host(drop);
    h.store.dispatch({ type: "remove", id: "i2" });

    expect(h.patches[0].rows?.i2).toBeNull();
    expect(h.patches[0].attrs).toBeUndefined();
    expect(h.doc.rows).not.toHaveProperty("i2");
    expect(h.doc.attrs?.deleted).toBeUndefined();
    h.sync();
  });

  it("leaves no ghosts behind while a note is being drafted", () => {
    const h = host(drop);
    // The "press Enter, change your mind" rhythm, five times over.
    for (let i = 0; i < 5; i++) {
      const rows = h.store.getState().rows;
      const last = rows[rows.length - 1];
      h.store.dispatch({ type: "split", id: last.id, offset: last.text.length });
      const grown = h.store.getState().rows;
      h.store.dispatch({ type: "mergeBackward", id: grown[grown.length - 1].id });
    }
    expect(Object.keys(h.doc.rows)).toHaveLength(ROWS.length);
    expect(h.doc.attrs?.deleted).toBeUndefined();
    h.sync();
  });

  it("still tombstones by default, so the safe path needs no opting in", () => {
    const h = host();
    h.store.dispatch({ type: "remove", id: "i2" });
    expect(h.doc.attrs?.deleted).toEqual({ i2: true });
    h.sync();
  });
});
