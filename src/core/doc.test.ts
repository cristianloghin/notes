import { describe, expect, it } from 'vitest';
import { mergeDoc, parseDoc, serializeDoc, type NoteDoc } from './doc';
import { keyBetween } from './sortkey';
import type { Row } from './types';

const rows: Row[] = [
  { id: 'h1', type: 'header', text: 'Hardware' },
  { id: 'i1', type: 'item', text: 'screws', done: false },
  { id: 'i2', type: 'item', text: 'hinges', done: true },
  { id: 't1', type: 'text', text: 'from the blue bin' },
];

const base = (): NoteDoc => serializeDoc(rows);

describe('round trip', () => {
  it('preserves ids, order, text, type and done', () => {
    expect(parseDoc(base())).toEqual(rows);
  });

  it('stores done sparsely, outside the rows', () => {
    const doc = base();
    expect(doc.attrs?.done).toEqual({ i2: true });
    expect(doc.rows.i1).not.toHaveProperty('done');
    expect(doc.rows.i2).not.toHaveProperty('done');
  });

  it('refuses duplicate ids rather than dropping a row', () => {
    const clashing: Row[] = [
      { id: 'dup', type: 'header', text: 'Pants' },
      { id: 'i1', type: 'item', text: 'jeans', done: false },
      { id: 'dup', type: 'header', text: 'Pants' },
    ];
    expect(() => serializeDoc(clashing)).toThrow(/duplicate row id: dup/);
  });

  it('returns an empty array for an empty document', () => {
    expect(parseDoc({ rows: {} })).toEqual([]);
    expect(serializeDoc([])).toEqual({ rows: {} });
  });
});

describe('parseDoc', () => {
  it('orders by sort key, not by insertion order', () => {
    const doc = base();
    const shuffled: NoteDoc = {
      rows: { t1: doc.rows.t1, i2: doc.rows.i2, h1: doc.rows.h1, i1: doc.rows.i1 },
      attrs: doc.attrs,
    };
    expect(parseDoc(shuffled).map((r) => r.id)).toEqual(['h1', 'i1', 'i2', 't1']);
  });

  it('breaks ties by row id so every reader agrees', () => {
    const doc: NoteDoc = {
      rows: {
        b: { type: 'item', text: 'b', sort: 'a1' },
        a: { type: 'item', text: 'a', sort: 'a1' },
        c: { type: 'item', text: 'c', sort: 'a0' },
      },
    };
    expect(parseDoc(doc).map((r) => r.id)).toEqual(['c', 'a', 'b']);
  });

  it('orders rows with a missing or unusable sort key last, by id', () => {
    const doc: NoteDoc = {
      rows: {
        z: { type: 'item', text: 'z' } as never,
        m: { type: 'item', text: 'm', sort: 'nonsense!' },
        a: { type: 'item', text: 'a', sort: 'a1' },
      },
    };
    expect(parseDoc(doc).map((r) => r.id)).toEqual(['a', 'm', 'z']);
  });

  it('fills defaults for fields an override left out', () => {
    const doc: NoteDoc = { rows: { a: { text: 'only text' } as never } };
    expect(parseDoc(doc)).toEqual([
      { id: 'a', type: 'item', text: 'only text', done: false },
    ]);
  });

  it('collapses newlines — rows may never contain them', () => {
    const doc: NoteDoc = {
      rows: { a: { type: 'text', text: 'one\ntwo\r\nthree', sort: 'a0' } },
    };
    expect(parseDoc(doc)[0].text).toBe('one two three');
  });

  it('reads done only for item rows, and ignores orphaned entries', () => {
    const doc: NoteDoc = {
      rows: {
        a: { type: 'text', text: 'prose', sort: 'a0' },
        b: { type: 'item', text: 'task', sort: 'a1' },
      },
      attrs: { done: { a: true, b: true, gone: true } },
    };
    const parsed = parseDoc(doc);
    expect(parsed[0]).toEqual({ id: 'a', type: 'text', text: 'prose' });
    expect(parsed[1]).toEqual({ id: 'b', type: 'item', text: 'task', done: true });
  });

  it('treats an explicit false as unchecked', () => {
    const doc = mergeDoc(base(), { attrs: { done: { i2: false } } });
    expect(parseDoc(doc).find((r) => r.id === 'i2')).toMatchObject({ done: false });
  });
});

