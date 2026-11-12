/**
 * Informational tracking of the Czech flat-tax regime (paušální daň) income limits —
 * which band (pásmo) the supplier's invoiced income for the current calendar year falls
 * into, how much of it is used up and how much is left until the band's upper limit.
 *
 * Purely informative — the band is never stored or chosen by the user.
 *
 * Decisions behind the numbers (see the paušální daň page on financnisprava.gov.cz):
 * - The limit is assessed per tax period, which for personal income tax is the calendar
 *   year — not a rolling 12 months.
 * - Income of an OSVČ with daňová evidence counts when payment arrives. The app has no
 *   payment date yet, so payment is assumed to arrive on the due date (`dueDate`);
 *   `issueDate` is the fallback when an invoice has no due date.
 * - Band limits are the ones that apply "regardless of the kind of activity" (1 / 1.5 /
 *   2 mil. Kč). With 60 % / 80 % expense flat rates the limits of bands I and II can be
 *   higher — the app doesn't know the activity, so it shows the conservative variant.
 * - 2 000 000 Kč is also the VAT registration turnover limit; above 2 536 500 Kč the
 *   supplier becomes a VAT payer the next day (and thereby leaves the regime).
 * - Only issued and paid invoices count; drafts are summed separately for information.
 */
import { type Dayjs } from "dayjs";

export const FLAT_TAX_BANDS = [
  { band: 1, label: "I. pásmo", limit: 1_000_000 },
  { band: 2, label: "II. pásmo", limit: 1_500_000 },
  { band: 3, label: "III. pásmo", limit: 2_000_000 },
] as const;

export type FlatTaxBand = (typeof FLAT_TAX_BANDS)[number];

/** Upper limit of the whole regime — also the VAT registration turnover limit. */
export const FLAT_TAX_MAX_LIMIT = 2_000_000;

/** Turnover above which the supplier becomes a VAT payer from the following day. */
export const VAT_IMMEDIATE_LIMIT = 2_536_500;

export interface FlatTaxLimitInvoice {
  status: "draft" | "issued" | "paid";
  dueDate: string | null;
  issueDate: string | null;
  totalAmount: string | number;
}

export interface FlatTaxLimitStats {
  year: number;
  /** Sum of issued + paid invoices with the (assumed) payment date in `year`. */
  total: number;
  /** Number of invoices included in `total`. */
  invoiceCount: number;
  /** Sum of draft invoices dated in `year` — not part of `total`. */
  draftTotal: number;
  /** The lowest band the income still fits into; null = above the regime limit. */
  band: FlatTaxBand | null;
  /** How much is left until the current band's upper limit; null when above all bands. */
  remainingInBand: number | null;
  /** How much is left until the regime / VAT registration limit (negative = exceeded). */
  remainingToMax: number;
  /** Share of the regime limit used up, 0–100+ (not clamped). */
  percentOfMax: number;
  exceedsVatImmediateLimit: boolean;
}

/** The date the payment is assumed to arrive on (YYYY-MM-DD), or null. */
function assumedPaymentDate(invoice: FlatTaxLimitInvoice): string | null {
  return invoice.dueDate ?? invoice.issueDate;
}

export function computeFlatTaxLimitStats(
  invoices: FlatTaxLimitInvoice[],
  today: Dayjs,
): FlatTaxLimitStats {
  const year = today.year();
  const yearPrefix = `${year}-`;

  let total = 0;
  let invoiceCount = 0;
  let draftTotal = 0;

  for (const invoice of invoices) {
    const date = assumedPaymentDate(invoice);
    if (!date?.startsWith(yearPrefix)) continue;
    const amount = Number(invoice.totalAmount);
    if (!Number.isFinite(amount)) continue;

    if (invoice.status === "draft") {
      draftTotal += amount;
    } else {
      total += amount;
      invoiceCount += 1;
    }
  }

  // "Nepřesáhl" — reaching the limit exactly still fits the band.
  const band = FLAT_TAX_BANDS.find((b) => total <= b.limit) ?? null;

  return {
    year,
    total,
    invoiceCount,
    draftTotal,
    band,
    remainingInBand: band ? band.limit - total : null,
    remainingToMax: FLAT_TAX_MAX_LIMIT - total,
    percentOfMax: (total / FLAT_TAX_MAX_LIMIT) * 100,
    exceedsVatImmediateLimit: total > VAT_IMMEDIATE_LIMIT,
  };
}
