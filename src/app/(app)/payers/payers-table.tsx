"use client";

import { useMemo, useState } from "react";
import {
  Badge,
  Button,
  Grid,
  Group,
  Modal,
  Switch,
  Text,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { IconPlus } from "@tabler/icons-react";
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef } from "mantine-react-table";

import { useTableUiState } from "~/components/use-table-ui-state";
import { api, type RouterOutputs } from "~/trpc/react";

type Payer = RouterOutputs["payer"]["list"][number];

interface FormValues {
  companyName: string;
  street: string;
  city: string;
  zip: string;
  ico: string;
  dic: string;
  archived: boolean;
}

const emptyValues: FormValues = {
  companyName: "",
  street: "",
  city: "",
  zip: "",
  ico: "",
  dic: "",
  archived: false,
};

export function PayersTable() {
  const utils = api.useUtils();
  const { data: payers, isLoading } = api.payer.list.useQuery();
  const [opened, setOpened] = useState(false);
  const [editing, setEditing] = useState<Payer | null>(null);

  const form = useForm<FormValues>({ initialValues: emptyValues });

  const createMutation = api.payer.create.useMutation({
    onSuccess: async () => {
      notifications.show({ color: "green", message: "Plátce vytvořen." });
      await utils.payer.list.invalidate();
      setOpened(false);
    },
    onError: (e) => notifications.show({ color: "red", message: e.message }),
  });
  const updateMutation = api.payer.update.useMutation({
    onSuccess: async () => {
      notifications.show({ color: "green", message: "Plátce upraven." });
      await utils.payer.list.invalidate();
      setOpened(false);
    },
    onError: (e) => notifications.show({ color: "red", message: e.message }),
  });
  const archiveMutation = api.payer.setArchived.useMutation({
    onSuccess: async () => utils.payer.list.invalidate(),
  });

  const openCreate = () => {
    setEditing(null);
    form.setValues(emptyValues);
    setOpened(true);
  };

  const openEdit = (p: Payer) => {
    setEditing(p);
    form.setValues({
      companyName: p.companyName,
      street: p.street ?? "",
      city: p.city ?? "",
      zip: p.zip ?? "",
      ico: p.ico ?? "",
      dic: p.dic ?? "",
      archived: p.archived,
    });
    setOpened(true);
  };

  const handleSubmit = form.onSubmit((values) => {
    const payload = {
      companyName: values.companyName,
      street: values.street || undefined,
      city: values.city || undefined,
      zip: values.zip || undefined,
      ico: values.ico || undefined,
      dic: values.dic || undefined,
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

  const columns = useMemo<MRT_ColumnDef<Payer>[]>(
    () => [
      {
        accessorKey: "companyName",
        header: "Název",
        Cell: ({ cell }) => <Text fw={600}>{cell.getValue<string>()}</Text>,
      },
      { accessorKey: "ico", header: "IČ" },
      { accessorKey: "city", header: "Město" },
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

  const tableUiState = useTableUiState("payers");
  const table = useMantineReactTable({
    columns,
    data: payers ?? [],
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
          Nový plátce
        </Button>
      </Group>

      <MantineReactTable table={table} />

      <Modal
        opened={opened}
        onClose={() => setOpened(false)}
        title={editing ? "Upravit plátce" : "Nový plátce"}
        size="lg"
      >
        <form onSubmit={handleSubmit}>
          <Grid>
            <Grid.Col span={12}>
              <TextInput
                label="Název společnosti"
                required
                {...form.getInputProps("companyName")}
              />
            </Grid.Col>
            <Grid.Col span={8}>
              <TextInput label="Ulice" {...form.getInputProps("street")} />
            </Grid.Col>
            <Grid.Col span={4}>
              <TextInput label="PSČ" {...form.getInputProps("zip")} />
            </Grid.Col>
            <Grid.Col span={12}>
              <TextInput label="Město" {...form.getInputProps("city")} />
            </Grid.Col>
            <Grid.Col span={6}>
              <TextInput label="IČ" {...form.getInputProps("ico")} />
            </Grid.Col>
            <Grid.Col span={6}>
              <TextInput label="DIČ" {...form.getInputProps("dic")} />
            </Grid.Col>
            {editing && (
              <Grid.Col span={12}>
                <Switch
                  label="Aktivní plátce"
                  description="Vypnuto = archivováno, nenabízí se při zakládání nových odběratelů/faktur"
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
      </Modal>
    </>
  );
}
