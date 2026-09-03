import { isValidKey, keysBetween } from './sortkey';
import type { Row, RowId } from './types';

/**
 * The storage shape: a note as mergeable JSON.
 *
 * Split along lifecycle, not along the row union. `rows` holds authored
 * content — what the note says, changed rarely, by its author. `attrs`
 * holds per-row state — what happened to the note, changed constantly,
 * often by someone else. An override that ticks three boxes touches only
 * `attrs.done` and never mentions row content, which is what lets a
 * template note and its instances share one body.
 *
 * Order lives in each row's `sort` (see sortkey.ts), so there is no
 * positional array anywhere in the document and every operation —
 * including insert and reorder — is expressible as a JSON merge patch.
 *
 * This is deliberately NOT the editor's model. `Row` stays flat and
 * array-shaped; the reducer, the focus contract and `applyExternalRows`
 * are all written against it and would pay a join for this normalization.
 * The two representations meet here and nowhere else.
 */
export type NoteDoc = {
  rows: Record<RowId, DocRow>;
  attrs?: DocAttrs;
};

export type DocRow = {
  type: Row['type'];
  text: string;
  /** Fractional index; ties break by row id. */
  sort: string;
};

/**
 * Sparse per-row maps, one namespace per attribute. Absent means default,
 * so an unchecked item stores nothing — but an explicit `false` is
 * meaningful, and is how an override unchecks something its base checked.
 *
 * `done` is the only namespace the library reads. Host namespaces
 * (assignee, dueOn, …) pass through untouched: they are storage, not part
 * of the editor's model (architecture.md §4).
 */
export type DocAttrs = {
  done?: Record<RowId, boolean>;
  [namespace: string]: Record<RowId, unknown> | undefined;
};

/** A row patch may null out a field, which resets it to its default. */
export type DocRowPatch = { [K in keyof DocRow]?: DocRow[K] | null };

/**
 * A partial document, in JSON Merge Patch (RFC 7386) spirit: present keys
 * are merged, `null` deletes. A patch never has to restate anything it
 * does not change.
 */
export type NotePatch = {
  rows?: Record<RowId, DocRowPatch | null>;
  attrs?: Record<string, Record<RowId, unknown> | null>;
};

/**
 * Compose a base document with overrides, left to right. Pure JSON
 * manipulation: no validation, no key minting, no invariants enforced —
 * `parseDoc` owns all of that, so composing stays associative and
 * order-independent within a namespace.
 *
 * `null` deletes at three levels: a whole row, a whole attr namespace, or
 * one entry within a namespace.
 */
export function mergeDoc(base: NoteDoc, ...patches: NotePatch[]): NoteDoc {
  const rows: Record<RowId, DocRow> = { ...base.rows };
  const attrs = cloneAttrs(base.attrs);

  for (const patch of patches) {
    for (const [id, value] of Object.entries(patch.rows ?? {})) {
      if (value === null) delete rows[id];
      else rows[id] = mergeFields(rows[id], value);
    }
    for (const [namespace, map] of Object.entries(patch.attrs ?? {})) {
      if (map === null) {
        delete attrs[namespace];
        continue;
      }
      const merged = { ...(attrs[namespace] ?? {}) };
      for (const [id, value] of Object.entries(map)) {
        if (value === null) delete merged[id];
        else merged[id] = value;
      }
      attrs[namespace] = merged;
    }
  }

  return withAttrs(rows, attrs);
}

/**
 * Assemble a document into editor rows.
 *
 * Deliberately tolerant, because independent overrides routinely compose
 * into partial rows: an unparseable or missing `sort` orders last, a
 * missing `type` reads as an item, missing `text` as empty, and newlines
 * — which rows may never contain (architecture.md §2.6) — collapse to
 * spaces. Nothing is dropped; a row that exists in storage reaches the
 * editor.
 *
 * `done` is read only for item rows, so an entry that outlives its item
 * type is ignored rather than corrupting a prose row. That is tolerance,
 * not memory: the reducer drops `done` on a type change and a host's
 * patch must clear the entry to match. Entries naming rows that no longer
 * exist are ignored.
 *
 * Returns `[]` for an empty document; the empty-note invariant has one
 * owner, `createInitialState`, which re-seeds when the store loads.
 */
