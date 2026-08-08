import type { CSSProperties, ReactNode } from "react";
import { useNote } from "./context";
import type { Row } from "./types";

export type ToolbarRenderProps = {
  /** Row the caret is on, or null before the first focus. */
  activeRow: Row | null;
  /** Index of the active row in rows, or -1. */
  activeIndex: number;
  rowCount: number;
  canMoveUp: boolean;
  canMoveDown: boolean;
  /** Convert the active row to the given type. No-op if already that type. */
  setRowType: (rowType: Row["type"]) => void;
  /** Move the active row one position up (-1) or down (1). */
  moveRow: (delta: -1 | 1) => void;
};

/**
 * Headless toolbar. Reads the store from NoteProvider's context — no props
 * to thread — and derives the command surface for a render-prop child, which
 * owns all presentation. The wrapper div calls preventDefault on
 * pointerdown (spec §6) so no tap inside the bar — buttons, disabled
 * buttons, or gaps — blurs the active field or drops the soft keyboard.
 */
export function Toolbar({
  children,
  className,
  style,
}: {
  children: (props: ToolbarRenderProps) => ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const { store, state } = useNote();
  const { rows, focus } = state;

  const activeIndex = focus ? rows.findIndex((r) => r.id === focus.id) : -1;
  const activeRow = activeIndex >= 0 ? rows[activeIndex] : null;

  const setRowType = (rowType: Row["type"]) => {
    if (activeRow && activeRow.type !== rowType) {
      store.dispatch({ type: "setRowType", id: activeRow.id, rowType });
    }
  };
  const moveRow = (delta: -1 | 1) => {
    if (activeRow) {
      store.dispatch({
        type: "move",
        id: activeRow.id,
        toIndex: activeIndex + delta,
      });
    }
  };

  return (
    <div
      className={className}
      style={style}
      onPointerDown={(e) => e.preventDefault()}
    >
      {children({
        activeRow,
        activeIndex,
        rowCount: rows.length,
        canMoveUp: activeIndex > 0,
        canMoveDown: activeIndex >= 0 && activeIndex < rows.length - 1,
        setRowType,
        moveRow,
      })}
    </div>
  );
}
