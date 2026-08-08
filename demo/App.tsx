import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ChecklistProvider,
  ChecklistStore,
  useChecklistState,
  useChecklistStore,
} from "../src/lib";
import { DebugHud } from "./components/DebugHud";
import { EditorText } from "./components/EditorText";
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

/** Live markdown view — subscribes so it stays current while typing. */
function MarkdownPreview() {
  useChecklistState();
  const store = useChecklistStore();
  return <pre className="md-preview">{store.toMarkdown()}</pre>;
}

export default function App() {
  const [showMarkdown, setShowMarkdown] = useState(false);
  const [checklist] = useState(() => new ChecklistStore({ initial: SAMPLE }));
  const dock = useKeyboardDock();
  const shellRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const obs = (vv: VisualViewport | null) => {
      if (!vv) return;

      const height = vv.height + vv.offsetTop;

      const shell = shellRef.current;
      if (!shell || shell.getBoundingClientRect().height === height) return;

      // shell.style.height = height + "px";
    };

    const listener = (e: VisualViewportEventMap["scroll" | "resize"]) => {
      console.log(e);
      obs(e.target as VisualViewport | null);
    };

    window.visualViewport?.addEventListener("scroll", listener);
    window.visualViewport?.addEventListener("resize", listener);
    obs(window.visualViewport);

    return () => {
      window.visualViewport?.removeEventListener("scroll", listener);
      window.visualViewport?.removeEventListener("resize", listener);
    };
  }, []);

  return (
    <ChecklistProvider checklist={checklist}>
      <div className="shell" ref={shellRef}>
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
                  onClick={() =>
                    navigator.clipboard.writeText(checklist.toMarkdown())
                  }
                >
                  Copy MD
                </button>
              </div>
            </header>

            <EditorText />

            <p className="hint">
              Enter → next item · Enter on an empty item → plain text ·
              Backspace at start → merge · tap circle → toggle · paste
              multi-line markdown to import · <code>#&nbsp;</code> at the start
              of a line also makes a heading
            </p>

            {showMarkdown && <MarkdownPreview />}
          </div>
        </div>
        <div
          className={`toolbar-dock${dock.keyboardOpen ? " kb-open" : ""}`}
          ref={dock.ref}
        >
          <EditorToolbar />
        </div>
      </div>
    </ChecklistProvider>
  );
}