describe('mergeDoc', () => {
  it('applies an override that only ticks boxes, leaving content untouched', () => {
    const doc = base();
    const merged = mergeDoc(doc, { attrs: { done: { i1: true } } });
    expect(merged.rows).toEqual(doc.rows);
    expect(parseDoc(merged).map((r) => r.type === 'item' && r.done)).toEqual([
      false,
      true,
      true,
      false,
    ]);
  });

  it('merges row fields without restating the rest of the row', () => {
    const merged = mergeDoc(base(), { rows: { i1: { text: 'brass screws' } } });
    expect(merged.rows.i1).toMatchObject({ type: 'item', text: 'brass screws' });
    expect(merged.rows.i1.sort).toBe(base().rows.i1.sort);
  });

  it('deletes a row, an attr entry and a whole namespace with null', () => {
    const doc = mergeDoc(base(), { attrs: { assignee: { i1: 'u_7', i2: 'u_9' } } });

    expect(mergeDoc(doc, { rows: { i1: null } }).rows).not.toHaveProperty('i1');
    expect(
      mergeDoc(doc, { attrs: { done: { i2: null } } }).attrs?.done,
    ).toEqual({});
    expect(
      mergeDoc(doc, { attrs: { assignee: null } }).attrs,
    ).not.toHaveProperty('assignee');
  });

  it('resets a field to its default when the patch nulls it', () => {
    const merged = mergeDoc(base(), { rows: { h1: { type: null } } });
    expect(parseDoc(merged).find((r) => r.id === 'h1')?.type).toBe('item');
  });

  it('inserts a row structurally — the whole point of fractional keys', () => {
    const doc = base();
    const between = keyBetween(doc.rows.i1.sort, doc.rows.i2.sort);
    const merged = mergeDoc(doc, {
      rows: { new1: { type: 'item', text: 'washers', sort: between } },
    });
    expect(parseDoc(merged).map((r) => r.id)).toEqual([
      'h1',
      'i1',
      'new1',
      'i2',
      't1',
    ]);
    // Nothing else was rewritten: the override named exactly one row.
    expect(doc.rows).not.toHaveProperty('new1');
  });

  it('composes overrides left to right', () => {
    const merged = mergeDoc(
      base(),
      { attrs: { done: { i1: true } } },
      { attrs: { done: { i1: false, i2: false } } },
      { rows: { t1: null } },
    );
    expect(parseDoc(merged).map((r) => r.id)).toEqual(['h1', 'i1', 'i2']);
    expect(merged.attrs?.done).toEqual({ i1: false, i2: false });
  });

  it('does not mutate the base or the patches', () => {
    const doc = base();
    const snapshot = structuredClone(doc);
    mergeDoc(doc, { rows: { i1: null }, attrs: { done: { i2: null } } });
    expect(doc).toEqual(snapshot);
  });
});

describe('serializeDoc', () => {
  it('reuses keys for rows that did not move', () => {
    const doc = base();
    const edited = parseDoc(doc).map((row) =>
      row.id === 'i1' ? { ...row, text: 'brass screws' } : row,
    );
    const next = serializeDoc(edited, doc);
    for (const id of ['h1', 'i1', 'i2', 't1']) {
      expect(next.rows[id].sort).toBe(doc.rows[id].sort);
    }
    expect(next.rows.i1.text).toBe('brass screws');
  });

  it('rewrites only the key of the row that moved', () => {
    const doc = base();
    const parsed = parseDoc(doc);
    const moved = [parsed[0], parsed[2], parsed[1], parsed[3]]; // i2 before i1
    const next = serializeDoc(moved, doc);

    // A swap re-keys one of the two rows; which one is the greedy pass's
    // choice (it keeps the longest ascending run). The contract is the
    // count, not the identity.
    const changed = Object.keys(next.rows).filter(
      (id) => next.rows[id].sort !== doc.rows[id].sort,
    );
    expect(changed).toHaveLength(1);
    expect(['i1', 'i2']).toContain(changed[0]);
    expect(parseDoc(next).map((r) => r.id)).toEqual(['h1', 'i2', 'i1', 't1']);
  });

  it('mints keys for new rows without disturbing their neighbours', () => {
    const doc = base();
    const parsed = parseDoc(doc);
    const withNew: Row[] = [
      ...parsed.slice(0, 2),
      { id: 'new1', type: 'item', text: 'washers', done: false },
      ...parsed.slice(2),
    ];
    const next = serializeDoc(withNew, doc);
    for (const id of ['h1', 'i1', 'i2', 't1']) {
      expect(next.rows[id].sort).toBe(doc.rows[id].sort);
    }
    expect(parseDoc(next).map((r) => r.id)).toEqual([
      'h1',
      'i1',
      'new1',
      'i2',
      't1',
    ]);
  });

  it('rebalances into fresh evenly spaced keys when given no previous doc', () => {
    const grown: NoteDoc = {
      rows: {
        a: { type: 'item', text: 'a', sort: 'a0' },
        b: { type: 'item', text: 'b', sort: 'a0V' },
        c: { type: 'item', text: 'c', sort: 'a0VVVVVVVV' },
      },
    };
    const rebalanced = serializeDoc(parseDoc(grown));
    expect(parseDoc(rebalanced).map((r) => r.id)).toEqual(['a', 'b', 'c']);
    expect(
      Math.max(...Object.values(rebalanced.rows).map((r) => r.sort.length)),
    ).toBeLessThanOrEqual(3);
  });

  it('carries host namespaces across a round trip and collects orphans', () => {
    const doc = mergeDoc(base(), {
      attrs: { assignee: { i1: 'u_7', i2: 'u_9' }, dueOn: { t1: '2026-09-10' } },
    });
    const kept = parseDoc(doc).filter((r) => r.id !== 't1');
    const next = serializeDoc(kept, doc);

    expect(next.attrs?.assignee).toEqual({ i1: 'u_7', i2: 'u_9' });
    expect(next.attrs).not.toHaveProperty('dueOn'); // t1 is gone
    expect(next.attrs?.done).toEqual({ i2: true });
  });
});

