/**
 * Production entry point: creates (or returns the existing) root user only —
 * `super_user`, through whom others are then created via `/admin/users`. No demo data
 * (payers/customers, sample role hierarchy) — that's dev-seed only, see `dev.ts`. Run:
 * `pnpm seed`
 * (in a Docker container: `docker compose exec app node_modules/.bin/tsx scripts/seed/index.ts`).
 */
import { z } from "zod";

import { envOrFallback, seedRootUser } from "./users";

/**
 * Unlike `dev.ts`, here we don't want a silent fallback to demo values (see
 * `seedRootUser`) — that's convenient for trying it out locally, but in production it
 * would mean a root account with a widely-known password. `docker-compose.yml` guards
 * against this via `${VAR:?...}`, but the script can also run outside Compose (bare
 * server, manual run) — the validation belongs here too, not just in the compose file.
 */
const productionSeedEnvSchema = z.object({
  SEED_EMAIL: z
    .string({ required_error: "SEED_EMAIL není nastaven" })
    .email("SEED_EMAIL musí být platný email"),
  SEED_PASSWORD: z
    .string({ required_error: "SEED_PASSWORD není nastaven" })
    .min(8, "SEED_PASSWORD musí mít alespoň 8 znaků"),
});

function assertProductionSeedEnv() {
  const result = productionSeedEnvSchema.safeParse({
    SEED_EMAIL: process.env.SEED_EMAIL,
    SEED_PASSWORD: process.env.SEED_PASSWORD,
  });
  if (!result.success) {
    console.error("Produkční seed nejde spustit — chybí/neplatná konfigurace:");
    for (const issue of result.error.issues) console.error(`  - ${issue.message}`);
    process.exit(1);
  }
}

async function main() {
  assertProductionSeedEnv();
  const owner = await seedRootUser();

  console.log("\nSeed hotov.");
  console.log(
    `Přihlašovací údaje: ${owner.email} / ${envOrFallback(process.env.SEED_PASSWORD, "changeme123")}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
