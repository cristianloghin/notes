import { describe, expect, it } from "vitest";
import { NoteStore } from "../../src";
import { plannerToRows, rowsToPlanner } from "./adapter";
import { SAMPLE_PLANNER } from "./data";

describe("plannerToRows", () => {
  it("synthesizes header rows at groupLabel boundaries", () => {
    const rows = plannerToRows(SAMPLE_PLANNER);
    expect(rows.map((r) => `${r.type}:${r.text}`)).toEqual([
      "item:Call the plumber",
      "header:Hardware",
      "item:screws",
      "item:hinges",
      "item:wood glue",
      "header:Paint",
      "item:primer",
      "item:rollers",
    ]);
    // item rows keep the Planner ids; done states carried over
    expect(rows[3]).toMatchObject({ id: "db-b3e7", done: true });
  });
});

describe("rowsToPlanner", () => {
  it("round-trips losslessly when nothing changed", () => {
    const rows = plannerToRows(SAMPLE_PLANNER);
    expect(rowsToPlanner(rows, SAMPLE_PLANNER)).toEqual(SAMPLE_PLANNER);
  });

  it("preserves metadata by id across edits and reorders", () => {
    const store = new NoteStore({
      initial: plannerToRows(SAMPLE_PLANNER),
      genId: () => `db-new-${Math.random().toString(36).slice(2, 6)}`,
    });
    // edit the title of the item that has a deadline and assignee
    store.dispatch({ type: "setText", id: "db-1a5c", text: "primer (white)" });
    // move "wood glue" from Hardware into Paint (above primer)
    const rows = store.getState().rows;
    const woodGlue = rows.findIndex((r) => r.id === "db-77d0");
    store.dispatch({ type: "move", id: "db-77d0", toIndex: woodGlue + 1 });

    const out = rowsToPlanner(store.getState().rows, SAMPLE_PLANNER);
    const primer = out.find((i) => i.id === "db-1a5c");
    expect(primer).toMatchObject({
      title: "primer (white)",
      personId: "cris",
      dueOn: "2026-08-15",
      createdAt: "2026-08-01T09:04:00Z",
    });
    const glue = out.find((i) => i.id === "db-77d0");
    expect(glue).toMatchObject({ groupLabel: "Paint" });
    // sortOrder rewritten as a clean sequence
    expect(out.map((i) => i.sortOrder)).toEqual(out.map((_, n) => n));
  });

  it("gives new editor rows host ids and default metadata", () => {
    const store = new NoteStore({
      initial: plannerToRows(SAMPLE_PLANNER),
      genId: () => "db-minted-1",
    });
    // split at the end of "screws" → new empty item in Hardware
    store.dispatch({ type: "split", id: "db-4c88", offset: 6 });
    store.dispatch({ type: "setText", id: "db-minted-1", text: "sandpaper" });

    const out = rowsToPlanner(store.getState().rows, SAMPLE_PLANNER);
    const minted = out.find((i) => i.id === "db-minted-1");
    expect(minted).toMatchObject({
      title: "sandpaper",
      done: false,
      groupLabel: "Hardware",
      personId: null,
      dueOn: null,
    });
  });

  it("saves paragraph rows as unchecked items (documented lossy case)", () => {
    const rows = plannerToRows(SAMPLE_PLANNER);
    const store = new NoteStore({
      initial: rows,
      genId: () => "db-para-1",
    });
    store.dispatch({ type: "split", id: "db-9f21", offset: 16 });
    store.dispatch({ type: "setRowType", id: "db-para-1", rowType: "text" });
    store.dispatch({ type: "setText", id: "db-para-1", text: "ask for a quote first" });

    const out = rowsToPlanner(store.getState().rows, SAMPLE_PLANNER);
    const para = out.find((i) => i.id === "db-para-1");
    expect(para).toMatchObject({ title: "ask for a quote first", done: false });
  });
});
