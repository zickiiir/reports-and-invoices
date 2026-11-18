/**
 * Pure helpers for invoice numbers, kept free of DB imports so vitest can load them
 * (it has no `~` path alias). The DB side lives in `numbering.ts`.
 */

export function formatInvoiceNumber(period: string, sequence: number): string {
  return `${period}${String(sequence).padStart(2, "0")}`;
}

/**
 * Sequences 1..lastSequence that no existing invoice of the user uses — gaps in the
 * series, e.g. when invoices for older timesheets are entered after later ones were
 * already numbered, or after a deleted draft. Pure so it can be tested without a DB.
 *
 * Only numbers of the exact `${period}NN…` shape count as used; a number from the other
 * numbering scope ("20260105" under the yearly key "2026" → 105) lands above
 * `lastSequence` and is ignored by the range check.
 */
export function freeSequences(
  period: string,
  lastSequence: number,
  usedNumbers: string[],
): number[] {
  const used = new Set<number>();
  for (const number of usedNumbers) {
    const seq = sequenceOf(period, number);
    if (seq !== null) used.add(seq);
  }
  const free: number[] = [];
  for (let seq = 1; seq <= lastSequence; seq++) {
    if (!used.has(seq)) free.push(seq);
  }
  return free;
}

export interface NumberedInvoice {
  number: string;
  /** YYYY-MM-DD; the order of issue is the order the series must follow. */
  issueDate: string | null;
}

/** Sequence of `number` in the `period` series, or null when it isn't one of them. */
function sequenceOf(period: string, number: string): number | null {
  if (!number.startsWith(period)) return null;
  const suffix = number.slice(period.length);
  return /^\d{2,}$/.test(suffix) ? Number(suffix) : null;
}

/**
 * Which free sequence fits the new invoice by its issue date, or null = take the next
 * number in the series.
 *
 * Invoices already numbered with a later issue date mean we're going back in time: the
 * new invoice belongs between the last number issued up to its date and the first
 * number issued after it, so the smallest gap in that window is suggested. Ordering by
 * issue date (not by timesheet month) also places invoices without a timesheet, which
 * can share a month with a timesheet invoice.
 *
 * With no later invoices we're moving forward. Gaps below the last used number belong
 * to earlier invoices, but a gap ABOVE it (the last draft was deleted while a later
 * number had already been reserved) is the natural continuation and is suggested.
 * That needs at least one invoice in the series: a counter set by hand in settings
 * (switching from another system mid-year) leaves 01–NN "free" here although the old
 * system used them, and those must never be suggested. Invoices without an issue date
 * don't take part.
 */
export function suggestFreeSequence(
  period: string,
  lastSequence: number,
  invoices: NumberedInvoice[],
  targetIssueDate: string,
): number | null {
  let lower = 0;
  let upper = Number.POSITIVE_INFINITY;
  for (const inv of invoices) {
    const seq = sequenceOf(period, inv.number);
    if (seq === null || seq > lastSequence) continue;
    if (inv.issueDate === null) continue;
    if (inv.issueDate > targetIssueDate) upper = Math.min(upper, seq);
    else lower = Math.max(lower, seq);
  }
  if (upper === Number.POSITIVE_INFINITY && lower === 0) return null;

  const free = freeSequences(
    period,
    lastSequence,
    invoices.map((i) => i.number),
  );
  return free.find((seq) => seq > lower && seq < upper) ?? null;
}
