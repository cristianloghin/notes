import { useEffect, useState } from "react";
import { useChecklist } from "../src/lib";
import { EditorToolbar } from "./components/EditorToolbar";
import "./styles.css";

// DEBUG: disables every scroll our code initiates — the hook's
// focused-row reveal (scrollOnFocus: false) and the page-scroll pinning in
// useVisualViewportBox. With this true, any remaining jump is Safari's own
// behavior, not ours. Flip back to false after testing.
const DISABLE_APP_SCROLL = true;

/**
 * Track the visual viewport so the app shell can be sized to exactly the
 * on-screen area above the soft keyboard. The page itself never scrolls
 * (body is overflow: hidden); the list scrolls inside the shell instead,
 * so the toolbar — a normal flex child at the shell's bottom — cannot
 * drift while scrolling. Fixed-position chasing of the keyboard is what
 * causes the iOS "swimming toolbar"; this avoids it entirely.
 */
function useVisualViewportBox() {
  const [box, setBox] = useState(() => ({
    height: window.innerHeight,
    offsetTop: 0,
    keyboardOpen: false,
  }));
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      // iOS "reveals" a newly focused field by scrolling the visual (and
      // sometimes the layout) viewport, then often snaps back — even though
      // this page has nothing to scroll. If the shell chases those nudges
      // through React state it reacts a frame late and visibly jumps on
      // every tap into a row. Pin the page scroll synchronously inside the
      // event instead, then read the viewport.
      if (
        !DISABLE_APP_SCROLL &&
        (window.scrollX !== 0 || window.scrollY !== 0)
      ) {
        window.scrollTo(0, 0);
      }
      setBox((prev) => {
        const next = {
          height: vv.height,
          offsetTop: vv.offsetTop,
          keyboardOpen: window.innerHeight - vv.height > 100,
        };
        return prev.height === next.height &&
          prev.offsetTop === next.offsetTop &&
          prev.keyboardOpen === next.keyboardOpen
          ? prev
          : next;
      });
    };
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    window.addEventListener("scroll", update);
    update();
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      window.removeEventListener("scroll", update);
    };
  }, []);
  return box;
}

const SAMPLE = `# Hardware
Check the garage before buying any of this.
- [ ] screws
- [x] hinges
- [ ] wood glue

# Paint
- [ ] primer
- [ ] rollers
Ask at the store which primer works on old plaster.`;

export default function App() {
  const [showMarkdown, setShowMarkdown] = useState(false);
  const { rows, focus, dispatch, getRowProps, getCheckboxProps, toMarkdown } =
    useChecklist({ initial: SAMPLE, scrollOnFocus: !DISABLE_APP_SCROLL });
  const viewport = useVisualViewportBox();

  // Safari's native "reveal focused field" scroll is suppressed by the
  // opacity blink in the library, so the app owns the one legitimate case:
  // when the keyboard opens, the shell shrinks — bring the focused row back
  // into view inside the scroll area.
  useEffect(() => {
    if (DISABLE_APP_SCROLL || !viewport.keyboardOpen) return;
    const el = document.activeElement;
    if (el instanceof HTMLElement) el.scrollIntoView({ block: "nearest" });
  }, [viewport.keyboardOpen]);

  return (
    <div
      className={`shell${viewport.keyboardOpen ? " kb-open" : ""}`}
      style={{
        height: viewport.height,
        transform: `translateY(${viewport.offsetTop}px)`,
      }}
    >
      <div className="scroll-area">
        <div className="app">
          <header className="topbar">
            <h1>Checklist POC</h1>
            <div className="topbar-actions">
              <button
                className="bar-btn"
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => setShowMarkdown((v) => !v)}
              >
                {showMarkdown ? "Hide MD" : "Show MD"}
              </button>
              <button
                className="bar-btn"
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => navigator.clipboard.writeText(toMarkdown())}
              >
                Copy MD
              </button>
            </div>
          </header>

          <div className="editor" role="list">
            {rows.map((row) =>
              row.type === "header" ? (
                <div className="row row-header" key={row.id} role="listitem">
                  <textarea
                    className="field field-header"
                    aria-label="Section header"
                    {...getRowProps(row.id)}
                  />
                </div>
              ) : row.type === "text" ? (
                <div className="row row-text" key={row.id} role="listitem">
                  <textarea
                    className="field field-text"
                    aria-label="Paragraph"
                    {...getRowProps(row.id)}
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
                    {...getCheckboxProps(row.id)}
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
                    {...getRowProps(row.id)}
                  />
                </div>
              ),
            )}
          </div>

          <p className="hint">
            Enter → next item · Enter on an empty item → plain text · Backspace
            at start → merge · tap circle → toggle · paste multi-line markdown
            to import · <code>#&nbsp;</code> at the start of a line also makes a
            heading
          </p>

          {showMarkdown && <pre className="md-preview">{toMarkdown()}</pre>}
        </div>
      </div>
      <EditorToolbar rows={rows} focus={focus} dispatch={dispatch} />
    </div>
  );
}
