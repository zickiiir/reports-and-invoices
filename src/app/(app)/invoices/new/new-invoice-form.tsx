"use client";

import { useRouter } from "next/navigation";
import dayjs from "dayjs";
import { Button, Card, Group, Select, Text, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { useQueryStates, parseAsInteger, parseAsString } from "nuqs";

import { api, type RouterOutputs } from "~/trpc/react";

type Payer = RouterOutputs["payer"]["list"][number];
type Customer = RouterOutputs["customer"]["list"][number];

const MONTHS = [
  "Leden", "Únor", "Březen", "Duben", "Květen", "Červen",
  "Červenec", "Srpen", "Září", "Říjen", "Listopad", "Prosinec",
].map((label, i) => ({ value: String(i + 1), label }));

export function NewInvoiceForm({
  payers,
  customers,
}: {
  payers: Payer[];
  customers: Customer[];
}) {
  const router = useRouter();
  const now = dayjs().subtract(1, "month");
  const [{ year, month, alias, payerId }] = useQueryStates({
    year: parseAsInteger.withDefault(now.year()),
    month: parseAsInteger.withDefault(now.month() + 1),
    alias: parseAsString,
    payerId: parseAsString,
  });

  const defaultPayerId =
    payerId ??
    customers.find((c) => c.alias === alias)?.payerId ??
    payers[0]?.id ??
    "";

  const form = useForm({
    initialValues: {
      payerId: defaultPayerId,
      sourceYear: year,
      sourceMonth: month,
      constantSymbol: "",
    },
  });

  const numberPreview = api.invoice.previewNumber.useQuery(
    {
      payerId: form.values.payerId,
      sourceYear: form.values.sourceYear,
      sourceMonth: form.values.sourceMonth,
    },
    { enabled: !!form.values.payerId },
  );

  const createDraft = api.invoice.createDraft.useMutation({
    onSuccess: (invoice) => {
      if (!invoice) return;
      notifications.show({ color: "green", message: "Koncept faktury vytvořen." });
      router.push(`/invoices/${invoice.id}`);
    },
    onError: (e) => notifications.show({ color: "red", message: e.message }),
  });

  const aliasesForSelectedPayer = customers
    .filter((c) => c.payerId === form.values.payerId && !c.archived)
    .map((c) => c.alias);

  return (
    <Card withBorder>
      <form
        onSubmit={form.onSubmit((values) =>
          createDraft.mutate({
            payerId: values.payerId,
            sourceYear: values.sourceYear,
            sourceMonth: values.sourceMonth,
            constantSymbol: values.constantSymbol || undefined,
          }),
        )}
      >
        <Select
          label="Plátce"
          required
          mb={aliasesForSelectedPayer.length > 0 ? 4 : "sm"}
          data={payers.map((p) => ({ value: p.id, label: p.companyName }))}
          {...form.getInputProps("payerId")}
        />
        {aliasesForSelectedPayer.length > 0 && (
          <Text size="xs" c="dimmed" mb="sm">
            Zahrne výkazy: {aliasesForSelectedPayer.join(", ")}
          </Text>
        )}
        <Group grow mb="sm">
          <Select
            label="Měsíc plnění"
            data={MONTHS}
            value={String(form.values.sourceMonth)}
            onChange={(v) => v && form.setFieldValue("sourceMonth", Number(v))}
          />
          <TextInput
            label="Rok"
            type="number"
            {...form.getInputProps("sourceYear")}
          />
        </Group>
        <Group grow mb="sm">
          <TextInput
            label="Číslo faktury (náhled)"
            value={numberPreview.data ?? "…"}
            disabled
          />
          <TextInput
            label="Variabilní symbol"
            value={numberPreview.data ?? ""}
            disabled
            description="= číslo faktury, lze změnit v detailu konceptu"
            inputWrapperOrder={["label", "input", "description"]}
          />
        </Group>
        <Group grow mb="sm">
          <TextInput label="Konstantní symbol" {...form.getInputProps("constantSymbol")} />
        </Group>
        <Group justify="flex-end" mt="md">
          <Button type="submit" loading={createDraft.isPending} disabled={!form.values.payerId}>
            Vytvořit koncept
          </Button>
        </Group>
      </form>
    </Card>
  );
}
