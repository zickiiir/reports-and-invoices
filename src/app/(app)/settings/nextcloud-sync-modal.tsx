"use client";

import { useMemo, useState } from "react";
import { Alert, Badge, Button, Checkbox, Group, Loader, Modal, Table, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";

import { api, type RouterOutputs } from "~/trpc/react";

type PreviewRow = RouterOutputs["nextcloud"]["previewSync"][number];

const STATUS_BADGE: Record<PreviewRow["status"], { color: string; label: string }> = {
  new: { color: "green", label: "nový" },
  known: { color: "blue", label: "již synchronizováno" },
  conflict: { color: "red", label: "koliduje s existujícím souborem" },
  error: { color: "gray", label: "nepodařilo se ověřit" },
};

/** Preview before syncing (same pattern as import — see timesheet-import-modal.tsx):
 * first show what will be written/conflicts, then let the user choose, only then
 * actually write. "new"/"known" are checked by default, "conflict"/"error" aren't —
 * those require a conscious decision by the user to overwrite/skip. */
export function NextcloudSyncModal({
  opened,
  onClose,
}: {
  opened: boolean;
  onClose: () => void;
}) {
  const preview = api.nextcloud.previewSync.useQuery(undefined, { enabled: opened });

  // The default selection (new/known checked, conflict/error not) is recomputed from
  // the preview on every load — once the user manually checks/unchecks something for
  // the first time, `manualSelection` takes over and the default derivation is ignored
  // from then on.
  const defaultSelection = useMemo(
    () =>
      new Set(
        preview.data
          ?.filter((row) => row.status === "new" || row.status === "known")
          .map((row) => row.period) ?? [],
      ),
    [preview.data],
  );
  const [manualSelection, setManualSelection] = useState<Set<string> | null>(null);
  const selected = manualSelection ?? defaultSelection;

  // Closing only goes through this — otherwise the next time it opens it would bring
  // back the manual selection from the previous run instead of a fresh preview.
  const handleClose = () => {
    setManualSelection(null);
    onClose();
  };

  const syncSelected = api.nextcloud.syncSelected.useMutation({
    onSuccess: (result) => {
      notifications.show({
        color: "green",
        message: `Synchronizováno ${result.synced} ${result.synced === 1 ? "výkaz" : "výkazů"}${result.failed ? ` (${result.failed} se nepodařilo)` : ""}.`,
      });
      handleClose();
    },
    onError: (e) => notifications.show({ color: "red", message: e.message }),
  });

  const toggle = (period: string, checked: boolean) => {
    const next = new Set(selected);
    if (checked) next.add(period);
    else next.delete(period);
    setManualSelection(next);
  };

  const conflictCount = preview.data?.filter((r) => r.status === "conflict").length ?? 0;

  return (
    <Modal opened={opened} onClose={handleClose} title="Synchronizovat s Nextcloudem" size="lg">
      {preview.isLoading ? (
        <Group justify="center" py="lg">
          <Loader size="sm" />
        </Group>
      ) : preview.data && preview.data.length > 0 ? (
        <>
          <Text size="sm" c="dimmed" mb="sm">
            Vyber, která období se mají zapsat. Soubory označené jako kolize už v
            Nextcloudu existují a appka je sama nevytvořila — zaškrtni je jen pokud
            opravdu chceš ten soubor přepsat.
          </Text>

          {conflictCount > 0 && (
            <Alert color="red" variant="light" mb="sm">
              {conflictCount} {conflictCount === 1 ? "soubor koliduje" : "souborů koliduje"} s
              něčím, co už v Nextcloudu je.
            </Alert>
          )}

          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th w={40} />
                <Table.Th>Období</Table.Th>
                <Table.Th>Soubor</Table.Th>
                <Table.Th>Stav</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {preview.data.map((row) => {
                const badge = STATUS_BADGE[row.status];
                return (
                  <Table.Tr key={row.period}>
                    <Table.Td>
                      <Checkbox
                        checked={selected.has(row.period)}
                        disabled={row.status === "error"}
                        onChange={(e) => toggle(row.period, e.currentTarget.checked)}
                      />
                    </Table.Td>
                    <Table.Td>{row.period}</Table.Td>
                    <Table.Td>
                      <code>{row.filename}</code>
                    </Table.Td>
                    <Table.Td>
                      <Badge color={badge.color} variant="light">
                        {badge.label}
                      </Badge>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </>
      ) : (
        <Text size="sm" c="dimmed">
          Zatím nemáš žádné uložené výkazy k synchronizaci.
        </Text>
      )}

      <Group justify="flex-end" mt="md">
        <Button variant="default" onClick={handleClose}>
          Zrušit
        </Button>
        <Button
          disabled={selected.size === 0}
          loading={syncSelected.isPending}
          onClick={() => syncSelected.mutate({ periods: [...selected] })}
        >
          Synchronizovat {selected.size > 0 ? `(${selected.size})` : ""}
        </Button>
      </Group>
    </Modal>
  );
}
