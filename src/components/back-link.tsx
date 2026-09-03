"use client";

import Link from "next/link";
import { Anchor, Group, Text } from "@mantine/core";
import { IconArrowLeft } from "@tabler/icons-react";

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Anchor component={Link} href={href} underline="never" c="dimmed">
      <Group gap={4} wrap="nowrap">
        <IconArrowLeft size={16} />
        <Text size="sm">{label}</Text>
      </Group>
    </Anchor>
  );
}
