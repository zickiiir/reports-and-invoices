import { notFound } from "next/navigation";
import { Stack, Title } from "@mantine/core";

import { BackLink } from "~/components/back-link";
import { api } from "~/trpc/server";

import { InvoiceEditor } from "./invoice-editor";

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const invoice = await api.invoice.get({ id }).catch(() => null);
  if (!invoice) notFound();

  return (
    <Stack gap="lg">
      <BackLink href="/invoices" label="Zpět na faktury" />
      <Title order={2}>Faktura {invoice.number}</Title>
      <InvoiceEditor invoice={invoice} />
    </Stack>
  );
}
