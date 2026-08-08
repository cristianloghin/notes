// Public surface of the library (architecture.md §3). Everything else in
// this directory is an implementation detail — consumers, including the
// demo, import only from here.
export { NoteStore, type NoteSource } from "./core/store";
export { NoteProvider, useNote } from "./react/context";
export { useOnRowsChange, useOnAction } from "./react/hooks";
export {
  Editor,
  type EditorRowRenderProps,
  type FieldProps,
  type CheckboxProps,
} from "./react/Editor";
export { Toolbar, type ToolbarRenderProps } from "./react/Toolbar";
export { parseMarkdown, serialize } from "./core/markdown";
export type {
  Row,
  RowId,
  GenId,
  HeaderRow,
  ItemRow,
  TextRow,
  Caret,
  State,
  Action,
} from "./core/types";
