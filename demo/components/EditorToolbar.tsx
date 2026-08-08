import { Action, Caret, Row, Toolbar } from "../../src/lib";

/* Accessory toolbar, rendered inside the fixed .toolbar-dock (App.tsx),
  which is the only keyboard-tracking element in the layout. The Toolbar
  component owns the pointerdown guard (spec §6); this render prop owns
  all presentation. */

export const EditorToolbar = ({
  rows,
  focus,
  dispatch,
}: {
  rows: Row[];
  focus: Caret | null;
  dispatch: (action: Action) => void;
}) => {
  return (
    <Toolbar rows={rows} focus={focus} dispatch={dispatch} className="toolbar">
      {({ activeRow, canMoveUp, canMoveDown, setRowType, moveRow }) => (
        <div className="toolbar-inner">
          <div className="tb-seg" role="group" aria-label="Row type">
            <button
              className={`tb-btn tb-heading${activeRow?.type === "header" ? " is-on" : ""}`}
              disabled={!activeRow}
              aria-pressed={activeRow?.type === "header"}
              aria-label="Heading"
              onClick={() => setRowType("header")}
            >
              <span className="tb-heading-glyph">H</span>
            </button>
            <button
              className={`tb-btn${activeRow?.type === "item" ? " is-on" : ""}`}
              disabled={!activeRow}
              aria-pressed={activeRow?.type === "item"}
              aria-label="List item"
              onClick={() => setRowType("item")}
            >
              <svg
                viewBox="0 0 16 16"
                width="17"
                height="17"
                aria-hidden="true"
              >
                <circle
                  cx="8"
                  cy="8"
                  r="6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                />
                <path
                  d="M5.2 8.3l2 2 3.6-4.2"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <button
              className={`tb-btn${activeRow?.type === "text" ? " is-on" : ""}`}
              disabled={!activeRow}
              aria-pressed={activeRow?.type === "text"}
              aria-label="Plain text"
              onClick={() => setRowType("text")}
            >
              <span className="tb-heading-glyph">¶</span>
            </button>
          </div>
          <div className="tb-spacer" />
          <button
            className="tb-btn"
            disabled={!canMoveUp}
            aria-label="Move row up"
            onClick={() => moveRow(-1)}
          >
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
              <path
                d="M8 13V3M3.5 7.5L8 3l4.5 4.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <button
            className="tb-btn"
            disabled={!canMoveDown}
            aria-label="Move row down"
            onClick={() => moveRow(1)}
          >
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
              <path
                d="M8 3v10M3.5 8.5L8 13l4.5-4.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      )}
    </Toolbar>
  );
};
