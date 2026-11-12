import dayjs from "dayjs";
import { describe, expect, it } from "vitest";

import { computeFlatTaxLimitStats, type FlatTaxLimitInvoice } from "./flat-tax-limit";

const TODAY = dayjs("2026-11-12");

function inv(
  totalAmount: number,
  dueDate: string | null,
  status: FlatTaxLimitInvoice["status"] = "issued",
  issueDate: string | null = null,
): FlatTaxLimitInvoice {
  return { status, dueDate, issueDate, totalAmount: String(totalAmount) };
}

describe("computeFlatTaxLimitStats", () => {
  it("counts only issued and paid invoices due in the current calendar year", () => {
    const stats = computeFlatTaxLimitStats(
      [
        inv(100_000, "2026-01-15", "paid"),
        inv(200_000, "2026-12-15", "issued"),
        inv(50_000, "2025-12-31", "paid"), // previous year
        inv(70_000, "2027-01-15", "issued"), // issued in Dec, due next year
        inv(30_000, "2026-11-15", "draft"),
      ],
      TODAY,
    );
    expect(stats.year).toBe(2026);
    expect(stats.total).toBe(300_000);
    expect(stats.invoiceCount).toBe(2);
    expect(stats.draftTotal).toBe(30_000);
    expect(stats.band?.band).toBe(1);
    expect(stats.remainingInBand).toBe(700_000);
    expect(stats.remainingToMax).toBe(1_700_000);
  });

  it("falls back to the issue date when there is no due date", () => {
    const stats = computeFlatTaxLimitStats([inv(10_000, null, "issued", "2026-03-31")], TODAY);
    expect(stats.total).toBe(10_000);
  });

  it("ignores invoices without any date", () => {
    const stats = computeFlatTaxLimitStats([inv(10_000, null)], TODAY);
    expect(stats.total).toBe(0);
    expect(stats.band?.band).toBe(1);
  });

  it("keeps an income exactly at the limit in the lower band", () => {
    expect(computeFlatTaxLimitStats([inv(1_000_000, "2026-05-15")], TODAY).band?.band).toBe(1);
    expect(computeFlatTaxLimitStats([inv(1_000_000.01, "2026-05-15")], TODAY).band?.band).toBe(2);
    expect(computeFlatTaxLimitStats([inv(1_500_000, "2026-05-15")], TODAY).band?.band).toBe(2);
    expect(computeFlatTaxLimitStats([inv(2_000_000, "2026-05-15")], TODAY).band?.band).toBe(3);
  });

  it("reports leaving the regime above 2 mil. and the immediate VAT limit", () => {
    const over = computeFlatTaxLimitStats([inv(2_100_000, "2026-05-15")], TODAY);
    expect(over.band).toBeNull();
    expect(over.remainingInBand).toBeNull();
    expect(over.remainingToMax).toBe(-100_000);
    expect(over.exceedsVatImmediateLimit).toBe(false);

    const vat = computeFlatTaxLimitStats([inv(2_536_501, "2026-05-15")], TODAY);
    expect(vat.exceedsVatImmediateLimit).toBe(true);
  });
});
