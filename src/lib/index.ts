// Public surface of the library (architecture.md §3). Everything else in
// this directory is an implementation detail — consumers, including the
// demo, import only from here.
export { useChecklist } from './useChecklist';
export {
  Editor,
  type EditorRowRenderProps,
  type FieldProps,
  type CheckboxProps,
} from './Editor';
export { Toolbar, type ToolbarRenderProps } from './Toolbar';
export { reducer, createInitialState } from './reducer';
export { parseMarkdown, serialize } from './markdown';
export type {
  Row,
  RowId,
  HeaderRow,
  ItemRow,
  TextRow,
  Caret,
  State,
  Action,
} from './types';
