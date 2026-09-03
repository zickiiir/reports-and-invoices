"use client";

import { useState } from "react";
import { Button, Group, Modal } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconDownload } from "@tabler/icons-react";

/**
 * Preview of the generated HTML/PDF report in a modal — both via `<iframe>` (the
 * browser's built-in PDF viewer handles PDF just as well as HTML, no extra library
 * needed). The actual download is handled manually (fetch + blob) so it still works
 * with `Content-Disposition: inline`, which we want for the iframe preview.
 */
export function ReportPreviewModal({
  opened,
  onClose,
  title,
  url,
  filename,
}: {
  opened: boolean;
  onClose: () => void;
  title: string;
  url: string | null;
  filename: string;
}) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    if (!url) return;
    setDownloading(true);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("Stažení selhalo");
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(objectUrl);
    } catch {
      notifications.show({ color: "red", message: "Stažení selhalo." });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title={title} size="xl">
      <Group justify="flex-end" mb="sm">
        <Button
          size="xs"
          leftSection={<IconDownload size={14} />}
          onClick={() => void handleDownload()}
          loading={downloading}
          disabled={!url}
        >
          Stáhnout
        </Button>
      </Group>
      {url && (
        <iframe
          src={url}
          title={title}
          style={{
            width: "100%",
            height: "70vh",
            border: "1px solid var(--mantine-color-gray-3)",
            borderRadius: 6,
          }}
        />
      )}
    </Modal>
  );
}
