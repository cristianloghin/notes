// Public surface of the library (architecture.md §3). Everything else in
// this directory is an implementation detail — consumers, including the
// demo, import only from here.
export { NoteStore } from "./core/store";
export { NoteProvider, useNote } from "./react/context";
export {
  Editor,
  type EditorRowRenderProps,
  type FieldProps,
  type CheckboxProps,
} from "./react/Editor";
export { Toolbar, type ToolbarRenderProps } from "./react/Toolbar";
export { reducer, createInitialState } from "./core/reducer";
export { parseMarkdown, serialize } from "./core/markdown";
export type {
  Row,
  RowId,
  HeaderRow,
  ItemRow,
  TextRow,
  Caret,
  State,
  Action,
} from "./core/types";
