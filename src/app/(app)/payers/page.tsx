import { Stack, Text, Title } from "@mantine/core";

import { PayersTable } from "./payers-table";

export default function PayersPage() {
  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>Plátci</Title>
        <Text c="dimmed" size="sm">
          Plátce je subjekt, který fakturu skutečně hradí. Jeden plátce může
          zastřešovat víc odběratelů/aliasů z výkazu (viz Odběratelé).
        </Text>
      </div>
      <PayersTable />
    </Stack>
  );
}
