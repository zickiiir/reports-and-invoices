import { Stack, Title } from "@mantine/core";

import { api } from "~/trpc/server";

import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  const me = await api.user.me();

  return (
    <Stack gap="lg" maw={720}>
      <Title order={2}>Nastavení</Title>
      <SettingsForm me={me} />
    </Stack>
  );
}
