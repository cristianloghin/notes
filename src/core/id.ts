import type { RowId } from "./types";

let counter = 0;

/** Default id factory — used when the host does not inject its own. */
export function defaultGenId(): RowId {
  counter += 1;
  return `r${counter.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
