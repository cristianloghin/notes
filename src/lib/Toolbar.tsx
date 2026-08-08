import type { CSSProperties, ReactNode } from 'react';
import type { Action, Caret, Row } from './types';

export type ToolbarRenderProps = {
  /** Row the caret is on, or null before the first focus. */
  activeRow: Row | null;
  /** Index of the active row in rows, or -1. */
  activeIndex: number;
  rowCount: number;
  canMoveUp: boolean;
  canMoveDown: boolean;
  /** Convert the active row to the given type. No-op if already that type. */
  setRowType: (rowType: Row['type']) => void;
  /** Move the active row one position up (-1) or down (1). */
  moveRow: (delta: -1 | 1) => void;
};

/**
 * Headless toolbar: derives the command surface from editor state and hands
 * it to a render-prop child, which owns all presentation. The wrapper div
 * calls preventDefault on pointerdown (spec §6) so no tap inside the bar —
 * buttons, disabled buttons, or gaps — blurs the active field or drops the
 * soft keyboard.
 */
export function Toolbar({
  rows,
  focus,
  dispatch,
  children,
  className,
  style,
}: {
  rows: Row[];
  focus: Caret | null;
  dispatch: (action: Action) => void;
  children: (props: ToolbarRenderProps) => ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const activeIndex = focus ? rows.findIndex((r) => r.id === focus.id) : -1;
  const activeRow = activeIndex >= 0 ? rows[activeIndex] : null;

  const setRowType = (rowType: Row['type']) => {
    if (activeRow && activeRow.type !== rowType) {
      dispatch({ type: 'setRowType', id: activeRow.id, rowType });
    }
  };
  const moveRow = (delta: -1 | 1) => {
    if (activeRow) {
      dispatch({ type: 'move', id: activeRow.id, toIndex: activeIndex + delta });
    }
  };

  return (
    <div className={className} style={style} onPointerDown={(e) => e.preventDefault()}>
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