export function parseDoc(doc: NoteDoc): Row[] {
  const done = doc.attrs?.done ?? {};
  const entries = Object.entries(doc.rows ?? {}).map(([id, raw]) => ({
    id,
    sort: isValidKey(raw?.sort) ? raw.sort : null,
    raw,
  }));

  entries.sort((a, b) => {
    if (a.sort !== null && b.sort !== null) {
      if (a.sort !== b.sort) return a.sort < b.sort ? -1 : 1;
    } else if (a.sort !== null) return -1;
    else if (b.sort !== null) return 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  return entries.map(({ id, raw }) => {
    const source = (raw ?? {}) as Partial<DocRow>;
    const text =
      typeof source.text === 'string' ? source.text.replace(/\r?\n/g, ' ') : '';
    if (source.type === 'header') return { id, type: 'header', text };
    if (source.type === 'text') return { id, type: 'text', text };
    return { id, type: 'item', text, done: done[id] === true };
  });
}

/**
 * Project editor rows back to storage.
 *
 * Pass `previous` when writing back a document that already exists: rows
 * that kept their position keep their sort keys, so only what actually
 * moved produces a changed key, and host attr namespaces survive the
 * round trip (orphans of deleted rows are collected). Omit it to mint a
 * fresh evenly-spaced set — which is also how you rebalance keys that
 * have grown long under heavy incremental patching.
 *
 * Hosts that write incrementally do not need this at all: derive patches
 * from `onAction` and let the editor's edits become targeted writes.
 */
export function serializeDoc(rows: Row[], previous?: NoteDoc): NoteDoc {
  const keys = assignKeys(rows, previous);
  const out: Record<RowId, DocRow> = {};
  const done: Record<RowId, boolean> = {};

  rows.forEach((row, i) => {
    out[row.id] = { type: row.type, text: row.text, sort: keys[i] };
    if (row.type === 'item' && row.done) done[row.id] = true;
  });

  const attrs = carryAttrs(previous, new Set(rows.map((r) => r.id)));
  if (Object.keys(done).length > 0) attrs.done = done;
  return withAttrs(out, attrs);
}

/**
 * Reuse each row's existing key where it still ascends, and mint only
 * across the gaps. Keeps writes minimal: moving one row rewrites one key.
 */
function assignKeys(rows: Row[], previous?: NoteDoc): string[] {
  const existing = rows.map((row) => {
    const key = previous?.rows?.[row.id]?.sort;
    return isValidKey(key) ? key : null;
  });

  const keys: string[] = new Array(rows.length);
  let last: string | null = null;
  let i = 0;

  const usable = (at: number) =>
    existing[at] !== null && (last === null || existing[at]! > last);

  while (i < rows.length) {
    if (usable(i)) {
      keys[i] = existing[i]!;
      last = keys[i];
      i++;
      continue;
    }
    // Mint up to the next row whose stored key still fits after `last`.
    let next = i + 1;
    while (next < rows.length && !usable(next)) next++;
    const upper = next < rows.length ? existing[next] : null;
    const minted = keysBetween(last, upper, next - i);
    minted.forEach((key, offset) => {
      keys[i + offset] = key;
    });
    last = minted[minted.length - 1];
    i = next;
  }

  return keys;
}

function mergeFields(prev: DocRow | undefined, patch: DocRowPatch): DocRow {
  const next: Record<string, unknown> = { ...(prev ?? {}) };
  for (const [field, value] of Object.entries(patch)) {
    if (value === null) delete next[field];
    else next[field] = value;
  }
  return next as DocRow;
}

function cloneAttrs(attrs: DocAttrs | undefined): DocAttrs {
  const out: DocAttrs = {};
  for (const [namespace, map] of Object.entries(attrs ?? {})) {
    if (map) out[namespace] = { ...map };
  }
  return out;
}

/** Carry host namespaces across a round trip, dropping orphaned entries. */
function carryAttrs(previous: NoteDoc | undefined, live: Set<RowId>): DocAttrs {
  const out: DocAttrs = {};
  for (const [namespace, map] of Object.entries(previous?.attrs ?? {})) {
    if (namespace === 'done' || !map) continue; // rebuilt from the rows
    const kept: Record<RowId, unknown> = {};
    for (const [id, value] of Object.entries(map)) {
      if (live.has(id)) kept[id] = value;
    }
    if (Object.keys(kept).length > 0) out[namespace] = kept;
  }
  return out;
}

function withAttrs(rows: Record<RowId, DocRow>, attrs: DocAttrs): NoteDoc {
  return Object.keys(attrs).length > 0 ? { rows, attrs } : { rows };
}
