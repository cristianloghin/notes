import type { RowId } from './types';

let counter = 0;

export function genId(): RowId {
  counter += 1;
  return `r${counter.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
