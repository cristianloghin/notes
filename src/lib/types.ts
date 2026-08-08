export type RowId = string;

export type HeaderRow = { id: RowId; type: 'header'; text: string };
export type ItemRow = { id: RowId; type: 'item'; text: string; done: boolean };
export type TextRow = { id: RowId; type: 'text'; text: string };
export type Row = HeaderRow | ItemRow | TextRow;

/**
 * The caret. `origin: 'dom'` marks a passive sync — the caret position was
 * read *from* the DOM (tap, native caret move) and must never be applied
 * back to it; the view's focus effect ignores such carets. Model-originated
 * carets (no origin) are placement requests the view must apply.
 */
export type Caret = { id: RowId; offset: number; origin?: 'dom' };

export type State = {
  rows: Row[];
  focus: Caret | null;
};

export type Action =
  | { type: 'setText'; id: RowId; text: string; caret?: number }
  | { type: 'promoteHeader'; id: RowId; text: string; caret: number }
  | { type: 'split'; id: RowId; offset: number; offsetEnd?: number }
  | { type: 'mergeBackward'; id: RowId }
  | { type: 'remove'; id: RowId }
  | { type: 'toggleDone'; id: RowId }
  | { type: 'setRowType'; id: RowId; rowType: Row['type'] }
  | { type: 'move'; id: RowId; toIndex: number }
  | { type: 'focusRow'; id: RowId; offset: number; origin?: 'dom' }
  | { type: 'pasteText'; id: RowId; offset: number; text: string };
