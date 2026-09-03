import { TRPCError } from "@trpc/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import { assertOwnerOrSuperUser } from "~/server/access/visibility";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { payers } from "~/server/db/schema";

const payerInput = z.object({
  companyName: z.string().min(1),
  street: z.string().optional(),
  city: z.string().optional(),
  zip: z.string().optional(),
  ico: z.string().optional(),
  dic: z.string().optional(),
});

export const payerRouter = createTRPCRouter({
  list: protectedProcedure
    .input(z.object({ userId: z.string().uuid().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const ownerId = input?.userId ?? ctx.session.user.id;
      assertOwnerOrSuperUser(ctx.session.user, ownerId);
      return ctx.db.query.payers.findMany({
        where: eq(payers.userId, ownerId),
        orderBy: [asc(payers.companyName)],
      });
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const payer = await ctx.db.query.payers.findFirst({
        where: eq(payers.id, input.id),
      });
      if (!payer) throw new TRPCError({ code: "NOT_FOUND" });
      assertOwnerOrSuperUser(ctx.session.user, payer.userId);
      return payer;
    }),

  create: protectedProcedure
    .input(payerInput)
    .mutation(async ({ ctx, input }) => {
      const [created] = await ctx.db
        .insert(payers)
        .values({ userId: ctx.session.user.id, ...input })
        .returning();
      return created;
    }),

  update: protectedProcedure
    .input(payerInput.partial().extend({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      const existing = await ctx.db.query.payers.findFirst({
        where: eq(payers.id, id),
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      assertOwnerOrSuperUser(ctx.session.user, existing.userId);

      await ctx.db.update(payers).set(rest).where(eq(payers.id, id));
      return { ok: true };
    }),

  setArchived: protectedProcedure
    .input(z.object({ id: z.string().uuid(), archived: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.payers.findFirst({
        where: eq(payers.id, input.id),
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      assertOwnerOrSuperUser(ctx.session.user, existing.userId);

      await ctx.db
        .update(payers)
        .set({ archived: input.archived })
        .where(eq(payers.id, input.id));
      return { ok: true };
    }),
});
