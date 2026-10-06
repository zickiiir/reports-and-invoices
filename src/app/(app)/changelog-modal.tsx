"use client";

import {
  Accordion,
  Badge,
  Group,
  Loader,
  Modal,
  Text,
  Title,
  Typography,
} from "@mantine/core";
import Markdown from "react-markdown";

import { api } from "~/trpc/react";

/** Changesets writes its section headings in English — shown in Czech like the rest of the UI. */
const SECTION_LABELS: Record<string, { label: string; color: string }> = {
  "Major Changes": { label: "Zásadní změny", color: "red" },
  "Minor Changes": { label: "Novinky", color: "blue" },
  "Patch Changes": { label: "Opravy", color: "gray" },
};

function releaseKinds(body: string) {
  return [...body.matchAll(/^### +(.+)$/gm)]
    .map((m) => SECTION_LABELS[m[1]!.trim()])
    .filter((k) => k !== undefined);
}

/** Release notes from CHANGELOG.md (written by `pnpm changeset:version`) — opened by
 * clicking the app version in the header. */
export function ChangelogModal({
  opened,
  onClose,
  currentVersion,
}: {
  opened: boolean;
  onClose: () => void;
  currentVersion: string;
}) {
  // Only fetched once the modal is actually opened — no reason to load it on every page.
  const changelog = api.meta.changelog.useQuery(undefined, {
    enabled: opened,
    staleTime: Infinity,
  });

  return (
    <Modal opened={opened} onClose={onClose} title="Historie verzí" size="lg">
      {changelog.isLoading ? (
        <Loader size="sm" />
      ) : !changelog.data?.length ? (
        <Text c="dimmed" size="sm">
          Historie verzí není k dispozici.
        </Text>
      ) : (
        <Accordion variant="separated" defaultValue={currentVersion}>
          {changelog.data.map((release) => (
            <Accordion.Item key={release.version} value={release.version}>
              <Accordion.Control>
                <Group gap="xs">
                  <Text fw={500}>v{release.version}</Text>
                  {release.version === currentVersion && (
                    <Badge size="xs" variant="filled">
                      aktuální
                    </Badge>
                  )}
                  {releaseKinds(release.body).map((kind) => (
                    <Badge key={kind.label} size="xs" variant="light" color={kind.color}>
                      {kind.label}
                    </Badge>
                  ))}
                </Group>
              </Accordion.Control>
              <Accordion.Panel>
                <Typography fz="sm">
                  <Markdown
                    components={{
                      h3: ({ children }) => (
                        <Title order={6} mt="xs" mb={4}>
                          {typeof children === "string"
                            ? (SECTION_LABELS[children]?.label ?? children)
                            : children}
                        </Title>
                      ),
                    }}
                  >
                    {release.body}
                  </Markdown>
                </Typography>
              </Accordion.Panel>
            </Accordion.Item>
          ))}
        </Accordion>
      )}
    </Modal>
  );
}
