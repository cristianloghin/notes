import { describe, expect, it } from "vitest";
import {
  mergeDoc,
  NoteStore,
  parseDoc,
  serializeDoc,
  type NoteDoc,
  type NotePatch,
  type Row,
} from "../../src";
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
function host() {
  minted = 0;
  const store = new NoteStore({
    initial: ROWS,
    genId: () => `new-${++minted}`,
  });
  let doc: NoteDoc = serializeDoc(ROWS);
  const patches: NotePatch[] = [];

  store.onAction((action, prevRows, nextRows) => {
    const patch = actionToPatch(action, prevRows, nextRows, doc);
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

  it("nulls a removed row and carries the merged text to the survivor", () => {
    const h = host();
    h.store.dispatch({ type: "mergeBackward", id: "i2" });
    expect(h.patches[0].rows?.i2).toBeNull();
    expect(h.doc.rows).not.toHaveProperty("i2");
    expect(h.doc.rows.i1.text).toBe("screwshinges");
    h.sync();
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
