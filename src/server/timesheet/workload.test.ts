import dayjs from "dayjs";
import { describe, expect, it } from "vitest";

import { type PersonTimesheet } from "./parse";
import { computeWorkloadStats, type WorkloadSettings } from "./workload";

const MON_FRI: WorkloadSettings = {
  workdays: [1, 2, 3, 4, 5],
  hoursPerWorkday: 8,
  monthlyHoursGoal: null,
};

function person(alias: string, entries: { date: string; minutes: number }[]): PersonTimesheet {
  return {
    alias,
    entries: entries.map((e, idx) => ({ ...e, idx, line: idx + 1, description: [] })),
    totalMinutes: entries.reduce((sum, e) => sum + e.minutes, 0),
  };
}

describe("computeWorkloadStats", () => {
  // 2026-09-01 is a Tuesday — the Mon-Sun week containing 9/2 (Wednesday) starts on
  // Monday 8/31, but that falls in August, so this week has to be clamped to 9/1-9/6.
  const today = dayjs("2026-09-02"); // Wednesday

  it("clamps the month's first week to its boundary (Mon 8/31 doesn't count)", () => {
    const stats = computeWorkloadStats(today, MON_FRI, []);
    const firstWeek = stats.weeks[0]!;
    // The displayed range is the "working" one (Tue-Fri), not the calendar one
    // (Tue-Sun) — the weekend (9/5-9/6) doesn't belong in the label, even though it
    // likewise wasn't counted into totalWorkdaysInPeriod under the hood.
    expect(firstWeek.startDate).toBe("2026-09-01");
    expect(firstWeek.endDate).toBe("2026-09-04");
    // The full (unclamped) week would have Mon-Fri = 5 workdays, clamped to 9/1-9/6 it
    // has only Tue-Fri = 4 — exactly the scenario from the spec (4×8 = 32h, not 40h).
    expect(firstWeek.totalWorkdaysInPeriod).toBe(4);
    expect(firstWeek.totalTargetHours).toBe(32);
  });

  it("splits the month into weeks including the last one, also clamped to the month boundary", () => {
    const stats = computeWorkloadStats(today, MON_FRI, []);
    // September 2026: 9/1 = Tuesday, 9/30 = Wednesday → 5 week rows.
    expect(stats.weeks).toHaveLength(5);
    const lastWeek = stats.weeks.at(-1)!;
    expect(lastWeek.startDate).toBe("2026-09-28");
    expect(lastWeek.endDate).toBe("2026-09-30");
    expect(lastWeek.totalWorkdaysInPeriod).toBe(3); // Mon, Tue, Wed
  });

  it("marks weeks that haven't started yet and gives them no target", () => {
    const stats = computeWorkloadStats(today, MON_FRI, []);
    expect(stats.weeks[0]!.notStarted).toBe(false);
    expect(stats.weeks[1]!.notStarted).toBe(true);
    expect(stats.weeks[1]!.elapsedWorkdays).toBe(0);
    expect(stats.weeks[1]!.targetHours).toBe(0);
  });

  it("today's target counts only elapsed workdays (Tue+Wed = 2×8h)", () => {
    const stats = computeWorkloadStats(today, MON_FRI, []);
    expect(stats.weeks[0]!.elapsedWorkdays).toBe(2);
    expect(stats.month.elapsedWorkdays).toBe(2);
    expect(stats.month.targetHours).toBe(16);
  });

  it("computes actual hours worked and the diff against the target", () => {
    const perPerson = [
      person("KM", [
        { date: "2026-09-01", minutes: 4 * 60 },
        { date: "2026-09-02", minutes: 3 * 60 },
      ]),
    ];
    const stats = computeWorkloadStats(today, MON_FRI, perPerson);
    expect(stats.month.actualHours).toBe(7);
    expect(stats.month.targetHours).toBe(16);
    expect(stats.month.diffHours).toBe(-9); // 9h behind
  });

  it("respects custom workdays (only Tue-Fri)", () => {
    const tueFri: WorkloadSettings = {
      workdays: [2, 3, 4, 5],
      hoursPerWorkday: 8,
      monthlyHoursGoal: null,
    };
    const stats = computeWorkloadStats(today, tueFri, []);
    // The month from 9/1 (Tue) to today (9/2, Wed) — both days are workdays.
    expect(stats.month.elapsedWorkdays).toBe(2);
    expect(stats.month.targetHours).toBe(16);
  });

  it("a weekend day doesn't count as a workday, but earlier workdays still do", () => {
    const saturday = dayjs("2026-09-05");
    const stats = computeWorkloadStats(saturday, MON_FRI, []);
    // Tue, Wed, Thu, Fri = 4 workdays up to and including Saturday (Saturday itself doesn't count).
    expect(stats.month.elapsedWorkdays).toBe(4);
    expect(stats.month.targetHours).toBe(32);
  });

  it("a custom (lower) monthly goal recalculates the weekly/daily pace — without a goal totalTargetHours == maxTargetHours", () => {
    const stats = computeWorkloadStats(today, MON_FRI, []);
    // Without `monthlyHoursGoal` the individual pace matches the standard (8h/day).
    expect(stats.month.totalTargetHours).toBe(stats.month.maxTargetHours);
  });

  it("with a 154h goal (22 workdays × 7h) the individual pace is 7h/day, not 8h", () => {
    const settings: WorkloadSettings = { ...MON_FRI, monthlyHoursGoal: 154 };
    const stats = computeWorkloadStats(today, settings, []);
    // September has 22 workdays for Mon-Fri — the achievable maximum stays 22×8=176h.
    expect(stats.month.maxTargetHours).toBe(176);
    // The user's goal (154h) becomes the month's total target.
    expect(stats.month.totalTargetHours).toBe(154);
    // The target as of today (2 elapsed days) is now 2×7=14h, not 2×8=16h.
    expect(stats.month.targetHours).toBe(14);
    // The first (clamped) week has 4 workdays → a 4×7=28h target, but still a 4×8=32h maximum.
    const firstWeek = stats.weeks[0]!;
    expect(firstWeek.totalTargetHours).toBe(28);
    expect(firstWeek.maxTargetHours).toBe(32);
  });

  it("hours outside the current range (a different month) don't count into actualHours", () => {
    const perPerson = [
      person("KM", [
        { date: "2026-08-31", minutes: 8 * 60 }, // August — outside both the month and the week
        { date: "2026-09-01", minutes: 2 * 60 },
      ]),
    ];
    const stats = computeWorkloadStats(today, MON_FRI, perPerson);
    expect(stats.month.actualHours).toBe(2);
    expect(stats.weeks[0]!.actualHours).toBe(2);
  });
});
