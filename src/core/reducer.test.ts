import { describe, expect, it } from 'vitest';
import { applyExternalRows, createInitialState, reducer } from './reducer';
import { parseMarkdown, serialize } from './markdown';
import type { State } from './types';

const doc = `# Hardware
- [ ] screws
- [x] hinges

# Paint
- [ ] primer`;

function state(): State {
  return createInitialState(doc);
}

describe('createInitialState', () => {
  it('parses markdown and never yields an empty document', () => {
    const s = state();
    expect(s.rows).toHaveLength(5);
    expect(s.rows[0]).toMatchObject({ type: 'header', text: 'Hardware' });
    expect(s.rows[2]).toMatchObject({ type: 'item', text: 'hinges', done: true });

    const empty = createInitialState('');
    expect(empty.rows).toHaveLength(1);
    expect(empty.rows[0]).toMatchObject({ type: 'item', text: '', done: false });
  });
});

describe('split', () => {
  it('mid-text moves the tail to a new row, caret at 0', () => {
    const s = state();
    const id = s.rows[1].id; // "screws"
    const next = reducer(s, { type: 'split', id, offset: 3 });
    expect(next.rows[1].text).toBe('scr');
    expect(next.rows[2]).toMatchObject({ type: 'item', text: 'ews', done: false });
    expect(next.focus).toEqual({ id: next.rows[2].id, offset: 0 });
  });

  it('at end inserts an empty item below', () => {
    const s = state();
    const id = s.rows[1].id;
    const next = reducer(s, { type: 'split', id, offset: 6 });
    expect(next.rows[1].text).toBe('screws');
    expect(next.rows[2].text).toBe('');
  });

  it('on an empty item converts it to a plain-text paragraph (double-Enter list exit)', () => {
    const s = createInitialState('- [ ] milk');
    const id = s.rows[0].id;
    const afterFirst = reducer(s, { type: 'split', id, offset: 4 });
    const emptyItem = afterFirst.rows[1];
    expect(emptyItem).toMatchObject({ type: 'item', text: '' });

    const afterSecond = reducer(afterFirst, { type: 'split', id: emptyItem.id, offset: 0 });
    expect(afterSecond.rows).toHaveLength(2);
    expect(afterSecond.rows[1]).toMatchObject({ id: emptyItem.id, type: 'text', text: '' });
    expect(afterSecond.focus).toEqual({ id: emptyItem.id, offset: 0 });
  });

  it('splits paragraphs into paragraphs', () => {
    const s = createInitialState('plain note');
    const id = s.rows[0].id;
    expect(s.rows[0].type).toBe('text');
    const next = reducer(s, { type: 'split', id, offset: 5 });
    expect(next.rows[0]).toMatchObject({ type: 'text', text: 'plain' });
    expect(next.rows[1]).toMatchObject({ type: 'text', text: ' note' });
  });

  it('on a header inserts an item, not another header', () => {
    const s = state();
    const id = s.rows[0].id; // "# Hardware"
    const next = reducer(s, { type: 'split', id, offset: 7 });
    expect(next.rows[0]).toMatchObject({ type: 'header', text: 'Hardwar' });
    expect(next.rows[1]).toMatchObject({ type: 'item', text: 'e', done: false });
  });
});

describe('mergeBackward', () => {
  it('appends text to the previous row, caret at pre-merge length', () => {
    const s = state();
    const id = s.rows[2].id; // "hinges" merges into "screws"
    const next = reducer(s, { type: 'mergeBackward', id });
    expect(next.rows).toHaveLength(4);
    expect(next.rows[1].text).toBe('screwshinges');
    expect(next.focus).toEqual({ id: next.rows[1].id, offset: 6 });
  });

  it('merges across a header boundary (deletes the header via its first item)', () => {
    const s = state();
    const id = s.rows[1].id; // "screws" merges into header "Hardware"
    const next = reducer(s, { type: 'mergeBackward', id });
    expect(next.rows[0]).toMatchObject({ type: 'header', text: 'Hardwarescrews' });
  });

  it('is a no-op on the first row', () => {
    const s = state();
    expect(reducer(s, { type: 'mergeBackward', id: s.rows[0].id })).toBe(s);
  });
});

