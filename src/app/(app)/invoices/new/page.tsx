import { Stack, Title } from "@mantine/core";

import { BackLink } from "~/components/back-link";
import { api } from "~/trpc/server";

import { NewInvoiceForm } from "./new-invoice-form";

export default async function NewInvoicePage() {
  const [payers, customers] = await Promise.all([
    api.payer.list(),
    api.customer.list(),
  ]);

  return (
    <Stack gap="lg" maw={480}>
      <BackLink href="/invoices" label="Zpět na faktury" />
      <Title order={2}>Nová faktura</Title>
      <NewInvoiceForm
        payers={payers.filter((p) => !p.archived)}
        customers={customers}
      />
    </Stack>
  );
}
