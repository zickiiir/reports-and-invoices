import { Stack, Title } from "@mantine/core";

import { CustomersTable } from "./customers-table";

export default function CustomersPage() {
  return (
    <Stack gap="lg">
      <Title order={2}>Odběratelé</Title>
      <CustomersTable />
    </Stack>
  );
}
