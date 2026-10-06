import { describe, expect, it } from "vitest";

import { parseTimesheet } from "./parse";
import {
  summarizeSubTasks,
  summarizeTasks,
  totalMinutesOfSubTasks,
  UNTITLED_TASK,
} from "./tasks";

const SAMPLE = `1.7.2026
ACME
9:00
- Oprava exportu
- detail podúkolu
11:00
- Code review
11:30
2.7.
ACME
8:00
-   oprava  EXPORTU
9:30
BETA
- Oprava exportu
10:00
3.7.
ACME
45
`;

describe("summarizeTasks", () => {
  const tasks = summarizeTasks(parseTimesheet(SAMPLE, "202607").perPerson);

  it("sums the same task across days, ignoring case and extra whitespace", () => {
    const fix = tasks.find((t) => t.alias === "ACME" && t.task === "Oprava exportu");
    expect(fix).toMatchObject({
      minutes: 210,
      entries: 2,
      firstDate: "2026-07-01",
      lastDate: "2026-07-02",
    });
  });

  it("keeps the same task title separate per customer", () => {
    const beta = tasks.find((t) => t.alias === "BETA");
    expect(beta).toMatchObject({ task: "Oprava exportu", minutes: 30 });
  });

  it("groups entries without a description under a placeholder title", () => {
    const untitled = tasks.find((t) => t.task === UNTITLED_TASK);
    expect(untitled).toMatchObject({ alias: "ACME", minutes: 45 });
  });

  it("sorts by time spent, largest first", () => {
    expect(tasks.map((t) => t.minutes)).toEqual([210, 45, 30, 30]);
  });
});

describe("summarizeTasks details", () => {
  const tasks = summarizeTasks(
    parseTimesheet(
      `1.9.2026
ACME
9:00
- Údržba
-- #101 Nový e-shop
12:30
13:30
- Údržba
-- #101 nový  e-shop
18:00
2.9.
ACME
9:00
- Údržba
-- #102 Oprava košíku
10:00
- Údržba
11:00
`,
      "202609",
    ).perPerson,
  );
  const servis = tasks.find((t) => t.task === "Údržba")!;

  it("sums the whole task across all its sub-lines", () => {
    expect(servis).toMatchObject({ minutes: 600, entries: 4 });
  });

  it("breaks the task down by sub-lines, without the leading dash", () => {
    expect(
      servis.details.map((d) => ({ lines: d.lines, minutes: d.minutes, entries: d.entries })),
    ).toEqual([
      { lines: ["#101 Nový e-shop"], minutes: 480, entries: 2 },
      { lines: ["#102 Oprava košíku"], minutes: 60, entries: 1 },
      { lines: [], minutes: 60, entries: 1 },
    ]);
  });
});

describe("summarizeSubTasks", () => {
  const perPerson = parseTimesheet(
    `1.9.2026
ACME
9:00
- Údržba
-- #101 Nový e-shop
12:30
- Vývoj
-- #101 nový e-shop
13:30
- Údržba
-- #101 Nový e-shop
-- #102 Oprava košíku
15:30
`,
    "202609",
  ).perPerson;
  const rows = summarizeSubTasks(perPerson);
  const ticket = rows.find((r) => r.line.startsWith("#101"))!;

  it("sums a sub-line across all the tasks it was written under", () => {
    expect(ticket).toMatchObject({
      minutes: 210 + 60,
      entries: 2,
      tasks: ["Údržba", "Vývoj"],
    });
  });

  it("leaves an entry with several sub-lines out of the sum, pointing to its line instead", () => {
    expect(ticket.shared).toEqual([
      { date: "2026-09-01", line: 10, minutes: 120, otherLines: ["#102 Oprava košíku"] },
    ]);
    const other = rows.find((r) => r.line.startsWith("#102"))!;
    expect(other).toMatchObject({ minutes: 0, entries: 0 });
    expect(other.shared[0]?.otherLines).toEqual(["#101 Nový e-shop"]);
  });

  it("counts a shared entry only once in the grand total", () => {
    expect(totalMinutesOfSubTasks(rows, perPerson)).toBe(390);
  });
});
