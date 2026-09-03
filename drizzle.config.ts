import { type Config } from "drizzle-kit";

// Deliberately not importing from "~/env" (and thus no zod validation of the whole env
// schema) — the drizzle-kit CLI runs outside the Next.js build, so the `~` alias isn't
// available (the runner Docker stage only copies this config + schema.ts).
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL musí být nastaveno pro drizzle-kit.");
}

export default {
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
  tablesFilter: ["reports_and_invoices_*"],
  // TS fields stay camelCase (idiomatic), DB columns are derived from them as
  // snake_case — without this Drizzle would use the TS name verbatim (camelCase
  // column, requiring quotes in raw SQL). Must match db/index.ts, otherwise
  // `drizzle-kit generate` and the running app disagree on what columns are named.
  casing: "snake_case",
} satisfies Config;
