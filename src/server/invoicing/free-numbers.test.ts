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

/** Yearly series 2026: 02–12 for February–December, 13 an extra December invoice. */
const YEAR_2026: NumberedInvoice[] = [
  ...Array.from({ length: 11 }, (_, i) => ({
    number: formatInvoiceNumber("2026", i + 2),
    sourceYear: 2026,
    sourceMonth: i + 2,
  })),
  { number: "202613", sourceYear: 2026, sourceMonth: 12 },
];

describe("suggestFreeSequence", () => {
  it("suggests the gap when going back in time", () => {
    expect(suggestFreeSequence("2026", 13, YEAR_2026, { year: 2026, month: 1 })).toBe(1);
  });

  it("suggests the next number when no later period is numbered", () => {
    const upToNovember = YEAR_2026.filter((i) => i.sourceMonth! <= 11);
    expect(suggestFreeSequence("2026", 13, upToNovember, { year: 2026, month: 11 })).toBeNull();
    expect(suggestFreeSequence("2026", 13, upToNovember, { year: 2026, month: 12 })).toBeNull();
  });

  it("suggests the next number when the only gap belongs to an older period", () => {
    // November is going back (December exists), but 01 lies before February's 02.
    expect(suggestFreeSequence("2026", 13, YEAR_2026, { year: 2026, month: 11 })).toBeNull();
  });

  it("picks the gap in the window between the neighbouring periods", () => {
    const invoices: NumberedInvoice[] = [
      { number: "202601", sourceYear: 2026, sourceMonth: 1 },
      { number: "202604", sourceYear: 2026, sourceMonth: 6 },
    ];
    // 02 and 03 are free; March fits between January (01) and June (04).
    expect(suggestFreeSequence("2026", 4, invoices, { year: 2026, month: 3 })).toBe(2);
  });

  it("ignores invoices without a source period", () => {
    const invoices: NumberedInvoice[] = [{ number: "202602", sourceYear: null, sourceMonth: null }];
    expect(suggestFreeSequence("2026", 2, invoices, { year: 2026, month: 1 })).toBeNull();
  });
});
