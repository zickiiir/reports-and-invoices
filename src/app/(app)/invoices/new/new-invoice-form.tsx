"use client";

import { useRouter } from "next/navigation";
import dayjs from "dayjs";
import { useState } from "react";
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

  // The user's explicit pick ("" = next in the series), remembered only for the
  // payer/period it was made for — changing them goes back to the server's suggestion,
  // which knows whether the period is a step back in time (→ a gap) or forward (→ next).
  const previewKey = `${form.values.payerId}:${form.values.sourceYear}:${form.values.sourceMonth}`;
  const [choice, setChoice] = useState<{ key: string; value: string } | null>(null);
  const freeNumbers = numberPreview.data?.free ?? [];
  const suggested = numberPreview.data?.suggested ?? null;
  const picked = choice?.key === previewKey ? choice.value : (suggested ?? "");
  const selectedFree = picked && freeNumbers.includes(picked) ? picked : null;
  const effectiveNumber = selectedFree ?? numberPreview.data?.next;

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
            number: selectedFree ?? undefined,
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
          {freeNumbers.length > 0 && numberPreview.data ? (
            <Select
              label="Číslo faktury"
              searchable={false}
              allowDeselect={false}
              data={[
                { value: "", label: `${numberPreview.data.next} — další v řadě` },
                ...freeNumbers.map((n) => ({
                  value: n,
                  label: `${n} — volné číslo v řadě${n === suggested ? " (sedí k období)" : ""}`,
                })),
              ]}
              value={selectedFree ?? ""}
              onChange={(v) => setChoice({ key: previewKey, value: v ?? "" })}
              description="Volná čísla jsou díry v řadě, např. pro fakturu ke staršímu výkazu"
              inputWrapperOrder={["label", "input", "description"]}
            />
          ) : (
            <TextInput
              label="Číslo faktury (náhled)"
              value={numberPreview.data?.next ?? "…"}
              disabled
            />
          )}
          <TextInput
            label="Variabilní symbol"
            value={effectiveNumber ?? ""}
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
