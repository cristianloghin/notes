import { genId } from './id';
import { parseMarkdown } from './markdown';
import type { Action, Row, State } from './types';

export function createInitialState(initial?: Row[] | string): State {
  let rows: Row[];
  if (typeof initial === 'string') rows = parseMarkdown(initial);
  else if (initial && initial.length > 0) rows = initial;
  else rows = [];
  if (rows.length === 0) rows = [emptyItem()];
  return { rows, focus: null };
}

function emptyItem(): Row {
  return { id: genId(), type: 'item', text: '', done: false };
}

function indexOf(state: State, id: string): number {
  return state.rows.findIndex((r) => r.id === id);
}

/** Fresh focus object as a model-side placement request (origin stripped). */
function reemitFocus(focus: State['focus']): State['focus'] {
  return focus ? { id: focus.id, offset: focus.offset } : null;
}

/**
 * Pure, DOM-free state reducer. Owns caret placement: every structural
 * action returns `focus` as part of the new state (spec §5, §6).
 */
export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'setText': {
      const i = indexOf(state, action.id);
      if (i < 0) return state;
      const row = state.rows[i];
      // Rows never contain newlines. Multi-line text can still arrive as a
      // single setText (dictation, IMEs committing text without a cancelable
      // beforeinput) — clear the row and delegate to the paste path, which
      // replaces an empty row wholesale with the parsed lines.
      if (action.text.includes('\n')) {
        const cleared = state.rows.slice();
        cleared[i] = { ...row, text: '' };
        return reducer(
          { ...state, rows: cleared },
          { type: 'pasteText', id: row.id, offset: 0, text: action.text },
        );
      }
      const rows = state.rows.slice();
      rows[i] = { ...row, text: action.text };
      // The caret accompanies every text edit so state.focus is always the
      // caret's single source of truth — no action needs to read the DOM.
      const focus =
        action.caret != null
          ? { id: row.id, offset: Math.min(action.caret, action.text.length) }
          : state.focus;
      return { rows, focus };
    }

    // "# " typed at the start of an item or paragraph converts it to a
    // header — the only way to create a header from a soft keyboard. The
    // binding detects the trigger; this action owns the conversion.
    case 'promoteHeader': {
      const i = indexOf(state, action.id);
      if (i < 0) return state;
      const row = state.rows[i];
      if (row.type === 'header') return state;
      const text = action.text.startsWith('# ') ? action.text.slice(2) : action.text;
      const rows = state.rows.slice();
      rows[i] = { id: row.id, type: 'header', text };
      const offset = Math.max(0, Math.min(action.caret - 2, text.length));
      return { rows, focus: { id: row.id, offset } };
    }

    case 'split': {
      const i = indexOf(state, action.id);
      if (i < 0) return state;
      const row = state.rows[i];
      const rows = state.rows.slice();
      // Double-Enter list exit: Enter on an empty item converts it to a
      // plain-text paragraph in place instead of adding another checkbox.
      if (row.type === 'item' && row.text === '') {
        rows[i] = { id: row.id, type: 'text', text: '' };
        return { rows, focus: { id: row.id, offset: 0 } };
      }
      const head = row.text.slice(0, action.offset);
      const tail = row.text.slice(action.offsetEnd ?? action.offset);
      // Items split into items, paragraphs into paragraphs; a header spawns
      // an item below, never another header (spec §5).
      const newRow: Row =
        row.type === 'text'
          ? { id: genId(), type: 'text', text: tail }
          : { id: genId(), type: 'item', text: tail, done: false };
      rows[i] = { ...row, text: head };
      rows.splice(i + 1, 0, newRow);
      return { rows, focus: { id: newRow.id, offset: 0 } };
    }

    case 'mergeBackward': {
      const i = indexOf(state, action.id);
      if (i <= 0) return state; // first row: no-op
      const prev = state.rows[i - 1];
      const cur = state.rows[i];
      const offset = prev.text.length;
      const rows = state.rows.slice();
      rows[i - 1] = { ...prev, text: prev.text + cur.text };
      rows.splice(i, 1);
      return { rows, focus: { id: prev.id, offset } };
    }

    case 'remove': {
      const i = indexOf(state, action.id);
      if (i < 0) return state;
      const rows = state.rows.slice();
      rows.splice(i, 1);
      if (rows.length === 0) {
        const row = emptyItem();
        return { rows: [row], focus: { id: row.id, offset: 0 } };
      }
      const target = rows[Math.max(0, i - 1)];
      return { rows, focus: { id: target.id, offset: target.text.length } };
    }

    case 'toggleDone': {
      const i = indexOf(state, action.id);
      if (i < 0) return state;
      const row = state.rows[i];
      if (row.type !== 'item') return state; // headers have no done state
      const rows = state.rows.slice();
      rows[i] = { ...row, done: !row.done };
      return { ...state, rows }; // focus untouched: same reference, no refocus
    }

    case 'setRowType': {
      const i = indexOf(state, action.id);
      if (i < 0) return state;
      const row = state.rows[i];
      if (row.type === action.rowType) return state;
      const rows = state.rows.slice();
      rows[i] =
        action.rowType === 'header'
          ? { id: row.id, type: 'header', text: row.text }
          : action.rowType === 'text'
            ? { id: row.id, type: 'text', text: row.text }
            : { id: row.id, type: 'item', text: row.text, done: false };
      // Re-emit focus: a type switch typically remounts the row's field
      // (skins render headers and items differently), which blurs it — a
      // fresh focus object makes the view re-apply within the same event.
      // Origin is dropped: even if the caret was last synced from the DOM,
      // this re-emission is a model-side placement request.
      return { rows, focus: reemitFocus(state.focus) };
    }

    case 'move': {
      const i = indexOf(state, action.id);
      if (i < 0) return state;
      const rows = state.rows.slice();
      const [row] = rows.splice(i, 1);
      const to = Math.max(0, Math.min(action.toIndex, rows.length));
      rows.splice(to, 0, row);
      // Re-emit focus as a fresh object: reordering detaches the focused DOM
      // node, so the view must re-apply focus even though id/offset are
      // unchanged. Identity change is what triggers the layout effect, and
      // origin is dropped so a previously DOM-synced caret is re-applied.
      return { rows, focus: reemitFocus(state.focus) };
    }

    case 'focusRow': {
      const i = indexOf(state, action.id);
      if (i < 0) return state;
      const row = state.rows[i];
      const offset = Math.max(0, Math.min(action.offset, row.text.length));
      return {
        ...state,
        focus:
          action.origin === 'dom'
            ? { id: row.id, offset, origin: 'dom' }
            : { id: row.id, offset },
      };
    }

    case 'pasteText': {
      const i = indexOf(state, action.id);
      if (i < 0) return state;
      const row = state.rows[i];
      const parsed = parseMarkdown(action.text);
      if (parsed.length === 0) return state;
      const rows = state.rows.slice();

      // Pasting into an empty row replaces it wholesale, keeping parsed types.
      if (row.text === '') {
        rows.splice(i, 1, ...parsed);
        const last = parsed[parsed.length - 1];
        return { rows, focus: { id: last.id, offset: last.text.length } };
      }

      const head = row.text.slice(0, action.offset);
      const tail = row.text.slice(action.offset);
      const first = parsed[0];
      const rest = parsed.slice(1);

      if (rest.length === 0) {
        rows[i] = { ...row, text: head + first.text + tail };
        return { rows, focus: { id: row.id, offset: head.length + first.text.length } };
      }

      rows[i] = { ...row, text: head + first.text };
      const last = rest[rest.length - 1];
      const lastRow = { ...last, text: last.text + tail };
      rows.splice(i + 1, 0, ...rest.slice(0, -1), lastRow);
      return { rows, focus: { id: lastRow.id, offset: last.text.length } };
    }
  }
}
