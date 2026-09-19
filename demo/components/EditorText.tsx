import { Editor } from "../../src";

export const EditorText = () => {
  return (
    <Editor className="editor" autoFocus>
      {({ row, fieldProps, checkboxProps }) =>
        row.type === "header" ? (
          <div className="row row-header" key={row.id} role="listitem">
            <textarea
              className="field field-header"
              aria-label="Section header"
              {...fieldProps}
            />
          </div>
        ) : row.type === "text" ? (
          <div className="row row-text" key={row.id} role="listitem">
            <textarea
              className="field field-text"
              aria-label="Paragraph"
              {...fieldProps}
            />
          </div>
        ) : (
          <div
            className={`row row-item${row.done ? " is-done" : ""}`}
            key={row.id}
            role="listitem"
          >
            <button
              className="check"
              aria-label={row.done ? "Mark not done" : "Mark done"}
              aria-pressed={row.done}
              {...checkboxProps}
            >
              {row.done ? (
                <svg
                  viewBox="0 0 16 16"
                  width="12"
                  height="12"
                  aria-hidden="true"
                >
                  <path
                    d="M2.5 8.5l3.5 3.5 7-8"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : null}
            </button>
            <textarea
              className="field field-item"
              aria-label="Checklist item"
              {...fieldProps}
            />
          </div>
        )
      }
    </Editor>
  );
};
