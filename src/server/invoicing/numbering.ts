import { sql } from "drizzle-orm";

import { type db as dbType } from "~/server/db";
import { invoiceNumberCounters, type InvoiceNumberingScope } from "~/server/db/schema";

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
