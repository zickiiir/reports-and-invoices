"use client";

/**
 * Mantine "compound" components (Table.Thead/Tr/Th etc.) have static subcomponents
 * attached to the function — when JSX with such a direct `<Table.Thead>` is built
 * inside a server component (page.tsx without "use client"), the type reference
 * sometimes fails to serialize correctly across the RSC boundary (Next 16 + webpack).
 * Fix: all Table rendering UI lives in these thin client components, the server page
 * just passes them already-fetched data.
 */
import dayjs from "dayjs";
import { Badge, Card, Divider, Group, Stack, Table, Text, Title } from "@mantine/core";

import { LinkAnchor, LinkButton } from "~/components/link-controls";
import { formatWeekRange, WorkloadSection } from "~/components/workload-widget";
import { type WorkloadStats } from "~/server/timesheet/workload";
import { type RouterOutputs } from "~/trpc/react";

type Timesheets = RouterOutputs["timesheet"]["read"]["parsed"]["timesheets"];
type Errors = RouterOutputs["timesheet"]["read"]["parsed"]["errors"];
type Invoices = RouterOutputs["invoice"]["list"];

export function WorkloadCard({ stats }: { stats: WorkloadStats }) {
  return (
    <Card withBorder padding="lg">
      <Group justify="space-between" mb="sm">
        <Title order={4}>Pracovní nasazení</Title>
        <LinkAnchor href="/settings" size="sm">
          Upravit cíle
        </LinkAnchor>
      </Group>
      <Stack gap="md">
        {stats.weeks.map((week) => (
          <WorkloadSection
            key={week.startDate}
            label={formatWeekRange(week.startDate, week.endDate)}
            progress={week}
            notStarted={week.notStarted}
          />
        ))}
        <Divider label="Celkem za měsíc" labelPosition="center" />
        <WorkloadSection label="Měsíc" progress={stats.month} />
      </Stack>
    </Card>
  );
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Koncept",
  issued: "Vystavena",
  paid: "Zaplacena",
};

export function CurrentTimesheetCard({
  timesheets,
  errors,
}: {
  timesheets: Timesheets;
  errors: Errors;
}) {
  return (
    <Card withBorder padding="lg">
      <Group justify="space-between" mb="sm">
        <Title order={4}>Aktuální výkaz ({dayjs().format("MM/YYYY")})</Title>
        <LinkButton href="/timesheets" variant="light">
          Otevřít editor
        </LinkButton>
      </Group>
      {timesheets.length === 0 ? (
        <Text c="dimmed" size="sm">
          Za tento měsíc zatím není zapsán žádný výkaz.
        </Text>
      ) : (
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Odběratel</Table.Th>
              <Table.Th>Hodiny</Table.Th>
              <Table.Th>Přesčasy</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {timesheets.map((t) => (
              <Table.Tr key={t.name}>
                <Table.Td>{t.name}</Table.Td>
                <Table.Td>{t.hours.toFixed(2)}</Table.Td>
                <Table.Td>
                  {t.overtime.length > 0 ? (
                    <Badge color="orange" variant="light">
                      {t.overtime.length}× nad 8h
                    </Badge>
                  ) : (
                    "—"
                  )}
                </Table.Td>
                <Table.Td>
                  <LinkAnchor
                    href={`/invoices/new?year=${dayjs().year()}&month=${dayjs().month() + 1}&alias=${t.name}`}
                    size="sm"
                  >
                    Založit fakturu
                  </LinkAnchor>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
      {errors.length > 0 && (
        <Text size="sm" c="red" mt="sm">
          {errors.length} nerozpoznaných řádků ve výkazu — zkontrolujte editor.
        </Text>
      )}
    </Card>
  );
}

export function RecentInvoicesCard({ invoices }: { invoices: Invoices }) {
  return (
    <Card withBorder padding="lg">
      <Group justify="space-between" mb="sm">
        <Title order={4}>Poslední faktury</Title>
        <LinkButton href="/invoices" variant="light">
          Zobrazit vše
        </LinkButton>
      </Group>
      {invoices.length === 0 ? (
        <Text c="dimmed" size="sm">
          Zatím nebyla vystavena žádná faktura.
        </Text>
      ) : (
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Číslo</Table.Th>
              <Table.Th>Odběratel</Table.Th>
              <Table.Th>Stav</Table.Th>
              <Table.Th>Částka</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {invoices.slice(0, 8).map((inv) => (
              <Table.Tr key={inv.id}>
                <Table.Td>
                  <LinkAnchor href={`/invoices/${inv.id}`} size="sm">
                    {inv.number}
                  </LinkAnchor>
                </Table.Td>
                <Table.Td>{inv.payer.companyName}</Table.Td>
                <Table.Td>
                  <Badge variant="light">{STATUS_LABEL[inv.status]}</Badge>
                </Table.Td>
                <Table.Td>{Number(inv.totalAmount).toLocaleString("cs-CZ")} Kč</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Card>
  );
}