describe('toggleDone', () => {
  it('flips done without touching focus', () => {
    const s = { ...state(), focus: null };
    const id = s.rows[1].id;
    const next = reducer(s, { type: 'toggleDone', id });
    expect(next.rows[1]).toMatchObject({ done: true });
    expect(next.focus).toBe(s.focus);
  });

  it('ignores headers', () => {
    const s = state();
    expect(reducer(s, { type: 'toggleDone', id: s.rows[0].id })).toBe(s);
  });
});

describe('setText', () => {
  it('splices multi-line text into rows instead of storing newlines', () => {
    const s = state();
    const id = s.rows[1].id; // "screws"
    const next = reducer(s, {
      type: 'setText',
      id,
      text: 'screws\ntape\n# Tools\n- [x] level',
    });
    expect(next.rows.map((r) => r.text)).toEqual([
      'Hardware', 'screws', 'tape', 'Tools', 'level', 'hinges', 'Paint', 'primer',
    ]);
    expect(next.rows[3].type).toBe('header');
    expect(next.rows[4]).toMatchObject({ type: 'item', done: true });
    expect(next.rows.every((r) => !r.text.includes('\n'))).toBe(true);
    expect(next.focus).toEqual({ id: next.rows[4].id, offset: 5 });
  });

  it('carries the caret into focus on every edit', () => {
    const s = state();
    const id = s.rows[1].id;
    const next = reducer(s, { type: 'setText', id, text: 'screwss', caret: 7 });
    expect(next.rows[1]).toMatchObject({ type: 'item', text: 'screwss' });
    expect(next.focus).toEqual({ id, offset: 7 });
  });
});

describe('promoteHeader', () => {
  it('converts an item into a header, stripping the marker and shifting the caret', () => {
    const s = state();
    const id = s.rows[1].id;
    const next = reducer(s, { type: 'promoteHeader', id, text: '# screws', caret: 2 });
    expect(next.rows[1]).toMatchObject({ type: 'header', text: 'screws' });
    expect(next.focus).toEqual({ id, offset: 0 });
  });

  it('ignores headers', () => {
    const s = state();
    const id = s.rows[0].id;
    expect(reducer(s, { type: 'promoteHeader', id, text: '# x', caret: 2 })).toBe(s);
  });
});

describe('focusRow', () => {
  it('marks DOM-originated syncs so the view never re-applies them', () => {
    const s = state();
    const id = s.rows[1].id;
    const passive = reducer(s, { type: 'focusRow', id, offset: 3, origin: 'dom' });
    expect(passive.focus).toEqual({ id, offset: 3, origin: 'dom' });

    const request = reducer(s, { type: 'focusRow', id, offset: 3 });
    expect(request.focus).toEqual({ id, offset: 3 });
    expect(request.focus).not.toHaveProperty('origin');
  });
});

describe('setRowType', () => {
  it('re-emits focus as a fresh object (type switches remount the field)', () => {
    const base = state();
    const id = base.rows[1].id;
    const s = { ...base, focus: { id, offset: 3 } };
    const next = reducer(s, { type: 'setRowType', id, rowType: 'header' });
    expect(next.rows[1]).toMatchObject({ type: 'header', text: 'screws' });
    expect(next.focus).toEqual({ id, offset: 3 });
    expect(next.focus).not.toBe(s.focus);
  });
});

describe('move', () => {
  it('re-emits focus as a fresh object so the view re-applies it after reorder', () => {
    const base = state();
    const id = base.rows[1].id;
    const s = { ...base, focus: { id, offset: 3 } };
    const next = reducer(s, { type: 'move', id, toIndex: 2 });
    expect(next.rows.map((r) => r.text)).toEqual([
      'Hardware', 'hinges', 'screws', 'Paint', 'primer',
    ]);
    expect(next.focus).toEqual({ id, offset: 3 });
    expect(next.focus).not.toBe(s.focus);
  });

  it('strips DOM origin on re-emission so focus is re-applied after reorder', () => {
    const base = state();
    const id = base.rows[1].id;
    const s = { ...base, focus: { id, offset: 3, origin: 'dom' as const } };
    const next = reducer(s, { type: 'move', id, toIndex: 2 });
    expect(next.focus).toEqual({ id, offset: 3 });
    expect(next.focus).not.toHaveProperty('origin');
  });
});

