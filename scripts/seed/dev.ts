/**
 * Development entry point: root user (+ their billing info pre-filled for local
 * testing) + demo senior/developer pair + demo payers/customers. Don't use in
 * production — there, each user creates their own payers and customers, see
 * `index.ts`. Run: `pnpm seed:dev`
 * (in a Docker container: `docker compose -f docker-compose.dev.yml exec app pnpm seed:dev`).
 *
 * Adding a new demo-data area = a new file next to `users.ts` with its own idempotent
 * `seedX()` function, called here in `main()`.
 */
import { seedDemoCustomers } from "./customers";
import { seedDemoPayers } from "./payers";
import {
  envOrFallback,
  seedDemoUsers,
  seedDevOwnerBillingDefaults,
  seedRootUser,
} from "./users";

async function main() {
  const owner = await seedRootUser();
  await seedDevOwnerBillingDefaults(owner);
  await seedDemoUsers();
  const demoPayers = await seedDemoPayers(owner.id);
  await seedDemoCustomers(owner.id, demoPayers);

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
