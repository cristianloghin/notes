import {
  keyBetween,
  isValidKey,
  serializeDoc,
  type Action,
  type NoteDoc,
  type NotePatch,
  type Row,
  type RowId,
  type SerializeOptions,
} from "../../src";

/**
 * Row-grain adapter for the JSON storage shape — HOST code, the thing a
 * real backend would own (architecture.md §4a). Each edit becomes a
 * NotePatch: a standalone override that names only what changed and never
 * restates the note body.
 *
 * Derived from `onAction`, not from diffing two documents — the action
 * says what happened, so the patch can be minimal without a comparison
 * pass. Sort keys for inserted rows are minted between their neighbours,
 * which is the whole reason order lives in the rows.
 */

function docKey(doc: NoteDoc, id: RowId): string | null {
  const sort = doc.rows[id]?.sort;
  return isValidKey(sort) ? sort : null;
}

/**
 * Mint a sort key for every row of `nextRows` the document doesn't know
 * yet, each between whatever neighbours already have one. Consecutive new
 * rows chain, because a key minted here counts as known for the next.
 */
function keysForNewRows(nextRows: Row[], doc: NoteDoc): Record<RowId, string> {
  const minted: Record<RowId, string> = {};
  const keyOf = (id: RowId) => minted[id] ?? docKey(doc, id);

  nextRows.forEach((row, i) => {
    if (keyOf(row.id) !== null) return;
    let lower: string | null = null;
    for (let j = i - 1; j >= 0 && lower === null; j--) lower = keyOf(nextRows[j].id);
    let upper: string | null = null;
    for (let j = i + 1; j < nextRows.length && upper === null; j++) {
      upper = keyOf(nextRows[j].id);
    }
    minted[row.id] = keyBetween(lower, upper);
  });

  return minted;
}

/** Insert-shaped edits: new rows carry a minted key, the source row's
    text changed under them. */
function insertPatch(action: Action, prevRows: Row[], nextRows: Row[], doc: NoteDoc): NotePatch {
  const known = new Set(prevRows.map((r) => r.id));
  const minted = keysForNewRows(nextRows, doc);
  const rows: NonNullable<NotePatch["rows"]> = {};

  for (const row of nextRows) {
    if (known.has(row.id)) continue;
    rows[row.id] = { type: row.type, text: row.text, sort: minted[row.id] };
  }
  const source = nextRows.find((r) => r.id === action.id);
  if (source) rows[source.id] = { type: source.type, text: source.text };

  return { rows };
}

/**
 * Delete-shaped edits: the vanished rows go, and the survivor absorbed
 * their text.
 *
 * Under `tombstone` the row is marked, not removed, so a patch written
 * against it still lands. Under `drop` it is nulled outright — which is
 * only safe while nothing can reference it, and is what keeps a note being
 * drafted from accumulating ghosts for rows the user created and removed
 * in the same breath.
 */
function deletePatch(
  prevRows: Row[],
  nextRows: Row[],
  options?: SerializeOptions,
): NotePatch {
  const surviving = new Set(nextRows.map((r) => r.id));
  const rows: NonNullable<NotePatch["rows"]> = {};
  const deleted: Record<RowId, boolean> = {};

  for (const row of prevRows) {
    if (surviving.has(row.id)) continue;
    if (options?.deletes === "drop") rows[row.id] = null;
    else deleted[row.id] = true;
  }
  for (const row of nextRows) {
    const before = prevRows.find((r) => r.id === row.id);
    if (before && before.text !== row.text) rows[row.id] = { text: row.text };
  }

  const patch: NotePatch = {};
  if (Object.keys(rows).length > 0) patch.rows = rows;
  if (Object.keys(deleted).length > 0) patch.attrs = { deleted };
  return patch;
}

/** Last resort for an action this adapter doesn't model: restate every
    row and every checkbox. The one case that does clone the note. */
function fullPatch(
  nextRows: Row[],
  doc: NoteDoc,
  options?: SerializeOptions,
): NotePatch {
  const next = serializeDoc(nextRows, doc, options);
  const rows: NonNullable<NotePatch["rows"]> = {};
  const done: Record<RowId, boolean> = {};

  // Anything serializeDoc did not carry forward has to be nulled explicitly:
  // a merge patch that simply omits a key leaves the stored row in place.
  // Under `tombstone` this is a no-op, since removed rows are still there.
  for (const id of Object.keys(doc.rows)) if (!next.rows[id]) rows[id] = null;
  for (const [id, row] of Object.entries(next.rows)) rows[id] = row;
  for (const row of nextRows) if (row.type === "item") done[row.id] = row.done;

  return { rows, attrs: { done, deleted: next.attrs?.deleted ?? {} } };
}

export function actionToPatch(
  action: Action,
  prevRows: Row[],
  nextRows: Row[],
  doc: NoteDoc,
  options?: SerializeOptions,
): NotePatch {
  switch (action.type) {
    case "toggleDone": {
      const row = nextRows.find((r) => r.id === action.id);
      if (row?.type !== "item") break;
      // The entire override for ticking a box — row content untouched.
      return { attrs: { done: { [row.id]: row.done } } };
    }
    case "setText":
    case "promoteHeader":
    case "setRowType": {
      const row = nextRows.find((r) => r.id === action.id);
      if (!row) break;
      const patch: NotePatch = {
        rows: { [row.id]: { type: row.type, text: row.text } },
      };
      // The editor's model DROPS `done` when a row leaves 'item', so
      // storage must drop it too. An entry that outlived the item type
      // would resurrect a checkmark the editor already discarded — the
      // model is authoritative, storage never invents state
      // (architecture.md §4a rule 1).
      const stored = doc.attrs?.done?.[row.id] === true;
      const live = row.type === "item" && row.done;
      if (row.type !== "item" && doc.attrs?.done?.[row.id] !== undefined) {
        patch.attrs = { done: { [row.id]: null } };
      } else if (row.type === "item" && stored !== live) {
        patch.attrs = { done: { [row.id]: live } };
      }
      return patch;
    }
    case "split":
    case "pasteText":
      return insertPatch(action, prevRows, nextRows, doc);
    case "mergeBackward":
    case "remove":
      return deletePatch(prevRows, nextRows, options);
    case "move": {
      const at = nextRows.findIndex((r) => r.id === action.id);
      if (at < 0) break;
      const neighbour = (i: number) => {
        const row = nextRows[i];
        return row && row.id !== action.id ? docKey(doc, row.id) : null;
      };
      // One key changes; every other row keeps the one it has.
      return {
        rows: { [action.id]: { sort: keyBetween(neighbour(at - 1), neighbour(at + 1)) } },
      };
    }
  }
  return fullPatch(nextRows, doc, options);
}
