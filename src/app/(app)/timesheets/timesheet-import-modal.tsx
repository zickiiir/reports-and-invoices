"use client";

import { useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  ScrollArea,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { Dropzone } from "@mantine/dropzone";
import { notifications } from "@mantine/notifications";
import { IconFileUpload, IconTrash } from "@tabler/icons-react";

import { parsePeriodFromFilename } from "~/server/timesheet/filename";
import { api } from "~/trpc/react";

interface FileRow {
  filename: string;
  period: string;
  content: string;
}

const PERIOD_RE = /^\d{6}$/;

export function TimesheetImportModal({
  opened,
  onClose,
  userId,
  existingPeriods,
  onImported,
}: {
  opened: boolean;
  onClose: () => void;
  userId: string;
  existingPeriods: string[];
  onImported: (periods: string[]) => void;
}) {
  const [rows, setRows] = useState<FileRow[]>([]);

  const importMutation = api.timesheet.importBatch.useMutation({
    onSuccess: (results) => {
      notifications.show({
        color: "green",
        message: `Naimportováno ${results.length} ${results.length === 1 ? "soubor" : "souborů"}.`,
      });
      const conflicts = results.filter((r) => r.nextcloudSync === "conflict").length;
      const failed = results.filter((r) => r.nextcloudSync === "failed").length;
      if (conflicts > 0) {
        notifications.show({
          color: "orange",
          message: `${conflicts} ${conflicts === 1 ? "soubor koliduje" : "souborů koliduje"} s tím, co už je na Nextcloudu — nepřepsáno. Vyřeš to v Nastavení (Synchronizovat teď).`,
        });
      }
      if (failed > 0) {
        notifications.show({
          color: "red",
          message: `Synchronizace s Nextcloudem selhala u ${failed} ${failed === 1 ? "souboru" : "souborů"}.`,
        });
      }
      onImported(results.map((r) => r.period));
      setRows([]);
      onClose();
    },
    onError: (e) =>
      notifications.show({ color: "red", message: `Import selhal: ${e.message}` }),
  });

  const handleDrop = async (files: File[]) => {
    const newRows: FileRow[] = [];
    for (const file of files) {
      const content = await file.text();
      newRows.push({
        filename: file.name,
        period: parsePeriodFromFilename(file.name) ?? "",
        content,
      });
    }
    setRows((prev) => [...prev, ...newRows]);
  };

  const updatePeriod = (index: number, period: string) => {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, period } : row)));
  };

  const removeRow = (index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  const handleClose = () => {
    setRows([]);
    onClose();
  };

  const allRecognized = rows.length > 0 && rows.every((r) => PERIOD_RE.test(r.period));
  const unrecognizedCount = rows.filter((r) => !PERIOD_RE.test(r.period)).length;

  return (
    <Modal opened={opened} onClose={handleClose} title="Import výkazů" size="xl">
      <Text size="sm" c="dimmed" mb="sm">
        Přetáhni soubory ve starém formátu (<code>praceYYYYMM.txt</code>,{" "}
        <code>praceYYYYMMDB.txt</code>, přípona i &quot;DB&quot; jsou volitelné). Období se
        rozpozná automaticky z názvu — kde se to nepovede, over jej ručně.
      </Text>

      <Dropzone onDrop={handleDrop} multiple>
        <Group justify="center" gap="xs" mih={80} style={{ pointerEvents: "none" }}>
          <IconFileUpload size={28} color="var(--mantine-color-dimmed)" />
          <div>
            <Text size="sm">Přetáhni soubory výkazů sem</Text>
            <Text size="xs" c="dimmed">
              nebo klikni pro výběr, jde jich vybrat víc najednou
            </Text>
          </div>
        </Group>
      </Dropzone>

      {rows.length > 0 && (
        <>
          <ScrollArea.Autosize mah={360} mt="md">
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Soubor</Table.Th>
                  <Table.Th w={140}>Období (YYYYMM)</Table.Th>
                  <Table.Th />
                  <Table.Th w={40} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rows.map((row, i) => (
                  <Table.Tr key={i}>
                    <Table.Td>{row.filename}</Table.Td>
                    <Table.Td>
                      <TextInput
                        value={row.period}
                        placeholder="YYYYMM"
                        error={!PERIOD_RE.test(row.period)}
                        onChange={(e) => updatePeriod(i, e.currentTarget.value.trim())}
                      />
                    </Table.Td>
                    <Table.Td>
                      {!PERIOD_RE.test(row.period) ? (
                        <Badge color="red" variant="light">
                          nerozpoznáno
                        </Badge>
                      ) : existingPeriods.includes(row.period) ? (
                        <Badge color="orange" variant="light">
                          přepíše existující
                        </Badge>
                      ) : (
                        <Badge color="green" variant="light">
                          nový
                        </Badge>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Button
                        variant="subtle"
                        color="red"
                        size="xs"
                        px={4}
                        onClick={() => removeRow(i)}
                      >
                        <IconTrash size={16} />
                      </Button>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea.Autosize>

          {unrecognizedCount > 0 && (
            <Alert color="red" variant="light" mt="sm">
              {unrecognizedCount}{" "}
              {unrecognizedCount === 1 ? "soubor nemá" : "souborů nemá"} rozpoznané
              období — doplň ho ručně (YYYYMM) před importem.
            </Alert>
          )}
        </>
      )}

      <Group justify="flex-end" mt="md">
        <Button variant="default" onClick={handleClose}>
          Zrušit
        </Button>
        <Button
          disabled={!allRecognized}
          loading={importMutation.isPending}
          onClick={() =>
            importMutation.mutate({
              userId,
              files: rows.map((r) => ({ period: r.period, content: r.content })),
            })
          }
        >
          Importovat {rows.length > 0 ? `(${rows.length})` : ""}
        </Button>
      </Group>
    </Modal>
  );
}
