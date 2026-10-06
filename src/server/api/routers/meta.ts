import { readFile } from "node:fs/promises";
import path from "node:path";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { parseChangelog } from "~/server/changelog/parse";

export const metaRouter = createTRPCRouter({
  /** Release notes for the "what's new" modal behind the version in the header. Not
   * user data (the same for everyone), hence no ownership/role check — logged-in is
   * enough. Read on each call, so `pnpm changeset:version` shows up without a restart
   * in dev; the file is tiny. */
  changelog: protectedProcedure.query(async () => {
    // Relative to the app root, which is the working directory both in `pnpm dev` and
    // in the Docker image (see the CHANGELOG.md COPY in Dockerfile).
    const markdown = await readFile(path.join(process.cwd(), "CHANGELOG.md"), "utf8").catch(
      () => "",
    );
    return parseChangelog(markdown);
  }),
});
