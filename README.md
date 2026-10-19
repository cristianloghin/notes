# @mikrostack/notes

Structured note editor: a row model (headers, checklist items, text) with a
reducer, a store, a markdown codec, a JSON document codec with fractional sort
keys and per-edit patches, and React bindings.

```bash
npm install @mikrostack/notes
```

React 18 or 19 is a peer dependency. The package ships no CSS; render props on
`Editor` and `Toolbar` let the host app supply its own markup and styles.
`autoFocus` puts the caret in the first row on mount, as the DOM attribute
would, without the host knowing row ids.

```tsx
import { NoteStore, NoteProvider, Editor, Toolbar } from "@mikrostack/notes";

const store = new NoteStore(source);

<NoteProvider store={store}>
  <Toolbar />
  <Editor autoFocus />
</NoteProvider>;
```

## The keyboard

On iOS the soft keyboard shrinks only the visual viewport and pans it; CSS
cannot see it. While an `Editor` is mounted the library publishes the visual
viewport as custom properties on the root — `--note-vv-top`, `--note-vv-left`,
`--note-vv-width`, `--note-vv-height`, `--note-vv-scale` — and sets
`data-note-keyboard` on the root while the keyboard is open. Pin your shell to
that rectangle, contain its scroller's overscroll, and put the toolbar in flow
at the shell's bottom; it then sits on the keyboard with no JavaScript of your
own:

```css
.shell {
  position: fixed;
  top: var(--note-vv-top, 0px);
  left: var(--note-vv-left, 0px);
  width: var(--note-vv-width, 100%);
  height: var(--note-vv-height, 100%);
  display: flex;
  flex-direction: column;
}
.shell .scroller { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
.shell .toolbar { flex: none; padding-bottom: calc(8px + env(safe-area-inset-bottom)); }
:root[data-note-keyboard] .shell .toolbar { padding-bottom: 8px; }
```

The demo's `styles.css` is the reference. The `Editor` reveals the focused
row after it places the caret and after the keyboard has resized the
viewport; `scrollOnFocus={false}` turns both off for a host that owns all
scrolling.

See `docs/note-editor-spec.md` for the editing model and
`docs/architecture.md` for the module boundaries.

## Development

```bash
npm run dev        # demo app at the assigned port
npm test           # vitest
npm run build      # library build to dist/ (tsup)
npm run build:demo # static demo build (vite)
```
