import dayjs from "dayjs";
import { Card, SimpleGrid, Stack, Text, Title } from "@mantine/core";

import { computeWorkloadStats } from "~/server/timesheet/workload";
import { api } from "~/trpc/server";

import { CurrentTimesheetCard, RecentInvoicesCard, WorkloadCard } from "./dashboard-cards";

export default async function DashboardPage() {
  const period = dayjs().format("YYYYMM");

  const [customers, invoices, currentTimesheet, me] = await Promise.all([
    api.customer.list(),
    api.invoice.list(),
    api.timesheet.read({ period }),
    api.user.me(),
  ]);

  const activeCustomers = customers.filter((c) => !c.archived);

  const workloadStats = computeWorkloadStats(
    dayjs(),
    {
      workdays: me.workdays,
      hoursPerWorkday: Number(me.hoursPerWorkday),
      monthlyHoursGoal: me.monthlyHoursGoal ? Number(me.monthlyHoursGoal) : null,
    },
    currentTimesheet.parsed.perPerson,
  );

  return (
    <Stack gap="lg">
      <Title order={2}>Přehled</Title>

      <WorkloadCard stats={workloadStats} />

      <SimpleGrid cols={{ base: 1, sm: 3 }}>
        <Card withBorder padding="lg">
          <Text size="sm" c="dimmed">
            Aktivní odběratelé
          </Text>
          <Text size="xl" fw={700}>
            {activeCustomers.length}
          </Text>
        </Card>
        <Card withBorder padding="lg">
          <Text size="sm" c="dimmed">
            Faktury celkem
          </Text>
          <Text size="xl" fw={700}>
            {invoices.length}
          </Text>
        </Card>
        <Card withBorder padding="lg">
          <Text size="sm" c="dimmed">
            Hodiny za {dayjs().format("MM/YYYY")}
          </Text>
          <Text size="xl" fw={700}>
            {currentTimesheet.parsed.timesheets
              .reduce((sum, t) => sum + t.hours, 0)
              .toFixed(2)}
          </Text>
        </Card>
      </SimpleGrid>

      <CurrentTimesheetCard
        timesheets={currentTimesheet.parsed.timesheets}
        errors={currentTimesheet.parsed.errors}
      />

      <RecentInvoicesCard invoices={invoices} />
    </Stack>
  );
}