describe('tombstones', () => {
  const deleted = (doc: NoteDoc, id: string) =>
    serializeDoc(parseDoc(doc).filter((r) => r.id !== id), doc);

  it('keeps a removed row in the document and marks it', () => {
    const doc = base();
    const next = deleted(doc, 'i2');

    expect(next.rows.i2).toEqual(doc.rows.i2); // entry survives intact
    expect(next.attrs?.deleted).toEqual({ i2: true });
    expect(parseDoc(next).map((r) => r.id)).toEqual(['h1', 'i1', 't1']);
  });

  it('gives a stale patch something to land on instead of a fragment', () => {
    const stale = mergeDoc(deleted(base(), 'i2'), {
      rows: { i2: { text: 'brass hinges' } },
    });
    // The edit applies to a row nobody can see, rather than reviving it.
    expect(stale.rows.i2.text).toBe('brass hinges');
    expect(parseDoc(stale).map((r) => r.id)).toEqual(['h1', 'i1', 't1']);
  });

  it('tells a one-off add from a corpse by presence in the base', () => {
    const doc = base();
    const withAdd = mergeDoc(deleted(doc, 'i2'), {
      rows: {
        extra: {
          type: 'item',
          text: 'washers',
          sort: keyBetween(doc.rows.i1.sort, doc.rows.i2.sort),
        },
      },
    });
    expect(parseDoc(withAdd).map((r) => r.id)).toEqual(['h1', 'i1', 'extra', 't1']);
  });

  it('revives a row with its content and position, but not its state', () => {
    const revived = mergeDoc(deleted(base(), 'i2'), {
      attrs: { deleted: { i2: null } },
    });
    const rows = parseDoc(revived);
    expect(rows.map((r) => r.id)).toEqual(['h1', 'i1', 'i2', 't1']);
    // i2 was ticked before the delete; reviving restores the line, not the tick.
    expect(rows[2]).toEqual({ id: 'i2', type: 'item', text: 'hinges', done: false });
  });

  it('re-tombstones across repeated writes', () => {
    const once = deleted(base(), 'i2');
    const twice = serializeDoc(parseDoc(once), once);
    expect(twice.attrs?.deleted).toEqual({ i2: true });
    expect(twice.rows.i2).toBeDefined();
  });
});

describe('deletes: drop', () => {
  const without = (doc: NoteDoc, id: string, drop = true) =>
    serializeDoc(
      parseDoc(doc).filter((r) => r.id !== id),
      doc,
      drop ? { deletes: 'drop' } : undefined,
    );

  it('removes the row outright instead of marking it', () => {
    const next = without(base(), 'i2');
    expect(next.rows).not.toHaveProperty('i2');
    // Nothing left in attrs at all, so the key is omitted entirely.
    expect(next.attrs?.deleted).toBeUndefined();
    expect(parseDoc(next).map((r) => r.id)).toEqual(['h1', 'i1', 't1']);
  });

  it('sweeps tombstones the previous document already carried', () => {
    const tombstoned = without(base(), 'i2', false);
    expect(tombstoned.attrs?.deleted).toEqual({ i2: true });

    // A later write in drop mode clears what an earlier one had marked.
    const swept = serializeDoc(parseDoc(tombstoned), tombstoned, {
      deletes: 'drop',
    });
    expect(swept.rows).not.toHaveProperty('i2');
    expect(swept.attrs?.deleted).toBeUndefined();
  });

  it('defaults to tombstoning when no option is given', () => {
    expect(without(base(), 'i2', false).attrs?.deleted).toEqual({ i2: true });
  });
});
