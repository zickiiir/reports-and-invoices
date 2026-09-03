import { Stack, Title } from "@mantine/core";

import { InvoicesList } from "./invoices-list";

export default function InvoicesPage() {
  return (
    <Stack gap="lg">
      <Title order={2}>Faktury</Title>
      <InvoicesList />
    </Stack>
  );
}
