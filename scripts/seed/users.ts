import { eq } from "drizzle-orm";

import { hashPassword } from "~/server/auth/password";
import { db } from "~/server/db";
import { users, type UserRole } from "~/server/db/schema";
import { defaultInvoiceDateRules } from "~/server/invoicing/dates";

/**
 * An empty string (e.g. an unset .env variable) is treated as not set — unlike
 * "??"/"||" (forbidden by lint rule), this also handles an empty value, not just a
 * missing one.
 */
export function envOrFallback(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  return value;
}

export interface SeedUserSpec {
  email: string;
  password: string;
  name: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  /** Manager's email (senior_programmer), for developers. */
  managerEmail?: string;
}

/**
 * Idempotently creates (or returns the existing) user by email. Skipped one at a
 * time, not globally — if one user in the seed already exists, the others are still
 * attempted.
 */
export async function seedUser(
  spec: SeedUserSpec,
): Promise<typeof users.$inferSelect> {
  const existing = await db.query.users.findFirst({
    where: eq(users.email, spec.email),
  });
  if (existing) {
    console.log(`[users] ${spec.email} už existuje, přeskočeno.`);
    return existing;
  }

  const managerId = spec.managerEmail
    ? (
        await db.query.users.findFirst({
          where: eq(users.email, spec.managerEmail),
        })
      )?.id
    : undefined;

  const passwordHash = await hashPassword(spec.password);
  const [created] = await db
    .insert(users)
    .values({
      email: spec.email,
      passwordHash,
      name: spec.name,
      firstName: spec.firstName,
      lastName: spec.lastName,
      role: spec.role,
      managerId,
      invoiceDateRules: defaultInvoiceDateRules,
    })
    .returning();
  if (!created) throw new Error(`Nepodařilo se založit uživatele ${spec.email}`);

  console.log(`[users] založen ${spec.email} (${spec.role}).`);
  return created;
}

/**
 * Production bootstrap: a single super_user (root), who then creates other users
 * themselves via `/admin/users`. No billing data is pre-filled — root fills it in
 * themselves in Settings (a server install isn't necessarily for the same company as
 * this repo). Email/password/name should be set via `SEED_EMAIL`/`SEED_PASSWORD`/
 * `SEED_FIRSTNAME`/`SEED_SURNAME` — the fallback is just a convenience for trying it
 * out locally, override it on a real server.
 */
export async function seedRootUser() {
  const firstName = envOrFallback(process.env.SEED_FIRSTNAME, "Admin");
  const lastName = envOrFallback(process.env.SEED_SURNAME, "Administrátor");
  return seedUser({
    email: envOrFallback(process.env.SEED_EMAIL, "admin@example.com"),
    password: envOrFallback(process.env.SEED_PASSWORD, "changeme123"),
    name: `${firstName} ${lastName}`,
    firstName,
    lastName,
    role: "super_user",
  });
}

/**
 * Root's billing details, local development only — so the app (invoice PDFs, QR
 * payment) works out-of-the-box without manually filling it in in Settings. Doesn't
 * belong in the production seed, see `seedRootUser`.
 */
export async function seedDevOwnerBillingDefaults(
  owner: Pick<typeof users.$inferSelect, "id" | "email">,
) {
  await db
    .update(users)
    .set({
      street: "Ukázková 1",
      city: "Praha",
      zip: "100 00",
      ico: "12345678",
      phone: "+420 123 456 789",
      invoiceEmail: owner.email,
      bankAccount: "123456789",
      bankCode: "0100",
    })
    .where(eq(users.id, owner.id));
}

/**
 * Demo senior/developer pair, local development only — demonstrates the role
 * hierarchy (senior sees the developer's timesheets, see `~/server/access/visibility`).
 * Customers and payers are private data per user, in production each user creates
 * their own.
 */
export async function seedDemoUsers() {
  const senior = await seedUser({
    email: "senior@example.com",
    password: "changeme123",
    name: "Senior Programátor (demo)",
    firstName: "Senior",
    lastName: "Programátor",
    role: "senior_programmer",
  });

  await seedUser({
    email: "developer@example.com",
    password: "changeme123",
    name: "Vývojář (demo)",
    firstName: "Vývojář",
    lastName: "Demo",
    role: "developer",
    managerEmail: senior.email,
  });

  return { senior };
}
