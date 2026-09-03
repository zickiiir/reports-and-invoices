import { redirect } from "next/navigation";

import { auth } from "~/server/auth";
import { api } from "~/trpc/server";

import packageJson from "../../../package.json";
import { NavShell } from "./nav-shell";

// Everything under this layout group is authenticated, DB-dependent content — never
// statically generate it (this also avoids calling the DB during `next build`, when
// the database might not yet be available, e.g. in a Docker builder).
export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  // The JWT session is valid, but the corresponding user might not exist in the DB
  // (deleted account, or a dev database reset) — without this, `api.user.me()` would
  // crash the whole layout with an unhandled error (TRPCError NOT_FOUND). Better to
  // just log out quietly.
  const me = await api.user.me().catch(() => null);
  if (!me) redirect("/api/auth/force-logout");

  return (
    <NavShell
      user={{
        name: me.name,
        role: me.role,
        colorScheme: me.colorScheme,
        primaryColor: me.primaryColor,
      }}
      appVersion={packageJson.version}
    >
      {children}
    </NavShell>
  );
}
