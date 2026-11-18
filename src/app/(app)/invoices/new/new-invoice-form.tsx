"use client";

import { useRouter } from "next/navigation";
import dayjs from "dayjs";
import { useState } from "react";
// The date picker needs the Czech locale in the client bundle too, see invoice-editor.tsx.
import "dayjs/locale/cs";
import {
  Button,
  Card,
  Checkbox,
  Group,
  NumberInput,
  Select,
  Text,
  TextInput,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
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
      fromTimesheet: true,
      issueDate: dayjs().format("YYYY-MM-DD"),
      constantSymbol: "",
    },
  });

  const { fromTimesheet, sourceYear, sourceMonth, issueDate } = form.values;
  const source = fromTimesheet
    ? { fromTimesheet: true as const, sourceYear, sourceMonth }
    : { fromTimesheet: false as const, issueDate };

  const numberPreview = api.invoice.previewNumber.useQuery(
    { payerId: form.values.payerId, source },
    { enabled: !!form.values.payerId },
  );

  // The user's explicit pick ("" = next in the series), remembered only for the
  // payer/period it was made for — changing them goes back to the server's suggestion,
  // which knows whether the period is a step back in time (→ a gap) or forward (→ next).
  const previewKey = `${form.values.payerId}:${JSON.stringify(source)}`;
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
            source,
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
        {fromTimesheet && aliasesForSelectedPayer.length > 0 && (
          <Text size="xs" c="dimmed" mb="sm">
            Zahrne výkazy: {aliasesForSelectedPayer.join(", ")}
          </Text>
        )}
        <Checkbox
          label="Bez výkazu"
          description="Položky vyplníš ručně, číselnou řadu určí datum vystavení"
          mb="sm"
          checked={!fromTimesheet}
          onChange={(e) => form.setFieldValue("fromTimesheet", !e.currentTarget.checked)}
        />
        {fromTimesheet ? (
          <Group grow mb="sm">
            <Select
              label="Měsíc plnění"
              data={MONTHS}
              value={String(sourceMonth)}
              onChange={(v) => v && form.setFieldValue("sourceMonth", Number(v))}
            />
            <NumberInput
              label="Rok"
              allowDecimal={false}
              allowNegative={false}
              value={sourceYear}
              onChange={(v) => typeof v === "number" && form.setFieldValue("sourceYear", v)}
            />
          </Group>
        ) : (
          <DatePickerInput
            label="Datum vystavení"
            valueFormat="D. M. YYYY"
            mb="sm"
            value={issueDate}
            onChange={(v) => v && form.setFieldValue("issueDate", v)}
          />
        )}
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
