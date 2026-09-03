import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  mergeDoc,
  NoteProvider,
  parseDoc,
  serialize,
  serializeDoc,
  useNote,
  useNoteStore,
  useOnAction,
  useOnRowsChange,
  type NoteDoc,
  type NotePatch,
  type SerializeOptions,
} from "../src";
import { DebugHud } from "./components/DebugHud";
import { EditorText } from "./components/EditorText";
import { EditorToolbar } from "./components/EditorToolbar";
import { actionToWrites, plannerToRows, rowsToPlanner } from "./planner/adapter";
import { SAMPLE_PLANNER, type PlannerItem } from "./planner/data";
import { actionToPatch } from "./storage/patch";
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

// The same note in the JSON storage shape. Everything after this point is
// reached by merging patches into it — the document is never re-serialized.
const INITIAL_DOC = serializeDoc(INITIAL_ROWS);

type Stored = { doc: NoteDoc; patches: NotePatch[] };

/**
 * Live document VIEW — derives from the subscribed state, so it reflects
 * everything, including external pushes. Rendered inside a provider
 * island, unlike the persistence panels below.
 */
function MarkdownPreview() {
  const { state } = useNote();
  return <pre className="md-preview">{serialize(state.rows)}</pre>;
}

/** The Planner-shaped data, as the adapter SAVES it back — a persistence
    view fed by the useOnRowsChange seam, outside any provider. Partner
    pushes deliberately do not appear here: they came from the backend,
    so there is nothing to save. */
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

/**
 * The JSON storage shape, and the override stream that produced it. Lives
 * inside a provider island so it can check its own work: if merging the
 * patches alone reproduces the editor's rows, the incremental write path
 * is correct and nothing ever had to clone the note.
 */
function DocPreview({
  stored,
  deletes,
  onDeletes,
}: {
  stored: Stored;
  deletes: NonNullable<SerializeOptions["deletes"]>;
  onDeletes: (next: NonNullable<SerializeOptions["deletes"]>) => void;
}) {
  const { state } = useNote();
  const inSync =
    JSON.stringify(parseDoc(stored.doc)) === JSON.stringify(state.rows);
  const ghosts = Object.keys(stored.doc.attrs?.deleted ?? {}).length;
  const kept = Object.keys(stored.doc.rows).length;
  return (
    <div>
      <p className={inSync ? "sync-ok" : "sync-off"}>
        {inSync
          ? "merging patches alone reconstructs the editor exactly"
          : "diverged — a partner push is not an edit, so it emits no patch"}
      </p>
      <div className="doc-modes">
        {(["tombstone", "drop"] as const).map((mode) => (
          <button
            key={mode}
            className={`bar-btn${deletes === mode ? " is-on" : ""}`}
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => onDeletes(mode)}
          >
            {mode}
          </button>
        ))}
        <span className="doc-count">
          {kept} stored · {state.rows.length} visible · {ghosts} ghost
          {ghosts === 1 ? "" : "s"}
        </span>
      </div>
      <pre className="md-preview">{JSON.stringify(stored.doc, null, 2)}</pre>
      <p className="hint">
        Content in <code>rows</code>, checkbox state in{" "}
        <code>attrs.done</code>, order in each row's <code>sort</code> key —
        so there is no positional array and every edit below is a plain JSON
        merge patch.
      </p>
      <pre className="md-preview">
        {stored.patches.length === 0
          ? "(no patches yet — edit something)"
          : stored.patches.map((p) => JSON.stringify(p)).join("\n\n")}
      </pre>
      <p className="hint">
        One edit → one override, newest first. Ticking a box names only that
        box; inserting a row mints one sort key and leaves its neighbours
        alone. Under <code>tombstone</code> a deleted row is kept and marked,
        so a patch written against it still lands; under <code>drop</code> it
        is nulled outright — safe only while nothing can reference it, which
        is what keeps a note being drafted free of ghosts. Press Enter and
        backspace it away a few times under each to see the difference.
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
  const [panel, setPanel] = useState<
    "none" | "md" | "planner" | "writes" | "doc"
  >("none");
  // Whether a removed row is kept and marked, or nulled outright. The host
  // owns this: only it knows whether any patch could reference the row.
  const [deletes, setDeletes] =
    useState<NonNullable<SerializeOptions["deletes"]>>("tombstone");
  // Store lifetime is this component's; disposal is the hook's job.
  // The host mints DB-compatible ids for rows created in the editor.
  // NOT crypto.randomUUID: that API exists only in secure contexts
  // (HTTPS/localhost) — on a LAN-IP dev URL (phone testing) it is
  // undefined and every id-minting edit (Enter!) would throw.
  const note = useNoteStore({
    initial: INITIAL_ROWS,
    genId: () => `db-${Math.random().toString(36).slice(2, 10)}`,
  });
  // Simulate the partner's device: flip the first item's done state and
  // apply it as an external update. preventDefault on pointerdown so the
  // tap itself cannot blur the field — the push landing without stealing
  // your caret is the thing being demonstrated. (A real host would
  // note.connect() its realtime feed; the button plays that role here.)
  const simulatePartnerEdit = () => {
    const rows = note.getState().rows;
    const first = rows.find((r) => r.type === "item");
    if (!first) return;
    note.applyExternal(
      rows.map((r) => (r === first ? { ...r, done: !r.done } : r)),
    );
  };
  // Persistence consumers of the edits-out seam, as client-shaped React
  // state: the Planner "database" (previous value carries the metadata to
  // preserve) and the targeted-writes log.
  const plannerItems = useOnRowsChange<PlannerItem[]>(
    note,
    (rows, previous) => rowsToPlanner(rows, previous),
    SAMPLE_PLANNER,
  );
  // The stored document, maintained by merging one override per edit.
  const stored = useOnAction<Stored>(
    note,
    (previous, action, prevRows, nextRows) => {
      const patch = actionToPatch(action, prevRows, nextRows, previous.doc, {
        deletes,
      });
      return {
        doc: mergeDoc(previous.doc, patch),
        patches: [patch, ...previous.patches].slice(0, 6),
      };
    },
    { doc: INITIAL_DOC, patches: [] },
  );
  const writes = useOnAction<string[]>(
    note,
    (previous, action, prevRows, nextRows) =>
      [...actionToWrites(action, prevRows, nextRows), ...previous].slice(0, 12),
    [],
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
            <h1>Notes POC</h1>
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
                onClick={() => setPanel((p) => (p === "doc" ? "none" : "doc"))}
              >
                JSON
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
                  // clipboard API is also secure-context-only; no-op on LAN http
                  navigator.clipboard?.writeText(serialize(note.getState().rows))
                }
              >
                Copy
              </button>
            </div>
          </header>

          {/* Providers mark the store-connected islands (editor, toolbar,
              and the MD document view); the persistence panels below talk
              to the note only through its edits-out seam. */}
          <NoteProvider store={note}>
            <EditorText />
          </NoteProvider>

          <p className="hint">
            Enter → next item · Enter on an empty item → plain text ·
            Backspace at start → merge · tap circle → toggle · paste
            multi-line markdown to import · <code>#&nbsp;</code> at the start
            of a line also makes a heading
          </p>

          {panel === "md" && (
            <NoteProvider store={note}>
              <MarkdownPreview />
            </NoteProvider>
          )}
          {panel === "planner" && <PlannerPreview items={plannerItems} />}
          {panel === "writes" && <WritesPreview writes={writes} />}
          {panel === "doc" && (
            <NoteProvider store={note}>
              <DocPreview
                stored={stored}
                deletes={deletes}
                onDeletes={setDeletes}
              />
            </NoteProvider>
          )}
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
