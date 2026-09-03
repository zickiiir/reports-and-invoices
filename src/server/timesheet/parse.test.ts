import { describe, expect, it } from "vitest";

import { parseTimesheet } from "./parse";

// A synthetic sample covering the same edge cases as the real timesheets the parser
// was verified against during development (see parse.ts for the format description):
// multiple entries per day, a multi-line description, a date without a year, and a
// line missing its leading dash as a typical user mistake.
const SAMPLE = `1.7.2026
ACME
9:00
- Ranní úkol
- pokračování popisu
10:00
Oprava bez pomlčky
- Odpolední práce
19:00
2.7.2026
BETA
8:00
- Standardní den
15:00
23.7.
ACME
9:00
- Noční test bez roku
10:00
`;

describe("parseTimesheet", () => {
  const result = parseTimesheet(SAMPLE, "202607");

  it("sums hours for each customer", () => {
    const byName = Object.fromEntries(
      result.timesheets.map((t) => [t.name, t.hours]),
    );
    expect(byName).toEqual({
      ACME: 11,
      BETA: 7,
    });
  });

  it("sets filepath in exactly the spec's format", () => {
    const acme = result.timesheets.find((t) => t.name === "ACME");
    expect(acme?.filepath).toBe("202607/Výkaz_ACME_202607.htm");
  });

  it("reports a line missing its leading dash as an error with a line number", () => {
    expect(result.errors).toContain("Řádek 7: Neznám: Oprava bez pomlčky");
  });

  it("detects overtime (>8h/day) only for the day it actually happened", () => {
    const acme = result.timesheets.find((t) => t.name === "ACME");
    const beta = result.timesheets.find((t) => t.name === "BETA");
    expect(acme?.overtime).toEqual([{ date: "2026-07-01", hours: 10 }]);
    expect(beta?.overtime).toEqual([]);
  });

  it("first entry matches the order and multi-line description from the input", () => {
    const acme = result.perPerson.find((p) => p.alias === "ACME")!;
    const firstEntry = [...acme.entries].sort((a, b) =>
      a.date === b.date ? a.idx - b.idx : a.date.localeCompare(b.date),
    )[0]!;
    expect(firstEntry.date).toBe("2026-07-01");
    expect(firstEntry.minutes).toBe(60);
    expect(firstEntry.description).toEqual(["Ranní úkol", "pokračování popisu"]);
  });

  it("supports a date without a year (23.7. → fills in the year from period)", () => {
    const acme = result.perPerson.find((p) => p.alias === "ACME")!;
    expect(acme.entries.some((e) => e.date === "2026-07-23")).toBe(true);
  });

  it("handles an interval crossing midnight (22:00–1:00 = 3 hours)", () => {
    const input = ["1.7.2026", "XYZ", "22:00", "- noční směna", "1:00"].join(
      "\n",
    );
    const r = parseTimesheet(input, "202607");
    expect(r.errors).toEqual([]);
    expect(r.timesheets.find((t) => t.name === "XYZ")?.hours).toBe(3);
  });
});
