import {
  useLayoutEffect,
  useRef,
  type ClipboardEvent,
  type FocusEvent,
  type KeyboardEvent,
  type SyntheticEvent,
} from "react";
import type { NoteStore } from "../core/store";
import type { RowId, State } from "../core/types";

const supportsFieldSizing =
  typeof CSS !== "undefined" && CSS.supports?.("field-sizing", "content");

// Last value each field was sized for. Autosizing collapses the field to
// measure it (height: auto), which transiently shrinks the scroll
// container's content height — the browser then clamps scrollTop and does
// NOT restore it, which reads as a random jump when scrolled down. Only
// re-measure fields whose text actually changed so a rows change (e.g. a
// done-toggle) never touches any height.
const lastSizedValue = new WeakMap<HTMLTextAreaElement, string>();

function autosize(el: HTMLTextAreaElement) {
  if (lastSizedValue.get(el) === el.value) return;
  lastSizedValue.set(el, el.value);
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

/**
 * Internal: the DOM half of the editor — focus application, input
 * translation, composition guards, autosize. The caller (Editor) passes
 * the subscribed state it already renders from; event handlers read
 * store.getState() at event time, so they can never act on a stale
 * snapshot.
 */
export function useEditorBindings(
  store: NoteStore,
  state: State,
  scrollOnFocus = true,
) {
  const dispatch = store.dispatch;
  const refs = useRef(new Map<RowId, HTMLTextAreaElement>());
  const composing = useRef(false);
  // True while the layout effect is applying focus to the DOM, so the focus
  // events that application fires are not echoed back as passive syncs.
  const applyingFocus = useRef(false);

  // Focus contract (spec §6): applied in useLayoutEffect so it stays inside
  // the originating discrete event's synchronous flush — deferring would
  // drop the iOS keyboard. Fields hand focus off directly, never blur first.
  // Skipped when the DOM already matches (the common case after typing, and
  // after passive syncs) so applying never fights native caret behavior.
  useLayoutEffect(() => {
    const focus = state.focus;
    // DOM-originated focus is bookkeeping, never a placement request:
    // re-applying it would clobber Safari's in-flight tap caret placement
    // and trigger a scroll nudge on every tap into a row.
    if (!focus || focus.origin === "dom" || composing.current) return;
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
    if (scrollOnFocus) {
      el.scrollIntoView({ block: "nearest" });
    }
  }, [state.focus, scrollOnFocus]);

  // Auto-grow fallback where `field-sizing: content` is unsupported.
  useLayoutEffect(() => {
    if (supportsFieldSizing) return;
    for (const el of refs.current.values()) autosize(el);
  }, [state.rows]);

  function handleBeforeInput(id: RowId, e: InputEvent) {
    if (composing.current) return;
    const el = e.target as HTMLTextAreaElement;
    if (
      (e.inputType === "insertText" ||
        e.inputType === "insertReplacementText") &&
      e.data != null &&
      e.data.includes("\n")
    ) {
      // Multi-line commits (dictation, swipe keyboards) arrive as one
      // insertText — route through the paste path so lines become rows.
      e.preventDefault();
      dispatch({
        type: "pasteText",
        id,
        offset: el.selectionStart ?? 0,
        text: e.data,
      });
      return;
    }
    if (
      e.inputType === "insertLineBreak" ||
      e.inputType === "insertParagraph"
    ) {
      e.preventDefault();
      dispatch({
        type: "split",
        id,
        offset: el.selectionStart ?? el.value.length,
        offsetEnd: el.selectionEnd ?? undefined,
      });
      return;
    }
    // Backspace-at-zero must be detected here, not on keydown: Android soft
    // keyboards report keyCode 229 / "Unidentified" in composition (spec §9).
    if (
      e.inputType === "deleteContentBackward" &&
      el.selectionStart === 0 &&
      el.selectionEnd === 0
    ) {
      e.preventDefault();
      dispatch({ type: "mergeBackward", id });
    }
  }

  function makeRef(id: RowId) {
    return (el: HTMLTextAreaElement | null) => {
      if (el) {
        refs.current.set(id, el);
        const marked = el as HTMLTextAreaElement & { __clAttached?: boolean };
        if (!marked.__clAttached) {
          marked.__clAttached = true;
          el.addEventListener("beforeinput", (e) =>
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
    const row = state.rows.find((r) => r.id === id);
    return {
      ref: makeRef(id),
      value: row?.text ?? "",
      rows: 1,
      enterKeyHint: "next" as const,
      autoComplete: "off",
      spellCheck: false,
      onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const text = e.currentTarget.value;
        const caret = e.currentTarget.selectionStart;
        const current = store.getState().rows.find((r) => r.id === id);
        // Input translation, like Enter → split: "# " at the start of an
        // item or paragraph triggers header promotion; the reducer owns it.
        if (
          current != null &&
          current.type !== "header" &&
          text.startsWith("# ") &&
          !text.includes("\n") &&
          !composing.current
        ) {
          dispatch({ type: "promoteHeader", id, text, caret });
          return;
        }
        dispatch({ type: "setText", id, text, caret });
      },
      onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (composing.current || e.nativeEvent.isComposing) return;
        const el = e.currentTarget;
        if (e.key === "Enter") {
          // Hardware keyboards; prevented here so beforeinput never fires
          // for the same keystroke. Soft keyboards land in beforeinput.
          e.preventDefault();
          dispatch({
            type: "split",
            id,
            offset: el.selectionStart,
            offsetEnd: el.selectionEnd,
          });
          return;
        }
        if (
          e.key === "Backspace" &&
          el.selectionStart === 0 &&
          el.selectionEnd === 0
        ) {
          // At offset 0 the deletion is a no-op, so beforeinput never fires —
          // merge must be detected here. Android IMEs that report 229 /
          // "Unidentified" instead of "Backspace" fall through to the
          // beforeinput handler.
          e.preventDefault();
          dispatch({ type: "mergeBackward", id });
          return;
        }
        const rows = store.getState().rows;
        const index = rows.findIndex((r) => r.id === id);
        if (
          e.key === "ArrowUp" &&
          el.selectionStart === 0 &&
          el.selectionEnd === 0
        ) {
          if (index > 0) {
            e.preventDefault();
            dispatch({ type: "focusRow", id: rows[index - 1].id, offset: 0 });
          }
          return;
        }
        if (
          e.key === "ArrowDown" &&
          el.selectionStart === el.value.length &&
          el.selectionEnd === el.value.length
        ) {
          if (index >= 0 && index < rows.length - 1) {
            e.preventDefault();
            const next = rows[index + 1];
            dispatch({
              type: "focusRow",
              id: next.id,
              offset: Math.min(el.selectionStart, next.text.length),
            });
          }
        }
      },
      onPaste: (e: ClipboardEvent<HTMLTextAreaElement>) => {
        const text = e.clipboardData.getData("text/plain");
        if (!text.includes("\n")) return; // single-line pastes use native behavior
        e.preventDefault();
        const el = e.currentTarget;
        dispatch({ type: "pasteText", id, offset: el.selectionStart, text });
      },
      onCompositionStart: () => {
        composing.current = true;
      },
      onCompositionEnd: () => {
        composing.current = false;
      },
      // Passive caret sync: user-driven focus and caret moves are reported
      // into state so state.focus is always current — actions never read
      // the DOM. Guarded against echoes of our own focus application;
      // non-collapsed selections are never reported (collapsing them via
      // re-application would break text selection).
      onFocus: (e: FocusEvent<HTMLTextAreaElement>) => {
        if (applyingFocus.current) return;
        dispatch({
          type: "focusRow",
          id,
          offset: e.currentTarget.selectionStart ?? 0,
          origin: "dom",
        });
      },
      onSelect: (e: SyntheticEvent<HTMLTextAreaElement>) => {
        if (applyingFocus.current || composing.current) return;
        const el = e.currentTarget;
        if (el.selectionStart !== el.selectionEnd) return;
        const focus = store.getState().focus;
        if (focus && focus.id === id && focus.offset === el.selectionStart) {
          return;
        }
        dispatch({
          type: "focusRow",
          id,
          offset: el.selectionStart,
          origin: "dom",
        });
      },
    };
  }

  // Non-field controls must never steal focus from the active row (spec §6).
  function getCheckboxProps(id: RowId) {
    return {
      tabIndex: -1,
      onPointerDown: (e: React.PointerEvent) => e.preventDefault(),
      onClick: () => dispatch({ type: "toggleDone", id }),
    };
  }

  return { getRowProps, getCheckboxProps };
}
