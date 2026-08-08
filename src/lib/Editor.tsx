import { Fragment, type CSSProperties, type ReactNode } from "react";
import { useEditorBindings } from "./bindings";
import { useNoteStore } from "./context";
import type { Row } from "./types";

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
}: {
  children: (props: EditorRowRenderProps) => ReactNode;
  className?: string;
  style?: CSSProperties;
  /** Reveal the focused row after model-side focus placement (default
      true). Set false if the host owns all scrolling. */
  scrollOnFocus?: boolean;
}) {
  const store = useNoteStore();
  const { state, getRowProps, getCheckboxProps } = useEditorBindings(
    store,
    scrollOnFocus,
  );
  return (
    <div className={className} style={style} role="list">
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