describe('remove', () => {
  it('restores the one-empty-item invariant when the last row is removed', () => {
    const s = createInitialState('- [ ] only');
    const next = reducer(s, { type: 'remove', id: s.rows[0].id });
    expect(next.rows).toHaveLength(1);
    expect(next.rows[0]).toMatchObject({ type: 'item', text: '' });
  });
});

describe('pasteText', () => {
  it('splices parsed rows at the caret and lands at the end of the last insert', () => {
    const s = state();
    const id = s.rows[1].id; // "screws", caret after "scr"
    const next = reducer(s, {
      type: 'pasteText',
      id,
      offset: 3,
      text: 'one\n- [x] two',
    });
    expect(next.rows[1].text).toBe('scrone');
    expect(next.rows[2]).toMatchObject({ type: 'item', text: 'twoews', done: true });
    expect(next.focus).toEqual({ id: next.rows[2].id, offset: 3 });
  });

  it('replaces an empty row wholesale', () => {
    const s = createInitialState('');
    const next = reducer(s, {
      type: 'pasteText',
      id: s.rows[0].id,
      offset: 0,
      text: '# A\n- [ ] b',
    });
    expect(next.rows).toHaveLength(2);
    expect(next.rows[0]).toMatchObject({ type: 'header', text: 'A' });
  });
});

describe('applyExternalRows', () => {
  it('preserves focus by row id and clamps the caret to the new text', () => {
    const s: ReturnType<typeof createInitialState> = {
      rows: [{ id: 'x1', type: 'item', text: 'long text here', done: false }],
      focus: { id: 'x1', offset: 14 },
    };
    const next = applyExternalRows(s, [
      { id: 'x1', type: 'item', text: 'short', done: false },
    ]);
    expect(next.focus).toEqual({ id: 'x1', offset: 5 });
    expect(next.focus).not.toHaveProperty('origin'); // model-origin: view re-applies
  });

  it('drops focus when the focused row vanished', () => {
    const s: ReturnType<typeof createInitialState> = {
      rows: [{ id: 'x1', type: 'item', text: 'a', done: false }],
      focus: { id: 'x1', offset: 1 },
    };
    const next = applyExternalRows(s, [
      { id: 'x2', type: 'item', text: 'b', done: false },
    ]);
    expect(next.focus).toBeNull();
  });

  it('returns the same state reference for echo pushes', () => {
    const s = createInitialState('- [x] a\n- [ ] b');
    const echo = s.rows.map((r) => ({ ...r }));
    expect(applyExternalRows(s, echo)).toBe(s);
  });

  it('normalizes an empty push to the empty-document invariant', () => {
    const s = createInitialState('- [ ] a');
    const next = applyExternalRows(s, [], () => 'minted-empty');
    expect(next.rows).toEqual([
      { id: 'minted-empty', type: 'item', text: '', done: false },
    ]);
  });
});

describe('markdown round-trip', () => {
  it('serializes back losslessly apart from ids and blank lines', () => {
    const rows = parseMarkdown(doc);
    expect(serialize(rows)).toBe(doc);
  });

  it('round-trips plain-text paragraphs as bare lines', () => {
    const src = '# Trip\nRemember the charger.\n- [ ] socks';
    const rows = parseMarkdown(src);
    expect(rows[1]).toMatchObject({ type: 'text', text: 'Remember the charger.' });
    expect(serialize(rows)).toBe(src);
  });

  it('uses equal-length markers for checked and unchecked', () => {
    expect('- [ ] '.length).toBe('- [x] '.length);
  });
});
