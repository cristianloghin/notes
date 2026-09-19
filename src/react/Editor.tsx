import {
  Fragment,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useEditorBindings } from "./bindings";
import { useNote } from "./context";
import type { Row } from "../core/types";

type Bindings = ReturnType<typeof useEditorBindings>;

/** Props to spread onto a row's textarea. */
export type FieldProps = ReturnType<Bindings["getRowProps"]>;
/** Props to spread onto an item's done-toggle control. */
export type CheckboxProps = ReturnType<Bindings["getCheckboxProps"]>;

export type EditorRowRenderProps = {
  row: Row;
  index: number;
  /** Spread onto the row's textarea. */
  fieldProps: FieldProps;
  /** Spread onto the done-toggle; null for rows without a done state
      (headers, paragraphs). */
  checkboxProps: CheckboxProps | null;
};

/**
 * Headless editor body. Reads the store from NoteProvider's context and
 * wires the DOM bindings (focus contract, input translation, autosize)
 * internally —
 * no props to thread. A render-prop child owns all presentation, mirroring
 * Toolbar. The component owns two invariants no skin may break:
 *
 * - Rows are keyed by row id, never by array index — index keys misplace
 *   focus on the first reorder (spec §7).
 * - The container carries list semantics (role="list").
 */
export function Editor({
  children,
  className,
  style,
  scrollOnFocus,
  autoFocus = false,
}: {
  children: (props: EditorRowRenderProps) => ReactNode;
  className?: string;
  style?: CSSProperties;
  /** Reveal the focused row after model-side focus placement (default
      true). Set false if the host owns all scrolling. */
  scrollOnFocus?: boolean;
  /** Place the caret at the start of the first row on mount, unless the
      store already has a focus. Like the DOM attribute: read once, on
      mount. The placement goes through the store as a `focusRow` action,
      so it lands by the same §6 path as any structural action — and only
      keeps the iOS keyboard if the mount itself happens inside a tap's
      synchronous call stack. */
  autoFocus?: boolean;
}) {
  const { store, state } = useNote();

  // Mount-only, like the DOM attribute; a layout effect so the dispatch
  // and the resulting placement stay inside the originating event.
  const wantsAutoFocus = useRef(autoFocus);
  useLayoutEffect(() => {
    if (!wantsAutoFocus.current) return;
    const { rows, focus } = store.getState();
    if (focus || rows.length === 0) return;
    store.dispatch({ type: "focusRow", id: rows[0].id, offset: 0 });
  }, [store]);

  const { containerRef, getRowProps, getCheckboxProps } = useEditorBindings(
    store,
    state,
    scrollOnFocus,
  );
  return (
    <div ref={containerRef} className={className} style={style} role="list">
      {state.rows.map((row, index) => (
        <Fragment key={row.id}>
          {children({
            row,
            index,
            fieldProps: getRowProps(row.id),
            checkboxProps:
              row.type === "item" ? getCheckboxProps(row.id) : null,
          })}
        </Fragment>
      ))}
    </div>
  );
}
