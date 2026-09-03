"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Alert,
  Anchor,
  Badge,
  Button,
  Grid,
  Group,
  Modal,
  NumberInput,
  Select,
  Switch,
  Text,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { IconPlus } from "@tabler/icons-react";
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef } from "mantine-react-table";

import { useTableUiState } from "~/components/use-table-ui-state";
import { applyLineItemTemplate } from "~/server/invoicing/line-item";
import { api, type RouterOutputs } from "~/trpc/react";

type Customer = RouterOutputs["customer"]["list"][number];

interface FormValues {
  alias: string;
  payerId: string;
  defaultHourlyRate: number | "";
  defaultLineItemText: string;
  archived: boolean;
}

const emptyValues: FormValues = {
  alias: "",
  payerId: "",
  defaultHourlyRate: "",
  defaultLineItemText: "",
  archived: false,
};

export function CustomersTable() {
  const utils = api.useUtils();
  const { data: customers, isLoading } = api.customer.list.useQuery();
  const { data: payers } = api.payer.list.useQuery();
  const { data: me } = api.user.me.useQuery();
  const [opened, setOpened] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);

  const form = useForm<FormValues>({ initialValues: emptyValues });

  const createMutation = api.customer.create.useMutation({
    onSuccess: async () => {
      notifications.show({ color: "green", message: "Odběratel vytvořen." });
      await utils.customer.list.invalidate();
      setOpened(false);
    },
    onError: (e) => notifications.show({ color: "red", message: e.message }),
  });
  const updateMutation = api.customer.update.useMutation({
    onSuccess: async () => {
      notifications.show({ color: "green", message: "Odběratel upraven." });
      await utils.customer.list.invalidate();
      setOpened(false);
    },
    onError: (e) => notifications.show({ color: "red", message: e.message }),
  });
  const archiveMutation = api.customer.setArchived.useMutation({
    onSuccess: async () => utils.customer.list.invalidate(),
  });

  const payerOptions =
    payers?.map((p) => ({ value: p.id, label: p.companyName })) ?? [];

  const openCreate = () => {
    setEditing(null);
    form.setValues(emptyValues);
    setOpened(true);
  };

  const openEdit = (c: Customer) => {
    setEditing(c);
    form.setValues({
      alias: c.alias,
      payerId: c.payerId,
      defaultHourlyRate: c.defaultHourlyRate ? Number(c.defaultHourlyRate) : "",
      defaultLineItemText: c.defaultLineItemText ?? "",
      archived: c.archived,
    });
    setOpened(true);
  };

  const handleSubmit = form.onSubmit((values) => {
    const payload = {
      alias: values.alias,
      payerId: values.payerId,
      defaultHourlyRate:
        values.defaultHourlyRate === "" ? undefined : Number(values.defaultHourlyRate),
      defaultLineItemText: values.defaultLineItemText || undefined,
    };
    if (editing) {
      updateMutation.mutate({ id: editing.id, ...payload });
      if (values.archived !== editing.archived) {
        archiveMutation.mutate({ id: editing.id, archived: values.archived });
      }
    } else {
      createMutation.mutate(payload);
    }
  });

  const columns = useMemo<MRT_ColumnDef<Customer>[]>(
    () => [
      {
        accessorKey: "alias",
        header: "Alias",
        Cell: ({ cell }) => <Text fw={600}>{cell.getValue<string>()}</Text>,
      },
      {
        id: "payer",
        header: "Plátce",
        accessorFn: (row) => row.payer?.companyName ?? "",
      },
      {
        id: "rate",
        header: "Sazba (Kč/h)",
        accessorFn: (row) =>
          row.defaultHourlyRate ? Number(row.defaultHourlyRate) : null,
        Cell: ({ cell }) => cell.getValue<number | null>()?.toLocaleString("cs-CZ") ?? "—",
      },
      {
        id: "archived",
        header: "Stav",
        accessorFn: (row) => (row.archived ? "archived" : "active"),
        filterVariant: "select",
        mantineFilterSelectProps: {
          searchable: false,
          data: [
            { value: "active", label: "Aktivní" },
            { value: "archived", label: "Archivováno" },
          ],
        },
        Cell: ({ row }) =>
          row.original.archived ? (
            <Badge color="gray">Archivováno</Badge>
          ) : (
            <Badge color="green" variant="light">
              Aktivní
            </Badge>
          ),
      },
    ],
    [],
  );

  const tableUiState = useTableUiState("customers");
  const table = useMantineReactTable({
    columns,
    data: customers ?? [],
    state: { isLoading, ...tableUiState.state },
    onDensityChange: tableUiState.onDensityChange,
    onShowColumnFiltersChange: tableUiState.onShowColumnFiltersChange,
    onShowGlobalFilterChange: tableUiState.onShowGlobalFilterChange,
    enableColumnActions: false,
    mantineTableProps: { striped: true, highlightOnHover: true },
    mantineTableBodyRowProps: ({ row }) => ({
      onClick: () => openEdit(row.original),
      style: { cursor: "pointer" },
    }),
  });

  return (
    <>
      <Group justify="flex-end">
        <Button leftSection={<IconPlus size={16} />} onClick={openCreate}>
          Nový odběratel
        </Button>
      </Group>

      <MantineReactTable table={table} />

      <Modal
        opened={opened}
        onClose={() => setOpened(false)}
        title={editing ? "Upravit odběratele" : "Nový odběratel"}
        size="lg"
      >
        {payerOptions.length === 0 ? (
          <Alert color="yellow" variant="light">
            Nejdřív musíte založit alespoň jednoho plátce v sekci{" "}
            <Anchor component={Link} href="/payers">
              Plátci
            </Anchor>
            .
          </Alert>
        ) : (
          <form onSubmit={handleSubmit}>
            <Grid>
              <Grid.Col span={4}>
                <TextInput
                  label="Alias (z výkazu)"
                  placeholder="KM"
                  required
                  disabled={!!editing}
                  {...form.getInputProps("alias")}
                />
              </Grid.Col>
              <Grid.Col span={8}>
                <Select
                  label="Plátce"
                  placeholder="Kdo fakturu hradí"
                  required
                  data={payerOptions}
                  {...form.getInputProps("payerId")}
                />
              </Grid.Col>
              <Grid.Col span={6}>
                <NumberInput
                  label="Hodinová sazba (Kč)"
                  description="Prázdné = použije se základní sazba z Nastavení"
                  inputWrapperOrder={["label", "input", "description"]}
                  min={0}
                  {...form.getInputProps("defaultHourlyRate")}
                />
              </Grid.Col>
              <Grid.Col span={6}>
                <TextInput
                  label="Výchozí text položky faktury"
                  description="Prázdné = použije se šablona z Nastavení"
                  inputWrapperOrder={["label", "input", "description"]}
                  placeholder={applyLineItemTemplate(
                    me?.defaultLineItemTemplate,
                    form.values.alias || "ALIAS",
                  )}
                  {...form.getInputProps("defaultLineItemText")}
                />
              </Grid.Col>
              {editing && (
                <Grid.Col span={12}>
                  <Switch
                    label="Aktivní odběratel"
                    description="Vypnuto = archivováno, nenabízí se při zakládání nových výkazů/faktur"
                    checked={!form.values.archived}
                    onChange={(e) =>
                      form.setFieldValue("archived", !e.currentTarget.checked)
                    }
                  />
                </Grid.Col>
              )}
            </Grid>
            <Group justify="flex-end" mt="md">
              <Button
                type="submit"
                loading={createMutation.isPending || updateMutation.isPending}
              >
                Uložit
              </Button>
            </Group>
          </form>
        )}
      </Modal>
    </>
  );
}
