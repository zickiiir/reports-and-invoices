import { redirect } from "next/navigation";
import { Stack, Title } from "@mantine/core";

import { api } from "~/trpc/server";

import { UsersAdminTable } from "./users-admin-table";

export default async function AdminUsersPage() {
  const me = await api.user.me();
  if (me.role !== "super_user") redirect("/");

  return (
    <Stack gap="lg">
      <Title order={2}>Uživatelé</Title>
      <UsersAdminTable currentUserId={me.id} />
    </Stack>
  );
}
