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

See `docs/note-editor-spec.md` for the editing model and
`docs/architecture.md` for the module boundaries.

## Development

```bash
npm run dev        # demo app at the assigned port
npm test           # vitest
npm run build      # library build to dist/ (tsup)
npm run build:demo # static demo build (vite)
```
