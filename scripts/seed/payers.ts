import { and, eq } from "drizzle-orm";

import { db } from "~/server/db";
import { payers } from "~/server/db/schema";

export interface SeedPayerSpec {
  companyName: string;
  ico?: string;
}

/** Idempotently creates (or returns the existing) payer by (userId, companyName). */
export async function seedPayer(
  userId: string,
  spec: SeedPayerSpec,
): Promise<typeof payers.$inferSelect> {
  const existing = await db.query.payers.findFirst({
    where: and(eq(payers.userId, userId), eq(payers.companyName, spec.companyName)),
  });
  if (existing) {
    console.log(`[payers] ${spec.companyName} už existuje, přeskočeno.`);
    return existing;
  }

  const [created] = await db
    .insert(payers)
    .values({ userId, companyName: spec.companyName, ico: spec.ico })
    .returning();
  if (!created) throw new Error(`Nepodařilo se založit plátce ${spec.companyName}`);

  console.log(`[payers] založen ${spec.companyName}.`);
  return created;
}

/**
 * Fictional payers for trying out the app locally only — an example of the real case
 * where one payer covers several aliases from the timesheet (see seedDemoCustomers),
 * others invoice for themselves. No real company/IČO, just demo values.
 */
export async function seedDemoPayers(userId: string) {
  const acme = await seedPayer(userId, {
    companyName: "Acme Software s.r.o.",
    ico: "11111111",
  });
  const beta = await seedPayer(userId, {
    companyName: "Beta Trading s.r.o.",
    ico: "22222222",
  });
  const gamma = await seedPayer(userId, {
    companyName: "Gamma Studio s.r.o.",
    ico: "33333333",
  });
  const delta = await seedPayer(userId, {
    companyName: "Delta Services s.r.o.",
    ico: "44444444",
  });

  return { acme, beta, gamma, delta };
}
