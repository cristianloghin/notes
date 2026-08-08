import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { NoteProvider, NoteStore, serialize, type Row } from "../src";
import { DebugHud } from "./components/DebugHud";
import { EditorText } from "./components/EditorText";
import { EditorToolbar } from "./components/EditorToolbar";
import { actionToWrites, plannerToRows, rowsToPlanner } from "./planner/adapter";
import { SAMPLE_PLANNER, type PlannerItem } from "./planner/data";
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

// The demo's "database": a Planner-shaped list (list_item rows). The note
// is READ from this shape and every edit is SAVED back to it through the
// row-grain adapter — no markdown in between.
const INITIAL_ROWS = plannerToRows(SAMPLE_PLANNER);

/**
 * Lives OUTSIDE the NoteProvider — no store, no context, no subscription.
 * It renders whatever markdown the app hands it; the app's only source for
 * that string is NoteStore's onRowsChange callback, i.e. the exact glue a
 * consumer application would persist from.
 */
function MarkdownPreview({ markdown }: { markdown: string }) {
  return <pre className="md-preview">{markdown}</pre>;
}

/** The Planner-shaped data, as the adapter writes it back. Also outside
    the provider — fed purely by the onRowsChange → adapter pipeline. */
function PlannerPreview({ items }: { items: PlannerItem[] }) {
  return (
    <div>
      <pre className="md-preview">{JSON.stringify(items, null, 2)}</pre>
      <p className="hint">
        Planner list_item shape. personId / dueOn / createdAt are preserved
        by id; new rows get host-minted ids; paragraph rows save as
        unchecked items (Planner Lists have no prose rows).
      </p>
    </div>
  );
}

/** Row-level writes as onAction translates them — newest first. Outside
    the provider like the other consumers: pure adapter output. */
function WritesPreview({ writes }: { writes: string[] }) {
  return (
    <div>
      <pre className="md-preview">
        {writes.length === 0 ? "(no writes yet — edit something)" : writes.join("\n")}
      </pre>
      <p className="hint">
        One edit → targeted row writes via onAction, instead of saving the
        whole list. External pushes never appear here.
      </p>
    </div>
  );
}

export default function App() {
  const [panel, setPanel] = useState<"none" | "md" | "planner" | "writes">(
    "none",
  );
  const [markdown, setMarkdown] = useState(() => serialize(INITIAL_ROWS));
  const [plannerItems, setPlannerItems] = useState(SAMPLE_PLANNER);
  // Latest saved Planner state, so each save can preserve metadata by id.
  const plannerRef = useRef(SAMPLE_PLANNER);
  // The host side of the source channel: the store subscribes at
  // construction, and initial data plus every external update (a partner's
  // edit arriving over realtime) flow through the same push function.
  const pushRef = useRef<((rows: Row[]) => void) | null>(null);
  const [note] = useState(
    () =>
      new NoteStore({
        // The host mints DB-compatible ids for rows created in the editor.
        genId: () => `db-${crypto.randomUUID().slice(0, 8)}`,
        source: (push) => {
          pushRef.current = push;
          push(INITIAL_ROWS); // initial load through the same channel
          return () => {
            pushRef.current = null;
          };
        },
      }),
  );
  // Simulate the partner's device: flip the first item's done state and
  // push it into the store as an external update. preventDefault on
  // pointerdown so the tap itself cannot blur the field — the push landing
  // without stealing your caret is the thing being demonstrated.
  const simulatePartnerEdit = () => {
    const rows = note.getState().rows;
    const first = rows.find((r) => r.type === "item");
    if (!first) return;
    pushRef.current?.(
      rows.map((r) => (r === first ? { ...r, done: !r.done } : r)),
    );
  };
  // Two independent consumers of the same seam: the markdown view and the
  // Planner-shaped "database".
  useEffect(
    () => note.onRowsChange((rows) => setMarkdown(serialize(rows))),
    [note],
  );
  useEffect(
    () =>
      note.onRowsChange((rows) => {
        const next = rowsToPlanner(rows, plannerRef.current);
        plannerRef.current = next;
        setPlannerItems(next);
      }),
    [note],
  );
  // Third consumer: onAction → targeted row writes (newest first, last 12).
  const [writes, setWrites] = useState<string[]>([]);
  useEffect(
    () =>
      note.onAction((action, prevRows, nextRows) => {
        setWrites((w) =>
          [...actionToWrites(action, prevRows, nextRows), ...w].slice(0, 12),
        );
      }),
    [note],
  );
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
                onClick={() => setPanel((p) => (p === "md" ? "none" : "md"))}
              >
                MD
              </button>
              <button
                className="bar-btn"
                onPointerDown={(e) => e.preventDefault()}
                onClick={() =>
                  setPanel((p) => (p === "planner" ? "none" : "planner"))
                }
              >
                Planner
              </button>
              <button
                className="bar-btn"
                onPointerDown={(e) => e.preventDefault()}
                onClick={() =>
                  setPanel((p) => (p === "writes" ? "none" : "writes"))
                }
              >
                Writes
              </button>
              <button
                className="bar-btn"
                onPointerDown={(e) => e.preventDefault()}
                onClick={simulatePartnerEdit}
              >
                Partner
              </button>
              <button
                className="bar-btn"
                onPointerDown={(e) => e.preventDefault()}
                onClick={() =>
                  navigator.clipboard.writeText(serialize(note.getState().rows))
                }
              >
                Copy
              </button>
            </div>
          </header>

          {/* Providers mark the store-connected islands; everything else in
              the app — including the markdown preview below — talks to the
              note only through the instance or its onRowsChange callback. */}
          <NoteProvider store={note}>
            <EditorText />
          </NoteProvider>

          <p className="hint">
            Enter → next item · Enter on an empty item → plain text ·
            Backspace at start → merge · tap circle → toggle · paste
            multi-line markdown to import · <code>#&nbsp;</code> at the start
            of a line also makes a heading
          </p>

          {panel === "md" && <MarkdownPreview markdown={markdown} />}
          {panel === "planner" && <PlannerPreview items={plannerItems} />}
          {panel === "writes" && <WritesPreview writes={writes} />}
        </div>
      </div>
      <div
        className={`toolbar-dock${dock.keyboardOpen ? " kb-open" : ""}`}
        ref={dock.ref}
      >
        <NoteProvider store={note}>
          <EditorToolbar />
        </NoteProvider>
      </div>
    </div>
  );
}
