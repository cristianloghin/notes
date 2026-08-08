/**
 * Mirrors Planner's ListItem shape (list_item rows, DATA_MODEL Decision 11)
 * closely enough to exercise the row-grain adapter: stable DB ids,
 * per-item assignee and deadline, group membership via a label string
 * (Planner has no header rows), explicit sort order.
 */
export type PlannerItem = {
  id: string;
  title: string;
  done: boolean;
  personId: string | null;
  groupLabel: string | null;
  dueOn: string | null;
  sortOrder: number;
  createdAt: string;
};

export const SAMPLE_PLANNER: PlannerItem[] = [
  {
    id: "db-9f21",
    title: "Call the plumber",
    done: false,
    personId: "cris",
    groupLabel: null,
    dueOn: "2026-08-10",
    sortOrder: 0,
    createdAt: "2026-08-01T09:00:00Z",
  },
  {
    id: "db-4c88",
    title: "screws",
    done: false,
    personId: null,
    groupLabel: "Hardware",
    dueOn: null,
    sortOrder: 1,
    createdAt: "2026-08-01T09:01:00Z",
  },
  {
    id: "db-b3e7",
    title: "hinges",
    done: true,
    personId: "ana",
    groupLabel: "Hardware",
    dueOn: null,
    sortOrder: 2,
    createdAt: "2026-08-01T09:02:00Z",
  },
  {
    id: "db-77d0",
    title: "wood glue",
    done: false,
    personId: null,
    groupLabel: "Hardware",
    dueOn: null,
    sortOrder: 3,
    createdAt: "2026-08-01T09:03:00Z",
  },
  {
    id: "db-1a5c",
    title: "primer",
    done: false,
    personId: "cris",
    groupLabel: "Paint",
    dueOn: "2026-08-15",
    sortOrder: 4,
    createdAt: "2026-08-01T09:04:00Z",
  },
  {
    id: "db-e942",
    title: "rollers",
    done: false,
    personId: null,
    groupLabel: "Paint",
    dueOn: null,
    sortOrder: 5,
    createdAt: "2026-08-01T09:05:00Z",
  },
];
