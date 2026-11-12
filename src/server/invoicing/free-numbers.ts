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
  sourceYear: number | null;
  sourceMonth: number | null;
}

/** Sequence of `number` in the `period` series, or null when it isn't one of them. */
function sequenceOf(period: string, number: string): number | null {
  if (!number.startsWith(period)) return null;
  const suffix = number.slice(period.length);
  return /^\d{2,}$/.test(suffix) ? Number(suffix) : null;
}

/**
 * Which free sequence fits the invoice being created chronologically, or null = take
 * the next number in the series.
 *
 * Invoices already numbered for a later timesheet period mean we're going back in
 * time: the new invoice belongs between the last number used for a period up to the
 * target one and the first number used for a later period, so the smallest gap in
 * that window is suggested (January when 02–13 are taken → 01). With no later
 * invoices we're moving forward and the next number fits — even if there are gaps,
 * those belong to older periods. Invoices without a source period don't take part.
 */
export function suggestFreeSequence(
  period: string,
  lastSequence: number,
  invoices: NumberedInvoice[],
  target: { year: number; month: number },
): number | null {
  const targetKey = target.year * 100 + target.month;
  let lower = 0;
  let upper = Number.POSITIVE_INFINITY;
  for (const inv of invoices) {
    const seq = sequenceOf(period, inv.number);
    if (seq === null || seq > lastSequence) continue;
    if (inv.sourceYear === null || inv.sourceMonth === null) continue;
    const key = inv.sourceYear * 100 + inv.sourceMonth;
    if (key > targetKey) upper = Math.min(upper, seq);
    else lower = Math.max(lower, seq);
  }
  if (upper === Number.POSITIVE_INFINITY) return null;

  const free = freeSequences(
    period,
    lastSequence,
    invoices.map((i) => i.number),
  );
  return free.find((seq) => seq > lower && seq < upper) ?? null;
}
