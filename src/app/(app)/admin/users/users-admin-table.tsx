"use client";

import { useMemo, useState } from "react";
import {
  Badge,
  Button,
  Group,
  Modal,
  PasswordInput,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { IconCheck, IconPlus, IconX } from "@tabler/icons-react";
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef } from "mantine-react-table";

import { useTableUiState } from "~/components/use-table-ui-state";
import { generatePassword, PASSWORD_CHECKS } from "~/lib/password-policy";
import { type UserRole } from "~/server/db/schema";
import { api, type RouterOutputs } from "~/trpc/react";

const ROLE_LABEL: Record<UserRole, string> = {
  super_user: "Super-user",
  senior_programmer: "Senior programátor",
  developer: "Vývojář",
};
const ROLE_OPTIONS = Object.entries(ROLE_LABEL).map(([value, label]) => ({
  value,
  label,
}));

type UserRow = RouterOutputs["user"]["list"][number];


export function UsersAdminTable({ currentUserId }: { currentUserId: string }) {
  const utils = api.useUtils();
  const { data: users, isLoading } = api.user.list.useQuery();
  const [opened, setOpened] = useState(false);

  const createForm = useForm({
    initialValues: {
      email: "",
      password: "",
      firstName: "",
      lastName: "",
      role: "developer" as UserRole,
      managerId: "",
    },
    validate: {
      password: (v) =>
        PASSWORD_CHECKS.every((check) => check.test(v))
          ? null
          : "Heslo nesplňuje všechny požadavky níže",
    },
  });

  const createMutation = api.user.create.useMutation({
    onSuccess: async () => {
      notifications.show({ color: "green", message: "Uživatel vytvořen." });
      await utils.user.list.invalidate();
      setOpened(false);
      createForm.reset();
    },
    onError: (e) => notifications.show({ color: "red", message: e.message }),
  });

  const updateMutation = api.user.updateRoleAndManager.useMutation({
    onSuccess: async () => {
      notifications.show({ color: "green", message: "Uloženo." });
      await utils.user.list.invalidate();
    },
    onError: (e) => notifications.show({ color: "red", message: e.message }),
  });

  const seniorOptions =
    users
      ?.filter((u) => u.role === "senior_programmer" || u.role === "super_user")
      .map((u) => ({ value: u.id, label: u.name })) ?? [];

  const handleRoleChange = (user: UserRow, role: UserRole) => {
    updateMutation.mutate({
      id: user.id,
      role,
      managerId: role === "developer" ? user.managerId : null,
    });
  };

  const handleManagerChange = (user: UserRow, managerId: string | null) => {
    updateMutation.mutate({ id: user.id, role: user.role, managerId });
  };

  const columns = useMemo<MRT_ColumnDef<UserRow>[]>(
    () => [
      {
        id: "name",
        header: "Jméno",
        accessorFn: (row) =>
          row.firstName && row.lastName ? `${row.firstName} ${row.lastName}` : row.name,
        Cell: ({ row }) => (
          <>
            {row.original.firstName && row.original.lastName
              ? `${row.original.firstName} ${row.original.lastName}`
              : row.original.name}{" "}
            {row.original.id === currentUserId && <Badge size="xs">Vy</Badge>}
          </>
        ),
      },
      { accessorKey: "email", header: "E-mail" },
      {
        accessorKey: "role",
        header: "Role",
        Cell: ({ row }) => (
          <Select
            data={ROLE_OPTIONS}
            value={row.original.role}
            allowDeselect={false}
            disabled={row.original.id === currentUserId}
            onChange={(v) => v && handleRoleChange(row.original, v as UserRole)}
            w={200}
          />
        ),
      },
      {
        id: "manager",
        header: "Nadřízený (senior)",
        enableSorting: false,
        Cell: ({ row }) =>
          row.original.role === "developer" ? (
            <Select
              data={seniorOptions}
              value={row.original.managerId}
              placeholder="Bez nadřízeného"
              clearable
              onChange={(v) => handleManagerChange(row.original, v)}
              w={220}
            />
          ) : (
            "—"
          ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentUserId, seniorOptions],
  );

  const tableUiState = useTableUiState("users");
  const table = useMantineReactTable({
    columns,
    data: users ?? [],
    state: { isLoading, ...tableUiState.state },
    onDensityChange: tableUiState.onDensityChange,
    onShowColumnFiltersChange: tableUiState.onShowColumnFiltersChange,
    onShowGlobalFilterChange: tableUiState.onShowGlobalFilterChange,
    enableColumnActions: false,
    mantineTableProps: { striped: true, highlightOnHover: true },
  });

  return (
    <>
      <Group justify="flex-end">
        <Button leftSection={<IconPlus size={16} />} onClick={() => setOpened(true)}>
          Nový uživatel
        </Button>
      </Group>

      <MantineReactTable table={table} />

      <Modal opened={opened} onClose={() => setOpened(false)} title="Nový uživatel">
        <form
          onSubmit={createForm.onSubmit((values) =>
            createMutation.mutate({
              ...values,
              managerId: values.managerId || undefined,
            }),
          )}
        >
          <Group grow mb="sm">
            <TextInput label="Jméno" required {...createForm.getInputProps("firstName")} />
            <TextInput label="Příjmení" required {...createForm.getInputProps("lastName")} />
          </Group>
          <TextInput
            label="E-mail"
            required
            mb="sm"
            {...createForm.getInputProps("email")}
          />
          <Group align="flex-end" gap="xs" mb={4}>
            <PasswordInput
              label="Heslo"
              required
              style={{ flex: 1 }}
              {...createForm.getInputProps("password")}
            />
            <Button
              variant="light"
              onClick={() => createForm.setFieldValue("password", generatePassword())}
            >
              Generovat heslo
            </Button>
          </Group>
          <Stack gap={2} mb="sm">
            {PASSWORD_CHECKS.map((check) => {
              const ok = check.test(createForm.values.password);
              return (
                <Group key={check.label} gap={6}>
                  {ok ? (
                    <IconCheck size={14} color="var(--mantine-color-green-6)" />
                  ) : (
                    <IconX size={14} color="var(--mantine-color-gray-5)" />
                  )}
                  <Text size="xs" c={ok ? "green" : "dimmed"}>
                    {check.label}
                  </Text>
                </Group>
              );
            })}
          </Stack>
          <Select
            label="Role"
            data={ROLE_OPTIONS}
            allowDeselect={false}
            mb="sm"
            {...createForm.getInputProps("role")}
          />
          {createForm.values.role === "developer" && (
            <Select
              label="Nadřízený (senior)"
              data={seniorOptions}
              clearable
              mb="sm"
              {...createForm.getInputProps("managerId")}
            />
          )}
          <Group justify="flex-end" mt="md">
            <Button type="submit" loading={createMutation.isPending}>
              Vytvořit
            </Button>
          </Group>
        </form>
      </Modal>
    </>
  );
}
