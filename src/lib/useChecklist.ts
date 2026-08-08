import {
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  type ClipboardEvent,
  type FocusEvent,
  type KeyboardEvent,
  type SyntheticEvent,
} from 'react';
import { createInitialState, reducer } from './reducer';
import { serialize } from './markdown';
import type { Action, Row, RowId } from './types';

const supportsFieldSizing =
  typeof CSS !== 'undefined' && CSS.supports?.('field-sizing', 'content');

function autosize(el: HTMLTextAreaElement) {
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}

export function useChecklist(options?: {
  initial?: Row[] | string;
  onChange?: (rows: Row[]) => void;
}) {
  const [state, dispatch] = useReducer(reducer, options?.initial, createInitialState);
  const refs = useRef(new Map<RowId, HTMLTextAreaElement>());
  const composing = useRef(false);
  // True while the layout effect is applying focus to the DOM, so the focus
  // events that application fires are not echoed back as passive syncs.
  const applyingFocus = useRef(false);

  const onChangeRef = useRef(options?.onChange);
  onChangeRef.current = options?.onChange;
  useEffect(() => {
    onChangeRef.current?.(state.rows);
  }, [state.rows]);

  // Focus contract (spec §6): applied in useLayoutEffect so it stays inside
  // the originating discrete event's synchronous flush — deferring would
  // drop the iOS keyboard. Fields hand focus off directly, never blur first.
  // Skipped when the DOM already matches (the common case after typing, and
  // after passive syncs) so applying never fights native caret behavior.
  useLayoutEffect(() => {
    const focus = state.focus;
    if (!focus || composing.current) return;
    const el = refs.current.get(focus.id);
    if (!el) return;
    if (
      document.activeElement === el &&
      el.selectionStart === focus.offset &&
      el.selectionEnd === focus.offset
    ) {
      return;
    }
    applyingFocus.current = true;
    try {
      if (document.activeElement !== el) el.focus({ preventScroll: true });
      el.setSelectionRange(focus.offset, focus.offset);
    } finally {
      applyingFocus.current = false;
    }
    el.scrollIntoView({ block: 'nearest' });
  }, [state.focus]);

  // Auto-grow fallback where `field-sizing: content` is unsupported.
  useLayoutEffect(() => {
    if (supportsFieldSizing) return;
    for (const el of refs.current.values()) autosize(el);
  }, [state.rows]);

  function handleBeforeInput(id: RowId, e: InputEvent) {
    if (composing.current) return;
    const el = e.target as HTMLTextAreaElement;
    if (
      (e.inputType === 'insertText' || e.inputType === 'insertReplacementText') &&
      e.data != null &&
      e.data.includes('\n')
    ) {
      // Multi-line commits (dictation, swipe keyboards) arrive as one
      // insertText — route through the paste path so lines become rows.
      e.preventDefault();
      dispatch({ type: 'pasteText', id, offset: el.selectionStart ?? 0, text: e.data });
      return;
    }
    if (e.inputType === 'insertLineBreak' || e.inputType === 'insertParagraph') {
      e.preventDefault();
      dispatch({
        type: 'split',
        id,
        offset: el.selectionStart ?? el.value.length,
        offsetEnd: el.selectionEnd ?? undefined,
      });
      return;
    }
    // Backspace-at-zero must be detected here, not on keydown: Android soft
    // keyboards report keyCode 229 / "Unidentified" in composition (spec §9).
    if (
      e.inputType === 'deleteContentBackward' &&
      el.selectionStart === 0 &&
      el.selectionEnd === 0
    ) {
      e.preventDefault();
      dispatch({ type: 'mergeBackward', id });
    }
  }

  function makeRef(id: RowId) {
    return (el: HTMLTextAreaElement | null) => {
      if (el) {
        refs.current.set(id, el);
        const marked = el as HTMLTextAreaElement & { __clAttached?: boolean };
        if (!marked.__clAttached) {
          marked.__clAttached = true;
          el.addEventListener('beforeinput', (e) =>
            handleBeforeInput(id, e as InputEvent),
          );
          if (!supportsFieldSizing) autosize(el);
        }
      } else {
        refs.current.delete(id);
      }
    };
  }

  function getRowProps(id: RowId) {
    const index = state.rows.findIndex((r) => r.id === id);
    const row = state.rows[index];
    return {
      ref: makeRef(id),
      value: row?.text ?? '',
      rows: 1,
      enterKeyHint: 'next' as const,
      autoComplete: 'off',
      spellCheck: false,
      onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const text = e.currentTarget.value;
        const caret = e.currentTarget.selectionStart;
        // Input translation, like Enter → split: "# " at the start of an
        // item or paragraph triggers header promotion; the reducer owns it.
        if (
          row != null &&
          row.type !== 'header' &&
          text.startsWith('# ') &&
          !text.includes('\n') &&
          !composing.current
        ) {
          dispatch({ type: 'promoteHeader', id, text, caret });
          return;
        }
        dispatch({ type: 'setText', id, text, caret });
      },
      onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (composing.current || e.nativeEvent.isComposing) return;
        const el = e.currentTarget;
        if (e.key === 'Enter') {
          // Hardware keyboards; prevented here so beforeinput never fires
          // for the same keystroke. Soft keyboards land in beforeinput.
          e.preventDefault();
          dispatch({ type: 'split', id, offset: el.selectionStart, offsetEnd: el.selectionEnd });
          return;
        }
        if (e.key === 'Backspace' && el.selectionStart === 0 && el.selectionEnd === 0) {
          // At offset 0 the deletion is a no-op, so beforeinput never fires —
          // merge must be detected here. Android IMEs that report 229 /
          // "Unidentified" instead of "Backspace" fall through to the
          // beforeinput handler below.
          e.preventDefault();
          dispatch({ type: 'mergeBackward', id });
          return;
        }
        if (e.key === 'ArrowUp' && el.selectionStart === 0 && el.selectionEnd === 0) {
          if (index > 0) {
            e.preventDefault();
            const prev = state.rows[index - 1];
            dispatch({ type: 'focusRow', id: prev.id, offset: 0 });
          }
          return;
        }
        if (
          e.key === 'ArrowDown' &&
          el.selectionStart === el.value.length &&
          el.selectionEnd === el.value.length
        ) {
          if (index < state.rows.length - 1) {
            e.preventDefault();
            const next = state.rows[index + 1];
            dispatch({
              type: 'focusRow',
              id: next.id,
              offset: Math.min(el.selectionStart, next.text.length),
            });
          }
        }
      },
      onPaste: (e: ClipboardEvent<HTMLTextAreaElement>) => {
        const text = e.clipboardData.getData('text/plain');
        if (!text.includes('\n')) return; // single-line pastes use native behavior
        e.preventDefault();
        const el = e.currentTarget;
        dispatch({ type: 'pasteText', id, offset: el.selectionStart, text });
      },
      onCompositionStart: () => {
        composing.current = true;
      },
      onCompositionEnd: () => {
        composing.current = false;
      },
      // Passive caret sync: user-driven focus and caret moves (taps, arrow
      // keys within a row) are reported into state so state.focus is always
      // current — actions never read the DOM. Guarded against echoes of our
      // own focus application; non-collapsed selections are not reported
      // (collapsing them via re-application would break text selection).
      onFocus: (e: FocusEvent<HTMLTextAreaElement>) => {
        if (applyingFocus.current) return;
        dispatch({ type: 'focusRow', id, offset: e.currentTarget.selectionStart ?? 0 });
      },
      onSelect: (e: SyntheticEvent<HTMLTextAreaElement>) => {
        if (applyingFocus.current || composing.current) return;
        const el = e.currentTarget;
        if (el.selectionStart !== el.selectionEnd) return;
        if (
          state.focus &&
          state.focus.id === id &&
          state.focus.offset === el.selectionStart
        ) {
          return;
        }
        dispatch({ type: 'focusRow', id, offset: el.selectionStart });
      },
    };
  }

  // Non-field controls must never steal focus from the active row (spec §6).
  function getCheckboxProps(id: RowId) {
    return {
      tabIndex: -1,
      onPointerDown: (e: React.PointerEvent) => e.preventDefault(),
      onClick: () => dispatch({ type: 'toggleDone', id }),
    };
  }

  function getContainerProps() {
    return {};
  }

  return {
    rows: state.rows,
    focus: state.focus,
    dispatch: dispatch as (action: Action) => void,
    getRowProps,
    getCheckboxProps,
    getContainerProps,
    toMarkdown: () => serialize(state.rows),
  };
}
