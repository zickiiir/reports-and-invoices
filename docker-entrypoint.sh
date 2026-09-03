#!/bin/sh
set -e

# AUTH_SECRET and POSTGRES_PASSWORD must NOT exist at all as "${VAR}" substitutions in
# docker-compose.yml — after substitution, Compose re-scans the resulting value for
# "$word" patterns and silently strips them out, so a password containing "$" gets
# silently corrupted (verified). This script therefore receives both values raw via
# "env_file" and does its own required-check (shell ":?" here operates on an already-set
# variable, not on the Compose file's text — safe).
: "${AUTH_SECRET:?AUTH_SECRET není nastaven (.env.production)}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD není nastaven (.env.production)}"

# We build DATABASE_URL here, not in docker-compose.yml — besides the "$"-substitution
# trap above, unescaped URL-special characters in the password (?, #, {, }, [, ], &, ...)
# would turn the connection string into an invalid URL. Node's `encodeURIComponent`
# handles that correctly.
export DATABASE_URL="postgresql://postgres:$(node -e 'process.stdout.write(encodeURIComponent(process.env.POSTGRES_PASSWORD))')@db:5432/reports_and_invoices"

echo "Running database migrations..."
node_modules/.bin/drizzle-kit migrate

# Idempotent — for an existing root user it just warns and changes nothing, so it's
# safe to run on every container start (including restarts). No --env-file here: the
# variables (SEED_EMAIL/SEED_PASSWORD/...) arrive directly from the container's
# environment (docker-compose environment), not from the .env file, which isn't in the image.
echo "Seeding root user..."
node_modules/.bin/tsx scripts/seed/index.ts

echo "Starting application..."
exec "$@"
