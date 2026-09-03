"use client";

/**
 * Mantine's polymorphic `component={Link}` prop can't be used directly in a server
 * component — RSC doesn't allow passing a function (next/link's `Link`) as a prop
 * value across the server/client boundary. These thin client wrappers work around
 * that: a server component uses them as a regular JSX element, not as a prop.
 */
import Link from "next/link";
import { Anchor, Button, type AnchorProps, type ButtonProps } from "@mantine/core";

export function LinkButton({
  href,
  ...props
}: ButtonProps & { href: string; children: React.ReactNode }) {
  return <Button component={Link} href={href} {...props} />;
}

export function LinkAnchor({
  href,
  ...props
}: AnchorProps & { href: string; children: React.ReactNode }) {
  return <Anchor component={Link} href={href} {...props} />;
}
