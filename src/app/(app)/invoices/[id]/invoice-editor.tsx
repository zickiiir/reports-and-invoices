"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Grid,
  Group,
  NumberInput,
  Select,
  Table,
  Text,
  TextInput,
  Textarea,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconDownload, IconExternalLink, IconPlus, IconTrash } from "@tabler/icons-react";

import { ReportPreviewModal } from "~/components/report-preview-modal";
import { invoiceStatusEnum } from "~/server/db/schema";
import { api, type RouterOutputs } from "~/trpc/react";

type Invoice = RouterOutputs["invoice"]["get"];

interface ItemRow {
  name: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  vatRate: number;
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Koncept",
  issued: "Vystavena",
  paid: "Zaplacena",
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const rowTotal = (r: ItemRow) => round2(r.quantity * r.unitPrice - r.discount);

export function InvoiceEditor({ invoice }: { invoice: Invoice }) {
  const router = useRouter();
  const utils = api.useUtils();

  const [items, setItems] = useState<ItemRow[]>(
    invoice.items
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((i) => ({
        name: i.name,
        quantity: Number(i.quantity),
        unitPrice: Number(i.unitPrice),
        discount: Number(i.discount),
        vatRate: Number(i.vatRate),
      })),
  );
  const [meta, setMeta] = useState({
    variableSymbol: invoice.variableSymbol ?? "",
    constantSymbol: invoice.constantSymbol ?? "",
    issueDate: invoice.issueDate ?? "",
    dueDate: invoice.dueDate ?? "",
    performanceDate: invoice.performanceDate ?? "",
    periodLabel: invoice.periodLabel ?? "",
    status: invoice.status,
    note: invoice.note ?? "",
  });

  const updateMutation = api.invoice.update.useMutation({
    onSuccess: async () => {
      notifications.show({ color: "green", message: "Faktura uložena." });
      await utils.invoice.get.invalidate({ id: invoice.id });
      await utils.invoice.list.invalidate();
    },
    onError: (e) => notifications.show({ color: "red", message: e.message }),
  });
  const deleteMutation = api.invoice.delete.useMutation({
    onSuccess: async () => {
      notifications.show({ color: "green", message: "Faktura smazána." });
      await utils.invoice.list.invalidate();
      router.push("/invoices");
    },
    onError: (e) => notifications.show({ color: "red", message: e.message }),
  });

  // The invoice itself doesn't bind items to a specific alias (the item name can be
  // renamed) — so we re-derive the rate the timesheet is billed at from the payer +
  // invoiced period again, same as when the draft was created.
  const period =
    invoice.sourceYear && invoice.sourceMonth
      ? `${invoice.sourceYear}${String(invoice.sourceMonth).padStart(2, "0")}`
      : null;
  const customersQuery = api.customer.list.useQuery({ userId: invoice.userId });
  const timesheetQuery = api.timesheet.read.useQuery(
    { userId: invoice.userId, period: period ?? "" },
    { enabled: !!period },
  );
  const payerAliases = new Set(
    (customersQuery.data ?? [])
      .filter((c) => c.payerId === invoice.payerId)
      .map((c) => c.alias),
  );
  const timesheetAliases = (timesheetQuery.data?.parsed.timesheets ?? []).filter(
    (t) => payerAliases.has(t.name) && t.hours > 0,
  );

  const [preview, setPreview] = useState<{
    title: string;
    url: string;
    filename: string;
  } | null>(null);

  const openInvoicePreview = () => {
    setPreview({
      title: `Faktura ${invoice.number}`,
      url: `/api/invoices/${invoice.id}/pdf`,
      filename: `Faktura-${invoice.number}.pdf`,
    });
  };

  const openTimesheetPreview = (aliases: string[]) => {
    if (!period || aliases.length === 0) return;
    setPreview({
      title:
        aliases.length === 1
          ? `Výkaz ${aliases[0]} ${period}`
          : `Výkazy ${period} (${aliases.join(", ")})`,
      url: `/api/timesheets/report?userId=${invoice.userId}&period=${period}&alias=${aliases.join(",")}&format=pdf`,
      filename:
        aliases.length === 1
          ? `Vykaz_${aliases[0]}_${period}.pdf`
          : `Vykazy_${period}.pdf`,
    });
  };

  const total = round2(items.reduce((sum, i) => sum + rowTotal(i), 0));

  const updateItem = (idx: number, patch: Partial<ItemRow>) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };

