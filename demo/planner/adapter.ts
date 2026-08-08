import type { Action, Row } from "../../src";
import type { PlannerItem } from "./data";

/**
 * Row-grain adapter between Planner's list_item shape and Notes rows —
 * HOST code, exactly what the Planner app would own (architecture.md §4).
 * Never goes through markdown: ids and per-item metadata must survive.
 *
 * Mapping:
 * - Planner groupLabel boundaries → header rows (synthesized ids; headers
 *   are not list items in Planner).
 * - Notes item rows → list items; id is the Planner id (new rows carry
 *   host-minted ids via NoteStore's genId).
 * - Metadata the editor doesn't model (personId, dueOn, createdAt) is
 *   preserved across edits by item id.
 * - KNOWN LOSSY: paragraph rows save as unchecked items — Planner Lists
 *   have no prose rows. A real adapter must decide: forbid text rows in
 *   list mode, or extend Planner's schema.
 */

export function plannerToRows(items: PlannerItem[]): Row[] {
  const sorted = [...items].sort((a, b) => a.sortOrder - b.sortOrder);
  const rows: Row[] = [];
  let currentGroup: string | null = null;
  for (const item of sorted) {
    if (item.groupLabel !== currentGroup) {
      currentGroup = item.groupLabel;
      if (item.groupLabel != null) {
        rows.push({
          id: `group:${item.groupLabel}`,
          type: "header",
          text: item.groupLabel,
        });
      }
    }
    rows.push({ id: item.id, type: "item", text: item.title, done: item.done });
  }
  return rows;
}

/**
 * onAction → targeted pseudo-writes: what Planner's write queue would
 * enqueue for one edit, instead of saving the whole list. Handles the
 * common actions precisely; structural edits it doesn't model fall back
 * to a full resync marker.
 */
export function actionToWrites(
  action: Action,
  prevRows: Row[],
  nextRows: Row[],
): string[] {
  switch (action.type) {
    case "toggleDone": {
      const row = nextRows.find((r) => r.id === action.id);
      if (row?.type !== "item") break;
      return [
        `UPDATE list_item SET done = ${row.done} WHERE id = '${row.id}'`,
      ];
    }
    case "setText":
    case "promoteHeader": {
      const row = nextRows.find((r) => r.id === action.id);
      if (!row) break;
      return [
        `UPDATE list_item SET title = '${row.text}' WHERE id = '${row.id}'`,
      ];
    }
    case "split": {
      const prevIds = new Set(prevRows.map((r) => r.id));
      const minted = nextRows.find((r) => !prevIds.has(r.id));
      if (!minted) break; // double-Enter converts in place, no insert
      const at = nextRows.indexOf(minted);
      return [
        `INSERT INTO list_item (id, title, sort_order) VALUES ('${minted.id}', '${minted.text}', ${at})`,
      ];
    }
    case "mergeBackward":
    case "remove": {
      const nextIds = new Set(nextRows.map((r) => r.id));
      const gone = prevRows.filter((r) => !nextIds.has(r.id));
      return gone.map((r) => `DELETE FROM list_item WHERE id = '${r.id}'`);
    }
    case "move":
      return [`UPDATE list_item SET sort_order = … (reorder around '${action.id}')`];
  }
  return [`-- ${action.type}: full-list resync`];
}

export function rowsToPlanner(
  rows: Row[],
  previous: PlannerItem[],
): PlannerItem[] {
  const prevById = new Map(previous.map((i) => [i.id, i]));
  const items: PlannerItem[] = [];
  let group: string | null = null;
  let sortOrder = 0;
  for (const row of rows) {
    if (row.type === "header") {
      group = row.text === "" ? null : row.text;
      continue;
    }
    const prev = prevById.get(row.id);
    items.push({
      id: row.id,
      title: row.text,
      done: row.type === "item" ? row.done : false,
      personId: prev?.personId ?? null,
      dueOn: prev?.dueOn ?? null,
      createdAt: prev?.createdAt ?? new Date().toISOString(),
      groupLabel: group,
      sortOrder: sortOrder++,
    });
  }
  return items;
}
