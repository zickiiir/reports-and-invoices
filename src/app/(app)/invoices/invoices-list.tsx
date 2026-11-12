"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { Badge, Button, Group, Menu, Tabs, Text, UnstyledButton } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconCheck, IconChevronDown, IconPlus } from "@tabler/icons-react";
import dayjs from "dayjs";
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef } from "mantine-react-table";
import { parseAsStringEnum, useQueryState } from "nuqs";

import { useTableUiState } from "~/components/use-table-ui-state";
import { invoiceStatusEnum } from "~/server/db/schema";
import { api, type RouterOutputs } from "~/trpc/react";

type Invoice = RouterOutputs["invoice"]["list"][number];

const STATUSES = ["all", "draft", "issued", "paid"] as const;
const STATUS_LABEL: Record<(typeof STATUSES)[number], string> = {
  all: "Vše",
  draft: "Koncept",
  issued: "Vystavena",
  paid: "Zaplacena",
};

const STATUS_OPTIONS = invoiceStatusEnum.enumValues.map((s) => ({
  value: s,
  label: STATUS_LABEL[s],
}));

/** Lowercase Czech month names — `periodLabel` holds them capitalized ("Prosinec"). */
const MONTHS_CS = [
  "leden",
  "únor",
  "březen",
  "duben",
  "květen",
  "červen",
  "červenec",
  "srpen",
  "září",
  "říjen",
  "listopad",
  "prosinec",
];

/** "prosinec 2025" — the year makes the list readable across years. `periodLabel` is
 * user-editable, so a custom label is kept as written and only gets the year appended. */
function formatPeriod(invoice: Invoice): string {
  const label = invoice.periodLabel?.trim() ?? "";
  if (!invoice.sourceYear) return label;
  if (/\d{4}/.test(label)) return label;
  const month = MONTHS_CS.find((m) => m === label.toLowerCase());
  return `${month ?? label} ${invoice.sourceYear}`.trim();
}

function periodKey(invoice: Invoice): number {
  return (invoice.sourceYear ?? 0) * 100 + (invoice.sourceMonth ?? 0);
}

export function InvoicesList() {
  const router = useRouter();
  const [status, setStatus] = useQueryState(
    "status",
    parseAsStringEnum([...STATUSES]).withDefault("all"),
  );

  const utils = api.useUtils();
  const setStatusMutation = api.invoice.setStatus.useMutation({
    onSuccess: async (_data, variables) => {
      notifications.show({
        color: "green",
        message: `Stav faktury změněn na „${STATUS_LABEL[variables.status]}“`,
      });
      await utils.invoice.list.invalidate();
      await utils.invoice.get.invalidate({ id: variables.id });
    },
    onError: (err) => notifications.show({ color: "red", message: err.message }),
  });

  const { data: invoices, isLoading } = api.invoice.list.useQuery({
    status: status === "all" ? undefined : status,
  });

  const columns = useMemo<MRT_ColumnDef<Invoice>[]>(
    () => [
      {
        accessorKey: "number",
        header: "Číslo",
        Cell: ({ cell }) => <Text fw={600}>{cell.getValue<string>()}</Text>,
      },
      {
        id: "payer",
        header: "Odběratel",
        accessorFn: (row) => row.payer?.companyName ?? "",
      },
      {
        id: "period",
        header: "Období",
        accessorFn: formatPeriod,
        // Chronologically by the timesheet period, not alphabetically by month name.
        sortingFn: (a, b) => periodKey(a.original) - periodKey(b.original),
      },
      {
        accessorKey: "dueDate",
        header: "Splatnost",
        Cell: ({ cell }) => {
          const value = cell.getValue<string | null>();
          return value ? dayjs(value).format("D. M. YYYY") : "—";
        },
      },
      {
        accessorKey: "status",
        header: "Stav",
        filterVariant: "select",
        mantineFilterSelectProps: {
          searchable: false,
          data: STATUS_OPTIONS,
        },
        // The row itself navigates to the detail on click — the status menu must not.
        Cell: ({ row }) => {
          const current = row.original.status;
          const pending =
            setStatusMutation.isPending && setStatusMutation.variables?.id === row.original.id;
          return (
            <div onClick={(e) => e.stopPropagation()}>
              <Menu position="bottom-start" withinPortal disabled={pending}>
                <Menu.Target>
                  <UnstyledButton aria-label="Změnit stav faktury">
                    <Badge
                      variant="light"
                      rightSection={<IconChevronDown size={12} />}
                      style={{ cursor: pending ? "wait" : "pointer" }}
                    >
                      {STATUS_LABEL[current]}
                    </Badge>
                  </UnstyledButton>
                </Menu.Target>
                <Menu.Dropdown>
                  {invoiceStatusEnum.enumValues.map((st) => (
                    <Menu.Item
                      key={st}
                      leftSection={
                        st === current ? <IconCheck size={14} /> : <span style={{ width: 14 }} />
                      }
                      onClick={() => {
                        if (st !== current) {
                          setStatusMutation.mutate({ id: row.original.id, status: st });
                        }
                      }}
                    >
                      <Badge variant="light">
                        {STATUS_LABEL[st]}
                      </Badge>
                    </Menu.Item>
                  ))}
                </Menu.Dropdown>
              </Menu>
            </div>
          );
        },
      },
      {
        id: "totalAmount",
        header: "Částka",
        accessorFn: (row) => Number(row.totalAmount),
        Cell: ({ cell }) => `${cell.getValue<number>().toLocaleString("cs-CZ")} Kč`,
      },
    ],
    [setStatusMutation],
  );

  const tableUiState = useTableUiState("invoices");
  const table = useMantineReactTable({
    columns,
    data: invoices ?? [],
    state: { isLoading, ...tableUiState.state },
    onDensityChange: tableUiState.onDensityChange,
    onShowColumnFiltersChange: tableUiState.onShowColumnFiltersChange,
    onShowGlobalFilterChange: tableUiState.onShowGlobalFilterChange,
    enableColumnActions: false,
    initialState: { sorting: [{ id: "number", desc: true }] },
    mantineTableProps: { striped: true, highlightOnHover: true },
    mantineTableBodyRowProps: ({ row }) => ({
      onClick: () => router.push(`/invoices/${row.original.id}`),
      style: { cursor: "pointer" },
    }),
  });

  return (
    <>
      <Group justify="space-between">
        <Tabs value={status} onChange={(v) => v && setStatus(v as (typeof STATUSES)[number])}>
          <Tabs.List>
            {STATUSES.map((s) => (
              <Tabs.Tab key={s} value={s}>
                {STATUS_LABEL[s]}
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs>
        <Button component={Link} href="/invoices/new" leftSection={<IconPlus size={16} />}>
          Nová faktura
        </Button>
      </Group>

      <MantineReactTable table={table} />
    </>
  );
}
