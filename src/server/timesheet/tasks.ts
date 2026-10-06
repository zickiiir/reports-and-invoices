import { type PersonTimesheet, type TimesheetEntryRow } from "./parse";

interface TimeTotals {
  minutes: number;
  /** How many timesheet entries were summed into this row. */
  entries: number;
  firstDate: string;
  lastDate: string;
}

/** One distinct set of description sub-lines within a task (e.g. `#101 Nový e-shop`). */
export interface TaskDetail extends TimeTotals {
  /** Sub-lines of the entry without their leading dash; empty = the entry had none. */
  lines: string[];
}

export interface TaskSummary extends TimeTotals {
  alias: string;
  /** The task title as first written in the timesheet (first description line). */
  task: string;
  /** Breakdown by sub-lines, largest first. An entry's time isn't split between its
   * sub-lines — an entry with two sub-lines is one detail row with both of them. */
  details: TaskDetail[];
}

/** Placeholder title for entries without any description (e.g. a bare minutes line). */
export const UNTITLED_TASK = "(bez popisu)";

/** Rows are matched case- and whitespace-insensitively — the same task written on
 * different days as "Oprava exportu" / "oprava  exportu" should add up. */
function normalize(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLocaleLowerCase("cs");
}

/** Sub-lines keep a dash after parsing when written as `-- …` (see
 * `stripDescriptionDash` in parse.ts) — irrelevant for the summary. */
function cleanSubLine(line: string): string {
  return line.replace(/^-\s*/, "").trim();
}

function addEntry(totals: TimeTotals, entry: TimesheetEntryRow) {
  totals.minutes += entry.minutes;
  totals.entries += 1;
  if (entry.date < totals.firstDate) totals.firstDate = entry.date;
  if (entry.date > totals.lastDate) totals.lastDate = entry.date;
}

function emptyTotals(entry: TimesheetEntryRow): TimeTotals {
  return { minutes: 0, entries: 0, firstDate: entry.date, lastDate: entry.date };
}

const byMinutesDesc = (a: TimeTotals, b: TimeTotals) => b.minutes - a.minutes;

/** Sums the minutes spent on each task (first description line) per customer alias,
 * with a breakdown by the remaining description lines, sorted by time spent. */
export function summarizeTasks(perPerson: PersonTimesheet[]): TaskSummary[] {
  const tasks = new Map<string, TaskSummary & { detailMap: Map<string, TaskDetail> }>();
  for (const person of perPerson) {
    for (const entry of person.entries) {
      const rawTitle = entry.description[0]?.trim() ?? "";
      const title = rawTitle === "" ? UNTITLED_TASK : rawTitle;
      const taskKey = `${person.alias}\u0000${normalize(title)}`;
      let task = tasks.get(taskKey);
      if (!task) {
        task = {
          ...emptyTotals(entry),
          alias: person.alias,
          task: title,
          details: [],
          detailMap: new Map(),
        };
        tasks.set(taskKey, task);
      }
      addEntry(task, entry);

      const lines = entry.description.slice(1).map(cleanSubLine).filter(Boolean);
      const detailKey = lines.map(normalize).join("\u0000");
      let detail = task.detailMap.get(detailKey);
      if (!detail) {
        detail = { ...emptyTotals(entry), lines };
        task.detailMap.set(detailKey, detail);
      }
      addEntry(detail, entry);
    }
  }
  return [...tasks.values()]
    .map(({ detailMap, ...task }) => ({
      ...task,
      details: [...detailMap.values()].sort(byMinutesDesc),
    }))
    .sort(
      (a, b) =>
        byMinutesDesc(a, b) ||
        a.alias.localeCompare(b.alias) ||
        a.task.localeCompare(b.task, "cs"),
    );
}

/** An entry listing several sub-lines — the timesheet doesn't say how its time was
 * split between them, so it can't be attributed to any one of them automatically. */
export interface SharedEntry {
  date: string;
  /** 1-based line in the timesheet, for finding the entry and splitting it by hand. */
  line: number;
  minutes: number;
  /** The entry's other sub-lines. */
  otherLines: string[];
}

/** One description sub-line (typically a ticket, e.g. `#101 Nový e-shop`) summed
 * across all entries of a customer, regardless of which task it was written under. */
export interface SubTaskSummary extends TimeTotals {
  alias: string;
  line: string;
  /** Titles of the tasks it appeared under, in order of first appearance. */
  tasks: string[];
  /** Entries listing other sub-lines too — NOT included in `minutes`/`entries`, which
   * only count entries where this sub-line is the only one. The date range covers both. */
  shared: SharedEntry[];
  /** `alias:idx` of every entry it appears in (shared or not) — for a grand total that
   * counts a shared entry only once (see `totalMinutesOfSubTasks`). */
  entryKeys: string[];
}

export function summarizeSubTasks(perPerson: PersonTimesheet[]): SubTaskSummary[] {
  const rows = new Map<string, SubTaskSummary>();
  for (const person of perPerson) {
    for (const entry of person.entries) {
      const rawTitle = entry.description[0]?.trim() ?? "";
      const title = rawTitle === "" ? UNTITLED_TASK : rawTitle;
      const lines = entry.description.slice(1).map(cleanSubLine).filter(Boolean);
      // The same sub-line written twice in one entry must not count its time twice.
      const unique = new Map(lines.map((l) => [normalize(l), l]));
      for (const [key, line] of unique) {
        const rowKey = `${person.alias}\u0000${key}`;
        let row = rows.get(rowKey);
        if (!row) {
          row = {
            ...emptyTotals(entry),
            alias: person.alias,
            line,
            tasks: [],
            shared: [],
            entryKeys: [],
          };
          rows.set(rowKey, row);
        }
        if (unique.size > 1) {
          row.shared.push({
            date: entry.date,
            line: entry.line,
            minutes: entry.minutes,
            otherLines: [...unique].filter(([k]) => k !== key).map(([, l]) => l),
          });
          if (entry.date < row.firstDate) row.firstDate = entry.date;
          if (entry.date > row.lastDate) row.lastDate = entry.date;
        } else {
          addEntry(row, entry);
        }
        if (!row.tasks.some((t) => normalize(t) === normalize(title))) row.tasks.push(title);
        row.entryKeys.push(`${person.alias}:${entry.idx}`);
      }
    }
  }
  const sharedMinutes = (r: SubTaskSummary) =>
    r.shared.reduce((sum, s) => sum + s.minutes, 0);
  return [...rows.values()].sort(
    (a, b) =>
      byMinutesDesc(a, b) ||
      sharedMinutes(b) - sharedMinutes(a) ||
      a.alias.localeCompare(b.alias) ||
      a.line.localeCompare(b.line, "cs"),
  );
}

/** Total time of the given sub-task rows including their shared entries, counting an
 * entry shared by several of them only once. */
export function totalMinutesOfSubTasks(
  rows: SubTaskSummary[],
  perPerson: PersonTimesheet[],
): number {
  const minutesByKey = new Map(
    perPerson.flatMap((p) => p.entries.map((e) => [`${p.alias}:${e.idx}`, e.minutes])),
  );
  const keys = new Set(rows.flatMap((r) => r.entryKeys));
  return [...keys].reduce((sum, k) => sum + (minutesByKey.get(k) ?? 0), 0);
}
