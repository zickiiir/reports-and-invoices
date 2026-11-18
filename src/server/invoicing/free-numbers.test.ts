import { describe, expect, it } from "vitest";

import {
  formatInvoiceNumber,
  freeSequences,
  type NumberedInvoice,
  suggestFreeSequence,
} from "./free-numbers";

describe("freeSequences", () => {
  it("finds a gap at the start of the yearly series", () => {
    const used = Array.from({ length: 12 }, (_, i) => formatInvoiceNumber("2026", i + 2));
    expect(freeSequences("2026", 13, used)).toEqual([1]);
  });

  it("finds gaps in the middle of a monthly series", () => {
    expect(freeSequences("202603", 4, ["20260301", "20260304"])).toEqual([2, 3]);
  });

  it("returns nothing when the counter is at zero", () => {
    expect(freeSequences("2026", 0, [])).toEqual([]);
  });

  it("ignores numbers of the other scope that only share the prefix", () => {
    // Monthly-scope numbers under the yearly key "2026" parse as 101, 102 — above the
    // counter, so they neither count as used nor make 1 and 2 look taken.
    expect(freeSequences("2026", 2, ["20260101", "20260102"])).toEqual([1, 2]);
  });

  it("ignores numbers with a non-numeric suffix", () => {
    expect(freeSequences("2026", 1, ["2026A1"])).toEqual([1]);
  });
});

/** Last day of `month` in 2026, the default issue date of a timesheet invoice. */
const endOf = (month: number) =>
  new Date(Date.UTC(2026, month, 0)).toISOString().slice(0, 10);

/** Yearly series 2026: 02–12 for February–December, 13 an extra December invoice. */
const YEAR_2026: NumberedInvoice[] = [
  ...Array.from({ length: 11 }, (_, i) => ({
    number: formatInvoiceNumber("2026", i + 2),
    issueDate: endOf(i + 2),
  })),
  { number: "202613", issueDate: endOf(12) },
];

describe("suggestFreeSequence", () => {
  it("suggests the gap when going back in time", () => {
    expect(suggestFreeSequence("2026", 13, YEAR_2026, endOf(1))).toBe(1);
  });

  it("suggests the next number when nothing later is numbered", () => {
    const upToNovember = YEAR_2026.filter((i) => i.issueDate! <= endOf(11));
    expect(suggestFreeSequence("2026", 11, upToNovember, endOf(11))).toBeNull();
    expect(suggestFreeSequence("2026", 11, upToNovember, endOf(12))).toBeNull();
  });

  it("suggests a gap right above the last used number when moving forward", () => {
    // 01–13 used up to November, 14 was reserved by a draft that got deleted.
    const invoices: NumberedInvoice[] = Array.from({ length: 13 }, (_, i) => ({
      number: formatInvoiceNumber("2026", i + 1),
      issueDate: endOf(Math.min(i + 1, 11)),
    }));
    expect(suggestFreeSequence("2026", 14, invoices, endOf(11))).toBe(14);
  });

  it("never suggests gaps of a counter set by hand without invoices in the series", () => {
    expect(suggestFreeSequence("2026", 5, [], endOf(6))).toBeNull();
  });

  it("suggests the next number when the only gap belongs to an earlier invoice", () => {
    // November is going back (December exists), but 01 lies before February's 02.
    expect(suggestFreeSequence("2026", 13, YEAR_2026, endOf(11))).toBeNull();
  });

  it("picks the gap in the window between the neighbouring invoices", () => {
    const invoices: NumberedInvoice[] = [
      { number: "202601", issueDate: endOf(1) },
      { number: "202604", issueDate: endOf(6) },
    ];
    // 02 and 03 are free; March fits between January (01) and June (04).
    expect(suggestFreeSequence("2026", 4, invoices, endOf(3))).toBe(2);
  });

  it("places an invoice without a timesheet inside its month", () => {
    // 01–03 for January–March timesheets, 05 for April's issued on 30 April; 04 is free.
    const invoices: NumberedInvoice[] = [
      { number: "202501", issueDate: "2025-01-31" },
      { number: "202502", issueDate: "2025-02-28" },
      { number: "202503", issueDate: "2025-03-31" },
      { number: "202505", issueDate: "2025-04-30" },
    ];
    expect(suggestFreeSequence("2025", 5, invoices, "2025-04-15")).toBe(4);
  });

  it("puts an invoice issued on the same day after the existing one", () => {
    const invoices: NumberedInvoice[] = [
      { number: "202501", issueDate: "2025-01-31" },
      { number: "202503", issueDate: "2025-02-28" },
    ];
    expect(suggestFreeSequence("2025", 3, invoices, "2025-01-31")).toBe(2);
  });

  it("ignores invoices without an issue date", () => {
    const invoices: NumberedInvoice[] = [{ number: "202602", issueDate: null }];
    expect(suggestFreeSequence("2026", 2, invoices, endOf(1))).toBeNull();
  });
});
