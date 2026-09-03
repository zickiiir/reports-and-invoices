import dayjs, { type Dayjs } from "dayjs";

import { type DateRule, type InvoiceDateRules } from "~/server/db/schema";

export const defaultInvoiceDateRules: InvoiceDateRules = {
  issue: { type: "lastDayOfPeriodMonth" },
  due: { type: "dayOfNextMonth", day: 15 },
  performance: { type: "lastDayOfPeriodMonth" },
};

export interface ComputedInvoiceDates {
  issueDate: string; // YYYY-MM-DD
  dueDate: string;
  performanceDate: string;
  periodLabel: string; // month name capitalized, e.g. "Červenec"
}

const MONTH_NAMES_CS = [
  "Leden",
  "Únor",
  "Březen",
  "Duben",
  "Květen",
  "Červen",
  "Červenec",
  "Srpen",
  "Září",
  "Říjen",
  "Listopad",
  "Prosinec",
];

function resolveDateRule(
  rule: DateRule,
  lastDayOfPeriod: Dayjs,
  nextMonth: Dayjs,
): Dayjs {
  if (rule.type === "lastDayOfPeriodMonth") return lastDayOfPeriod;

  let resolved = nextMonth.date(rule.day);
  // A day outside the month's range (e.g. the 31st in February) would overflow into
  // the next month — handle it by clamping to the end of the month.
  if (resolved.month() !== nextMonth.month()) {
    resolved = nextMonth.endOf("month");
  }
  return resolved;
}

/**
 * Pre-fills invoice dates from the reported period according to the rules in the
 * user's settings (e.g. an invoice for July → issue date and performance date default
 * to the last day of June, due date the 15th of July — all configurable).
 * `period.month` is 1-12.
 */
export function computeInvoiceDates(
  period: { year: number; month: number },
  rules: InvoiceDateRules = defaultInvoiceDateRules,
): ComputedInvoiceDates {
  const periodStart = dayjs(
    `${period.year}-${String(period.month).padStart(2, "0")}-01`,
  );
  const lastDayOfPeriod = periodStart.endOf("month");
  const nextMonth = periodStart.add(1, "month");

  const issueDate = resolveDateRule(rules.issue, lastDayOfPeriod, nextMonth);
  const performanceDate = resolveDateRule(
    rules.performance,
    lastDayOfPeriod,
    nextMonth,
  );
  const dueDate = resolveDateRule(rules.due, lastDayOfPeriod, nextMonth);

  return {
    issueDate: issueDate.format("YYYY-MM-DD"),
    dueDate: dueDate.format("YYYY-MM-DD"),
    performanceDate: performanceDate.format("YYYY-MM-DD"),
    periodLabel: MONTH_NAMES_CS[period.month - 1]!,
  };
}
