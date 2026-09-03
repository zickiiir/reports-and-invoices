"use client";

import dayjs from "dayjs";
import { Badge, Group, Progress, Text } from "@mantine/core";

import { type WorkloadProgress } from "~/server/timesheet/workload";

/** "15h" — hours are always rounded up in the UI (better to slightly overstate the
 * goal than understate it), and no space before the unit. */
function fmtHours(hours: number): string {
  return `${Math.ceil(hours)}h`;
}

/** Like `fmtHours`, but keeps the sign (for diffHours — "-9h", not "9h" for negatives). */
function fmtSignedHours(hours: number): string {
  return `${Math.sign(hours) * Math.ceil(Math.abs(hours))}h`;
}

/** "1.–6. 9." — weeks in `workload.ts` are always clipped to month boundaries, so the
 * start and end are always in the same month. */
export function formatWeekRange(startDate: string, endDate: string): string {
  return `${dayjs(startDate).format("D.")}–${dayjs(endDate).format("D. M.")}`;
}

/** One "goal vs. actual" row (week/month) — shared between the homepage widget
 * (dashboard-cards.tsx) and the summary in the timesheet editor (timesheet-editor.tsx). */
export function WorkloadSection({
  label,
  progress,
  notStarted,
}: {
  label: string;
  progress: WorkloadProgress;
  notStarted?: boolean;
}) {
  // A custom (lower) monthly goal means the pace (totalTargetHours) is lower than the
  // achievable maximum (maxTargetHours) — without a custom goal they're equal, and
  // nothing extra is shown.
  const hasCustomGoal = progress.maxTargetHours !== progress.totalTargetHours;

  if (notStarted) {
    return (
      <div>
        <Group justify="space-between" mb={4}>
          <Text size="sm" fw={500} c="dimmed">
            {label}
          </Text>
          <Badge color="gray" variant="light">
            Ještě nezačal
          </Badge>
        </Group>
        <Progress value={0} color="gray" size="lg" />
        <Text size="xs" c="dimmed" mt={4}>
          Plánovaný cíl {fmtHours(progress.totalTargetHours)} (
          {progress.totalWorkdaysInPeriod} prac. dnů)
          {hasCustomGoal && ` · dosažitelné maximum ${fmtHours(progress.maxTargetHours)}`}
        </Text>
      </div>
    );
  }

  const pct =
    progress.targetHours > 0
      ? Math.round((progress.actualHours / progress.targetHours) * 100)
      : 100;
  const ahead = progress.diffHours >= 0;
  return (
    <div>
      <Group justify="space-between" mb={4}>
        <Text size="sm" fw={500}>
          {label}
        </Text>
        <Badge color={ahead ? "green" : "red"} variant="light">
          {ahead ? "+" : ""}
          {fmtSignedHours(progress.diffHours)} {ahead ? "navíc" : "pozadu"}
        </Badge>
      </Group>
      <Progress value={Math.min(pct, 100)} color={ahead ? "green" : "orange"} size="lg" />
      <Text size="xs" c="dimmed" mt={4}>
        {fmtHours(progress.actualHours)} z cíle {fmtHours(progress.targetHours)} k dnešku ·
        celkový cíl {fmtHours(progress.totalTargetHours)} ({progress.elapsedWorkdays}/
        {progress.totalWorkdaysInPeriod} prac. dnů)
        {hasCustomGoal && ` · dosažitelné maximum ${fmtHours(progress.maxTargetHours)}`}
      </Text>
    </div>
  );
}
