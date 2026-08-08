import { Fragment, type CSSProperties, type ReactNode } from "react";
import type { Row } from "./types";
import type { useChecklist } from "./useChecklist";

type ChecklistApi = ReturnType<typeof useChecklist>;

/** Props to spread onto a row's textarea. */
export type FieldProps = ReturnType<ChecklistApi["getRowProps"]>;
/** Props to spread onto an item's done-toggle control. */
export type CheckboxProps = ReturnType<ChecklistApi["getCheckboxProps"]>;

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
 * Headless editor body: maps rows to a render-prop child that owns all
 * presentation, mirroring Toolbar. The component owns two invariants so no
 * skin can break them:
 *
 * - Rows are keyed by row id, never by array index — index keys misplace
 *   focus on the first reorder (spec §7).
 * - The container carries list semantics (role="list").
 *
 * The child receives the assembled per-row props; render any structure
 * around them.
 */
export function Editor({
  rows,
  getRowProps,
  getCheckboxProps,
  children,
  className,
  style,
}: {
  rows: Row[];
  getRowProps: ChecklistApi["getRowProps"];
  getCheckboxProps: ChecklistApi["getCheckboxProps"];
  children: (props: EditorRowRenderProps) => ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div className={className} style={style} role="list">
      {rows.map((row, index) => (
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
