import { and, eq } from "drizzle-orm";

import { db } from "~/server/db";
import { customers } from "~/server/db/schema";

export interface SeedCustomerSpec {
  alias: string;
  payerId: string;
  defaultHourlyRate?: number;
}

/** Idempotently creates (or returns the existing) customer/alias by (userId, alias). */
export async function seedCustomer(
  userId: string,
  spec: SeedCustomerSpec,
): Promise<typeof customers.$inferSelect> {
  const existing = await db.query.customers.findFirst({
    where: and(eq(customers.userId, userId), eq(customers.alias, spec.alias)),
  });
  if (existing) {
    console.log(`[customers] ${spec.alias} už existuje, přeskočeno.`);
    return existing;
  }

  const [created] = await db
    .insert(customers)
    .values({
      userId,
      payerId: spec.payerId,
      alias: spec.alias,
      defaultHourlyRate: String(spec.defaultHourlyRate ?? 500),
      defaultLineItemText: `Dle výkazu ${spec.alias}`,
    })
    .returning();
  if (!created) throw new Error(`Nepodařilo se založit odběratele ${spec.alias}`);

  console.log(`[customers] založen alias ${spec.alias}.`);
  return created;
}

export async function seedDemoCustomers(
  userId: string,
  payersByKey: Record<"acme" | "beta" | "gamma" | "delta", { id: string }>,
) {
  for (const alias of ["AC1", "AC2", "AC3"]) {
    await seedCustomer(userId, { alias, payerId: payersByKey.acme.id });
  }
  await seedCustomer(userId, { alias: "BETA", payerId: payersByKey.beta.id });
  await seedCustomer(userId, { alias: "GAMMA", payerId: payersByKey.gamma.id });
  await seedCustomer(userId, { alias: "DELTA", payerId: payersByKey.delta.id });
}
