"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AppShell,
  Avatar,
  Burger,
  Button,
  Group,
  NavLink,
  Text,
  Title,
  Tooltip,
  UnstyledButton,
  useMantineColorScheme,
} from "@mantine/core";
import { useDisclosure, useLocalStorage } from "@mantine/hooks";
import {
  IconBuildingBank,
  IconFileInvoice,
  IconFiles,
  IconLogout,
  IconReceipt2,
  IconUser,
  IconUsers,
  IconUsersGroup,
} from "@tabler/icons-react";
import { signOut } from "next-auth/react";

import { usePrimaryColor, type PrimaryColorOption } from "~/app/primary-color";
import { type ColorSchemePreference, type UserRole } from "~/server/db/schema";

const ROLE_LABEL: Record<UserRole, string> = {
  super_user: "Super-user",
  senior_programmer: "Senior programátor",
  developer: "Vývojář",
};

export function NavShell({
  user,
  appVersion,
  children,
}: {
  user: {
    name: string;
    role: UserRole;
    colorScheme: ColorSchemePreference;
    primaryColor: PrimaryColorOption;
  };
  appVersion: string;
  children: React.ReactNode;
}) {
  const [mobileOpened, { toggle: toggleMobile }] = useDisclosure();
  // Leaving getInitialValueInEffect at its default `true` — otherwise a hydration
  // mismatch (the server doesn't know about localStorage), see the explanation next to
  // primaryColor in theme-provider.tsx.
  const [desktopOpened, setDesktopOpened] = useLocalStorage({
    key: "reports-and-invoices-sidebar-opened",
    defaultValue: true,
  });
  const pathname = usePathname();

  // The app itself keeps the color scheme and primary color in localStorage (so there's
  // no flash on load) — but after login/reload we reconcile it once against the DB, in
  // case localStorage doesn't match (different browser/device, cleared data).
  const { setColorScheme } = useMantineColorScheme();
  const { setPrimaryColor } = usePrimaryColor();
  useEffect(() => {
    setColorScheme(user.colorScheme);
    setPrimaryColor(user.primaryColor);
    // Genuinely only once on mount (not on every change) — Mantine's `setColorScheme`
    // isn't a stable reference (a new function on every render), so having it in the
    // deps array would re-run the effect on every rerender (e.g. one triggered by
    // clicking the app color elsewhere in the UI) and would overwrite the live-set
    // value back to whatever the page loaded with from the server.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const links = [
    { href: "/", label: "Přehled", icon: IconFiles },
    { href: "/timesheets", label: "Výkazy", icon: IconFiles },
    { href: "/customers", label: "Odběratelé", icon: IconUsersGroup },
    { href: "/payers", label: "Plátci", icon: IconBuildingBank },
    { href: "/invoices", label: "Faktury", icon: IconFileInvoice },
  ];
  if (user.role === "super_user") {
    links.push({ href: "/admin/users", label: "Uživatelé", icon: IconUsers });
  }

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{
        width: 240,
        breakpoint: "sm",
        collapsed: { mobile: !mobileOpened, desktop: !desktopOpened },
      }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group>
            <Burger
              opened={mobileOpened}
              onClick={toggleMobile}
              hiddenFrom="sm"
              size="sm"
            />
            <Burger
              opened={desktopOpened}
              onClick={() => setDesktopOpened((o) => !o)}
              visibleFrom="sm"
              size="sm"
            />
            <IconReceipt2 size={24} color="var(--mantine-primary-color-6)" />
            <Title order={4}>Výkazy a faktury</Title>
            <Tooltip label="Verze aplikace" position="bottom" withArrow>
              <Text size="xs" c="dimmed" visibleFrom="xs">
                v{appVersion}
              </Text>
            </Tooltip>
          </Group>
          <Group gap="sm">
            <Tooltip label="Nastavení" position="bottom" withArrow>
              <UnstyledButton
                component={Link}
                href="/settings"
                style={{ borderRadius: "var(--mantine-radius-sm)" }}
                p={4}
              >
                <Group gap="xs" wrap="nowrap">
                  <Avatar radius="xl" size={30} color="var(--mantine-primary-color-6)">
                    <IconUser size={18} />
                  </Avatar>
                  <Text size="sm" c="dimmed" visibleFrom="xs">
                    {user.name} · {ROLE_LABEL[user.role]}
                  </Text>
                </Group>
              </UnstyledButton>
            </Tooltip>
            <Button
              variant="subtle"
              color="gray"
              size="sm"
              leftSection={<IconLogout size={16} />}
              onClick={() => signOut({ callbackUrl: "/login" })}
            >
              Odhlásit
            </Button>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="xs">
        {links.map((link) => (
          <NavLink
            key={link.href}
            component={Link}
            href={link.href}
            label={link.label}
            leftSection={<link.icon size={18} />}
            active={pathname === link.href}
            mb={4}
            style={{ borderRadius: "var(--mantine-radius-md)" }}
          />
        ))}
      </AppShell.Navbar>

      <AppShell.Main>{children}</AppShell.Main>
    </AppShell>
  );
}
