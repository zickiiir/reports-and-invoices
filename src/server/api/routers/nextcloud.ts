import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { users } from "~/server/db/schema";
import { encryptSecret } from "~/server/nextcloud/crypto";
import { testNextcloudConnection } from "~/server/nextcloud/client";
import { previewNextcloudSync, syncSelectedPeriodsToNextcloud } from "~/server/nextcloud/sync";

const periodSchema = z.string().regex(/^\d{6}$/, "Období musí být ve tvaru YYYYMM");

const connectSchema = z.object({
  url: z
    .string()
    .trim()
    .url("Zadej platnou adresu (např. https://cloud.example.com)"),
  username: z.string().trim().min(1, "Zadej uživatelské jméno"),
  appPassword: z.string().min(1, "Zadej aplikační heslo"),
  remotePath: z.string().trim().default("/Vykazy"),
});

export const nextcloudRouter = createTRPCRouter({
  status: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.query.users.findFirst({
      where: eq(users.id, ctx.session.user.id),
      columns: {
        nextcloudUrl: true,
        nextcloudUsername: true,
        nextcloudRemotePath: true,
      },
    });
    return {
      configured: !!user?.nextcloudUrl,
      url: user?.nextcloudUrl ?? null,
      username: user?.nextcloudUsername ?? null,
      remotePath: user?.nextcloudRemotePath ?? null,
    };
  }),

  connect: protectedProcedure
    .input(connectSchema)
    .mutation(async ({ ctx, input }) => {
      const test = await testNextcloudConnection({
        url: input.url,
        username: input.username,
        appPassword: input.appPassword,
      });
      if (!test.ok) {
        throw new TRPCError({ code: "BAD_REQUEST", message: test.error });
      }

      await ctx.db
        .update(users)
        .set({
          nextcloudUrl: input.url,
          nextcloudUsername: input.username,
          nextcloudAppPasswordEnc: encryptSecret(input.appPassword),
          nextcloudRemotePath: input.remotePath || "/Vykazy",
        })
        .where(eq(users.id, ctx.session.user.id));

      // Doesn't sync right away — after a successful connection, the frontend opens
      // NextcloudSyncModal (previewSync + syncSelected), so the user sees what will be
      // written/conflicts and picks themselves before anything is actually sent.
      return { ok: true };
    }),

  disconnect: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.db
      .update(users)
      .set({
        nextcloudUrl: null,
        nextcloudUsername: null,
        nextcloudAppPasswordEnc: null,
        nextcloudRemotePath: null,
        // Otherwise, after a potential reconnection (say to a different account/
        // folder), the app would mistakenly treat old periods as "its own" and skip
        // the existence check.
        nextcloudSyncedPeriods: null,
      })
      .where(eq(users.id, ctx.session.user.id));
    return { ok: true };
  }),

  previewSync: protectedProcedure.query(async ({ ctx }) => {
    const rows = await previewNextcloudSync(ctx.session.user.id);
    if (!rows) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Nextcloud není nastavený." });
    }
    return rows;
  }),

  syncSelected: protectedProcedure
    .input(z.object({ periods: z.array(periodSchema).min(1) }))
    .mutation(async ({ ctx, input }) => {
      return syncSelectedPeriodsToNextcloud(ctx.session.user.id, input.periods);
    }),
});