  const handleSave = () => {
    updateMutation.mutate({
      id: invoice.id,
      ...meta,
      status: meta.status,
      items,
    });
  };

  return (
    <>
      <Group justify="space-between">
        <Badge size="lg" variant="light">
          {STATUS_LABEL[invoice.status]}
        </Badge>
        <Group>
          <Button
            variant="light"
            leftSection={<IconDownload size={16} />}
            onClick={openInvoicePreview}
          >
            PDF
          </Button>
          {invoice.status === "draft" && (
            <Button
              color="red"
              variant="light"
              leftSection={<IconTrash size={16} />}
              onClick={() => deleteMutation.mutate({ id: invoice.id })}
              loading={deleteMutation.isPending}
            >
              Smazat
            </Button>
          )}
          <Button onClick={handleSave} loading={updateMutation.isPending}>
            Uložit
          </Button>
        </Group>
      </Group>

      {period && (
        <Card withBorder mt="md">
          <Group justify="space-between" mb="sm">
            <Text fw={600}>Výkazy k faktuře</Text>
            <Button
              component={Link}
              href={`/timesheets?userId=${invoice.userId}&period=${period}`}
              variant="subtle"
              size="xs"
              leftSection={<IconExternalLink size={14} />}
            >
              Otevřít výkaz v editoru
            </Button>
          </Group>
          {timesheetAliases.length > 0 ? (
            <Group>
              {timesheetAliases.map((t) => (
                <Button
                  key={t.name}
                  variant="light"
                  size="xs"
                  leftSection={<IconDownload size={14} />}
                  onClick={() => openTimesheetPreview([t.name])}
                >
                  Výkaz {t.name} (PDF)
                </Button>
              ))}
              {timesheetAliases.length > 1 && (
                <Button
                  size="xs"
                  leftSection={<IconDownload size={14} />}
                  onClick={() => openTimesheetPreview(timesheetAliases.map((t) => t.name))}
                >
                  Všechny výkazy (PDF)
                </Button>
              )}
            </Group>
          ) : (
            <Text size="sm" c="dimmed">
              Pro toto období nejsou u plátce žádné výkazy s hodinami.
            </Text>
          )}
        </Card>
      )}

      <Card withBorder mt="md">
        <Text fw={600} mb="sm">
          {invoice.payer.companyName}
        </Text>
        <Grid>
          <Grid.Col span={3}>
            <TextInput
              label="Variabilní symbol"
              value={meta.variableSymbol}
              onChange={(e) => setMeta((m) => ({ ...m, variableSymbol: e.currentTarget.value }))}
            />
          </Grid.Col>
          <Grid.Col span={3}>
            <TextInput
              label="Konstantní symbol"
              value={meta.constantSymbol}
              onChange={(e) => setMeta((m) => ({ ...m, constantSymbol: e.currentTarget.value }))}
            />
          </Grid.Col>
          <Grid.Col span={3}>
            <Select
              label="Stav"
              data={invoiceStatusEnum.enumValues.map((s) => ({
                value: s,
                label: STATUS_LABEL[s]!,
              }))}
              value={meta.status}
              allowDeselect={false}
              onChange={(v) => {
                if (!v) return;
                const status = invoiceStatusEnum.enumValues.find((s) => s === v);
                if (status) setMeta((m) => ({ ...m, status }));
              }}
            />
          </Grid.Col>
          <Grid.Col span={3}>
            <TextInput
              label="Období (slovy)"
              value={meta.periodLabel}
              onChange={(e) => setMeta((m) => ({ ...m, periodLabel: e.currentTarget.value }))}
            />
          </Grid.Col>
          <Grid.Col span={4}>
            <TextInput
              label="Datum vystavení"
              type="date"
              value={meta.issueDate}
              onChange={(e) => setMeta((m) => ({ ...m, issueDate: e.currentTarget.value }))}
            />
          </Grid.Col>
          <Grid.Col span={4}>
            <TextInput
              label="Datum splatnosti"
              type="date"
              value={meta.dueDate}
              onChange={(e) => setMeta((m) => ({ ...m, dueDate: e.currentTarget.value }))}
            />
          </Grid.Col>
          <Grid.Col span={4}>
            <TextInput
              label="Datum uskutečnění plnění"
              type="date"
              value={meta.performanceDate}
              onChange={(e) => setMeta((m) => ({ ...m, performanceDate: e.currentTarget.value }))}
            />
          </Grid.Col>
          <Grid.Col span={12}>
            <Textarea
              label="Poznámka"
              value={meta.note}
              onChange={(e) => setMeta((m) => ({ ...m, note: e.currentTarget.value }))}
            />
          </Grid.Col>
        </Grid>
      </Card>

      <Card withBorder mt="md">
        <Group justify="space-between" mb="sm">
          <Text fw={600}>Položky</Text>
          <Button
            size="xs"
            variant="light"
            leftSection={<IconPlus size={14} />}
            onClick={() =>
              setItems((prev) => [
                ...prev,
                { name: "", quantity: 1, unitPrice: 0, discount: 0, vatRate: 0 },
              ])
            }
          >
            Přidat položku
          </Button>
        </Group>
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Název</Table.Th>
              <Table.Th w={110}>Množství</Table.Th>
              <Table.Th w={130}>Jedn. cena</Table.Th>
              <Table.Th w={110}>Sleva</Table.Th>
              <Table.Th w={90}>DPH %</Table.Th>
              <Table.Th w={120}>Celkem</Table.Th>
              <Table.Th w={40} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {items.map((item, idx) => (
              <Table.Tr key={idx}>
                <Table.Td>
                  <TextInput
                    value={item.name}
                    onChange={(e) => updateItem(idx, { name: e.currentTarget.value })}
                  />
                </Table.Td>
                <Table.Td>
                  <NumberInput
                    value={item.quantity}
                    onChange={(v) => updateItem(idx, { quantity: Number(v) || 0 })}
                  />
                </Table.Td>
                <Table.Td>
                  <NumberInput
                    value={item.unitPrice}
                    onChange={(v) => updateItem(idx, { unitPrice: Number(v) || 0 })}
                  />
                </Table.Td>
                <Table.Td>
                  <NumberInput
                    value={item.discount}
                    onChange={(v) => updateItem(idx, { discount: Number(v) || 0 })}
                  />
                </Table.Td>
                <Table.Td>
                  <NumberInput
                    value={item.vatRate}
                    onChange={(v) => updateItem(idx, { vatRate: Number(v) || 0 })}
                  />
                </Table.Td>
                <Table.Td>{rowTotal(item).toLocaleString("cs-CZ")} Kč</Table.Td>
                <Table.Td>
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    disabled={items.length <= 1}
                    onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        <Group justify="flex-end" mt="md">
          <Text size="lg" fw={700}>
            Celkem: {total.toLocaleString("cs-CZ")} Kč
          </Text>
        </Group>
      </Card>

      <ReportPreviewModal
        opened={!!preview}
        onClose={() => setPreview(null)}
        title={preview?.title ?? ""}
        url={preview?.url ?? null}
        filename={preview?.filename ?? ""}
      />
    </>
  );
}
