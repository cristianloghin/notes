import { useEffect, useRef, useState } from "react";
import { useChecklist } from "../src/lib";
import { DebugHud } from "./components/DebugHud";
import { EditorToolbar } from "./components/EditorToolbar";
import "./styles.css";

// DEBUG: on-screen event log (visual viewport, scrolls, focus) so a jump on
// device can be attributed to the signal that fired at that moment.
const DEBUG_HUD = false;

/**
 * The layout is fully static (CSS 100dvh shell; the list scrolls in its own
 * container) — JS never sizes or translates the content, which is what made
 * the page jump on focus changes. The ONLY thing that tracks the keyboard
 * is the toolbar dock, and it is positioned imperatively inside the
 * visualViewport event (no React re-render, no frame lag): worst case a
 * viewport flutter twitches the bar, never the content. Safari's own small
 * focus-reveal pan is left alone — it is the desired behavior.
 */
function useKeyboardDock() {
  const ref = useRef<HTMLDivElement>(null);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    const vv = window.visualViewport;
    const el = ref.current;
    if (!vv || !el) return;
    const update = () => {
      // Distance from the layout viewport's bottom edge to the keyboard top.
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      el.style.transform = inset > 0 ? `translateY(-${inset}px)` : "";
      setKeyboardOpen(window.innerHeight - vv.height > 100);
    };
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    update();
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  return { ref, keyboardOpen };
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
    useChecklist({ initial: SAMPLE });
  const dock = useKeyboardDock();

  return (
    <div className="shell">
      {DEBUG_HUD && <DebugHud />}
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
      <div
        className={`toolbar-dock${dock.keyboardOpen ? " kb-open" : ""}`}
        ref={dock.ref}
      >
        <EditorToolbar rows={rows} focus={focus} dispatch={dispatch} />
      </div>
    </div>
  );
}
