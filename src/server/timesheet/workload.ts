/**
 * "Minimum workload" — an hours-worked target derived from the configured workdays
 * (`users.workdays`, ISO 1=Monday..7=Sunday) and hours/day (`users.hoursPerWorkday`),
 * compared against hours actually worked up to TODAY.
 *
 * Broken down by work weeks (Mon-Sun) within the current month — both the first and
 * last week are clamped to the month's boundaries (a month typically doesn't start/end
 * on a Monday/Sunday), so days from the previous/next month aren't counted in them. A
 * summary for the whole month follows at the end.
 *
 * `monthlyHoursGoal` (optional) allows a lower personal goal than the "achievable
 * maximum" (workdays in the month × hoursPerWorkday) — the pace for individual weeks
 * is then recalculated from this goal (an individual average/day), not from the fixed
 * hoursPerWorkday.
 */
import { type Dayjs } from "dayjs";

import { type PersonTimesheet } from "./parse";

export interface WorkloadSettings {
  /** ISO weekdays, 1 = Monday .. 7 = Sunday. */
  workdays: number[];
  hoursPerWorkday: number;
  /** Custom monthly hours goal; null = the achievable maximum is used. */
  monthlyHoursGoal: number | null;
}

export interface WorkloadProgress {
  /** The "as of today" target (based on elapsed workdays, at the pace toward `monthlyHoursGoal`). */
  targetHours: number;
  actualHours: number;
  /** actualHours - targetHours; negative = behind. */
  diffHours: number;
  elapsedWorkdays: number;
  totalWorkdaysInPeriod: number;
  /** The total target for the whole period at the pace toward `monthlyHoursGoal` (= that goal itself for the month). */
  totalTargetHours: number;
  /** The achievable maximum for the period (workdays × hoursPerWorkday, regardless of the goal). */
  maxTargetHours: number;
}

export interface WorkloadWeek extends WorkloadProgress {
  /** YYYY-MM-DD of the week's first workday (not the calendar Monday/start of month —
   * when the week starts on a weekend, only the first actual workday is shown). */
  startDate: string;
  /** YYYY-MM-DD of the week's last workday (analogous to startDate). */
  endDate: string;
  /** Today is before this week's start — it hasn't begun yet at all. */
  notStarted: boolean;
}

export interface WorkloadStats {
  weeks: WorkloadWeek[];
  month: WorkloadProgress;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function toIsoWeekday(d: Dayjs): number {
  const day = d.day(); // dayjs: 0 = Sunday .. 6 = Saturday
  return day === 0 ? 7 : day;
}

function countWorkdays(start: Dayjs, end: Dayjs, workdays: number[]): number {
  if (end.isBefore(start, "day")) return 0;
  let count = 0;
  let cur = start;
  while (!cur.isAfter(end, "day")) {
    if (workdays.includes(toIsoWeekday(cur))) count++;
    cur = cur.add(1, "day");
  }
  return count;
}

/** The first/last workday within the range — for the displayed date range (not for
 * computing the goal/hours, which always uses the full calendar range, since hours
 * worked outside workdays should also count toward actualHours). */
function firstWorkday(start: Dayjs, end: Dayjs, workdays: number[]): Dayjs | null {
  let cur = start;
  while (!cur.isAfter(end, "day")) {
    if (workdays.includes(toIsoWeekday(cur))) return cur;
    cur = cur.add(1, "day");
  }
  return null;
}

function lastWorkday(start: Dayjs, end: Dayjs, workdays: number[]): Dayjs | null {
  let cur = end;
  while (!cur.isBefore(start, "day")) {
    if (workdays.includes(toIsoWeekday(cur))) return cur;
    cur = cur.subtract(1, "day");
  }
  return null;
}

/** Sum of hours worked across all customers within the given date range (inclusive). */
function hoursInRange(perPerson: PersonTimesheet[], start: Dayjs, end: Dayjs): number {
  if (end.isBefore(start, "day")) return 0;
  const startStr = start.format("YYYY-MM-DD");
  const endStr = end.format("YYYY-MM-DD");
  let minutes = 0;
  for (const person of perPerson) {
    for (const entry of person.entries) {
      if (entry.date >= startStr && entry.date <= endStr) minutes += entry.minutes;
    }
  }
  return round2(minutes / 60);
}

function buildProgress(
  periodStart: Dayjs,
  periodEnd: Dayjs,
  today: Dayjs,
  workdays: number[],
  effectiveDailyRate: number,
  standardDailyRate: number,
  perPerson: PersonTimesheet[],
): WorkloadProgress {
  const elapsedEnd = today.isAfter(periodEnd, "day") ? periodEnd : today;
  const elapsedWorkdays = countWorkdays(periodStart, elapsedEnd, workdays);
  const totalWorkdaysInPeriod = countWorkdays(periodStart, periodEnd, workdays);
  const targetHours = round2(elapsedWorkdays * effectiveDailyRate);
  const actualHours = hoursInRange(perPerson, periodStart, elapsedEnd);
  return {
    targetHours,
    actualHours,
    diffHours: round2(actualHours - targetHours),
    elapsedWorkdays,
    totalWorkdaysInPeriod,
    totalTargetHours: round2(totalWorkdaysInPeriod * effectiveDailyRate),
    maxTargetHours: round2(totalWorkdaysInPeriod * standardDailyRate),
  };
}

/** `today` must fall within the month that `perPerson` was parsed for. */
export function computeWorkloadStats(
  today: Dayjs,
  settings: WorkloadSettings,
  perPerson: PersonTimesheet[],
): WorkloadStats {
  const monthStart = today.startOf("month");
  const monthEnd = today.endOf("month");

  const totalWorkdaysInMonth = countWorkdays(monthStart, monthEnd, settings.workdays);
  const maxMonthlyHours = round2(totalWorkdaysInMonth * settings.hoursPerWorkday);
  const goalHours = settings.monthlyHoursGoal ?? maxMonthlyHours;
  // An individual average/day derived from the (lower) personal goal — when no goal is
  // set, this works out to the same as hoursPerWorkday and behaves as before.
  const effectiveDailyRate = totalWorkdaysInMonth > 0 ? goalHours / totalWorkdaysInMonth : 0;

  const weeks: WorkloadWeek[] = [];
  let cursor = monthStart;
  while (!cursor.isAfter(monthEnd, "day")) {
    const naturalStart = cursor.subtract(toIsoWeekday(cursor) - 1, "day");
    const naturalEnd = naturalStart.add(6, "day");
    const weekStart = naturalStart.isBefore(monthStart, "day") ? monthStart : naturalStart;
    const weekEnd = naturalEnd.isAfter(monthEnd, "day") ? monthEnd : naturalEnd;

    const workStart = firstWorkday(weekStart, weekEnd, settings.workdays) ?? weekStart;
    const workEnd = lastWorkday(weekStart, weekEnd, settings.workdays) ?? weekEnd;

    weeks.push({
      ...buildProgress(
        weekStart,
        weekEnd,
        today,
        settings.workdays,
        effectiveDailyRate,
        settings.hoursPerWorkday,
        perPerson,
      ),
      startDate: workStart.format("YYYY-MM-DD"),
      endDate: workEnd.format("YYYY-MM-DD"),
      notStarted: today.isBefore(workStart, "day"),
    });

    cursor = naturalEnd.add(1, "day");
  }

  return {
    weeks,
    month: buildProgress(
      monthStart,
      monthEnd,
      today,
      settings.workdays,
      effectiveDailyRate,
      settings.hoursPerWorkday,
      perPerson,
    ),
  };
}
