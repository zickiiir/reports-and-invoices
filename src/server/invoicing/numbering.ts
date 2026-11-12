import { and, eq, like, sql } from "drizzle-orm";

import { type db as dbType } from "~/server/db";
import {
  invoiceNumberCounters,
  invoices,
  type InvoiceNumberingScope,
} from "~/server/db/schema";

import { formatInvoiceNumber, freeSequences, suggestFreeSequence } from "./free-numbers";

type DbOrTx = typeof dbType;

/**
 * The numbering sequence key stored in `invoiceNumberCounters.period` — for "per
 * month" numbering it's YYYYMM (the existing behavior), for "per year" it's just YYYY
 * (an older established practice, the number then doesn't depend on which month the
 * invoice was created in).
 */
export function numberingPeriodKey(
  scope: InvoiceNumberingScope,
  year: number,
  month: number,
): string {
  return scope === "year" ? String(year) : `${year}${String(month).padStart(2, "0")}`;
}

/**
 * Replaces the old logic from `functions.php` (log files logs/invoicesXX20YY.log).
 * Invoice number = `${numberingPeriodKey(...)}${sequence, 2 digits}`, the sequence is
 * per user + key, atomically incremented in the DB.
 */
export async function reserveInvoiceNumber(
  db: DbOrTx,
  userId: string,
  scope: InvoiceNumberingScope,
  year: number,
  month: number,
): Promise<string> {
  const period = numberingPeriodKey(scope, year, month);
  const [row] = await db
    .insert(invoiceNumberCounters)
    .values({ userId, period, lastSequence: 1 })
    .onConflictDoUpdate({
      target: [invoiceNumberCounters.userId, invoiceNumberCounters.period],
      set: { lastSequence: sql`${invoiceNumberCounters.lastSequence} + 1` },
    })
    .returning({ lastSequence: invoiceNumberCounters.lastSequence });

  const sequence = row?.lastSequence ?? 1;
  return `${period}${String(sequence).padStart(2, "0")}`;
}

/**
 * A direct intervention in the numbering sequence — sets the "last used number" for
 * a given period, the next reservation (see above) then continues from
 * `lastSequence + 1`. Intended for manual correction in settings (e.g. switching to
 * this system mid-year), not for regular invoice issuing.
 */
export async function setInvoiceNumberSequence(
  db: DbOrTx,
  userId: string,
  scope: InvoiceNumberingScope,
  year: number,
  month: number,
  lastSequence: number,
): Promise<void> {
  const period = numberingPeriodKey(scope, year, month);
  await db
    .insert(invoiceNumberCounters)
    .values({ userId, period, lastSequence })
    .onConflictDoUpdate({
      target: [invoiceNumberCounters.userId, invoiceNumberCounters.period],
      set: { lastSequence },
    });
}

/**
 * The numbering state for a period: the next number in the series and the free
 * numbers below it. Read-only — nothing is reserved. Free numbers never collide with
 * `reserveInvoiceNumber`, which only hands out numbers above `lastSequence`.
 */
export async function getNumberingState(
  db: DbOrTx,
  userId: string,
  scope: InvoiceNumberingScope,
  year: number,
  month: number,
): Promise<{
  period: string;
  lastSequence: number;
  next: string;
  free: string[];
  /** A free number that fits the target period chronologically; null = `next`. */
  suggested: string | null;
}> {
  const period = numberingPeriodKey(scope, year, month);
  const counter = await db.query.invoiceNumberCounters.findFirst({
    where: and(
      eq(invoiceNumberCounters.userId, userId),
      eq(invoiceNumberCounters.period, period),
    ),
  });
  const lastSequence = counter?.lastSequence ?? 0;

  const existing =
    lastSequence > 0
      ? await db
          .select({
            number: invoices.number,
            sourceYear: invoices.sourceYear,
            sourceMonth: invoices.sourceMonth,
          })
          .from(invoices)
          .where(and(eq(invoices.userId, userId), like(invoices.number, `${period}%`)))
      : [];

  return {
    period,
    lastSequence,
    next: formatInvoiceNumber(period, lastSequence + 1),
    free: freeSequences(
      period,
      lastSequence,
      existing.map((e) => e.number),
    ).map((seq) => formatInvoiceNumber(period, seq)),
    suggested: (() => {
      const seq = suggestFreeSequence(period, lastSequence, existing, { year, month });
      return seq === null ? null : formatInvoiceNumber(period, seq);
    })(),
  };
}
