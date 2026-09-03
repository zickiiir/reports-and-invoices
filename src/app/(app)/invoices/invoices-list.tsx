"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { Badge, Button, Group, Tabs, Text } from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import dayjs from "dayjs";
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef } from "mantine-react-table";
import { parseAsStringEnum, useQueryState } from "nuqs";

import { useTableUiState } from "~/components/use-table-ui-state";
import { api, type RouterOutputs } from "~/trpc/react";

type Invoice = RouterOutputs["invoice"]["list"][number];

const STATUSES = ["all", "draft", "issued", "paid"] as const;
const STATUS_LABEL: Record<(typeof STATUSES)[number], string> = {
  all: "Vše",
  draft: "Koncept",
  issued: "Vystavena",
  paid: "Zaplacena",
};

export function InvoicesList() {
  const router = useRouter();
  const [status, setStatus] = useQueryState(
    "status",
    parseAsStringEnum([...STATUSES]).withDefault("all"),
  );

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
      { accessorKey: "periodLabel", header: "Období" },
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
          data: STATUSES.filter((s) => s !== "all").map((s) => ({
            value: s,
            label: STATUS_LABEL[s],
          })),
        },
        Cell: ({ cell }) => (
          <Badge variant="light">
            {STATUS_LABEL[cell.getValue<Invoice["status"]>()]}
          </Badge>
        ),
      },
      {
        id: "totalAmount",
        header: "Částka",
        accessorFn: (row) => Number(row.totalAmount),
        Cell: ({ cell }) => `${cell.getValue<number>().toLocaleString("cs-CZ")} Kč`,
      },
    ],
    [],
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
