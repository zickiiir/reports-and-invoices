import { TRPCError } from "@trpc/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import { assertOwnerOrSuperUser } from "~/server/access/visibility";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { customers, payers, users } from "~/server/db/schema";
import { applyLineItemTemplate } from "~/server/invoicing/line-item";

const customerInput = z.object({
  payerId: z.string().uuid(),
  alias: z
    .string()
    .min(1)
    .max(64)
    .transform((s) => s.trim().toUpperCase()),
  defaultHourlyRate: z.number().nonnegative().optional(),
  defaultLineItemText: z.string().optional(),
});

export const customerRouter = createTRPCRouter({
  list: protectedProcedure
    .input(z.object({ userId: z.string().uuid().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const ownerId = input?.userId ?? ctx.session.user.id;
      assertOwnerOrSuperUser(ctx.session.user, ownerId);
      return ctx.db.query.customers.findMany({
        where: eq(customers.userId, ownerId),
        with: { payer: true },
        orderBy: [asc(customers.alias)],
      });
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const customer = await ctx.db.query.customers.findFirst({
        where: eq(customers.id, input.id),
        with: { payer: true },
      });
      if (!customer) throw new TRPCError({ code: "NOT_FOUND" });
      assertOwnerOrSuperUser(ctx.session.user, customer.userId);
      return customer;
    }),

  create: protectedProcedure
    .input(customerInput)
    .mutation(async ({ ctx, input }) => {
      const payer = await ctx.db.query.payers.findFirst({
        where: eq(payers.id, input.payerId),
      });
      if (!payer) throw new TRPCError({ code: "NOT_FOUND", message: "Plátce nenalezen." });
      assertOwnerOrSuperUser(ctx.session.user, payer.userId);

      let defaultLineItemText = input.defaultLineItemText;
      let defaultHourlyRate = input.defaultHourlyRate;
      if (!defaultLineItemText || defaultHourlyRate === undefined) {
        const owner = await ctx.db.query.users.findFirst({
          where: eq(users.id, ctx.session.user.id),
          columns: { defaultLineItemTemplate: true, defaultHourlyRate: true },
        });
        defaultLineItemText ??= applyLineItemTemplate(
          owner?.defaultLineItemTemplate,
          input.alias,
        );
        if (owner?.defaultHourlyRate) {
          defaultHourlyRate ??= Number(owner.defaultHourlyRate);
        }
      }

      const [created] = await ctx.db
        .insert(customers)
        .values({
          userId: ctx.session.user.id,
          payerId: input.payerId,
          alias: input.alias,
          defaultHourlyRate:
            defaultHourlyRate !== undefined ? String(defaultHourlyRate) : undefined,
          defaultLineItemText,
        })
        .returning();
      return created;
    }),

  update: protectedProcedure
    .input(customerInput.partial().extend({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { id, defaultHourlyRate, ...rest } = input;
      const existing = await ctx.db.query.customers.findFirst({
        where: eq(customers.id, id),
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      assertOwnerOrSuperUser(ctx.session.user, existing.userId);

      await ctx.db
        .update(customers)
        .set({
          ...rest,
          ...(defaultHourlyRate !== undefined
            ? { defaultHourlyRate: String(defaultHourlyRate) }
            : {}),
        })
        .where(eq(customers.id, id));
      return { ok: true };
    }),

  setArchived: protectedProcedure
    .input(z.object({ id: z.string().uuid(), archived: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.customers.findFirst({
        where: eq(customers.id, input.id),
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      assertOwnerOrSuperUser(ctx.session.user, existing.userId);

      await ctx.db
        .update(customers)
        .set({ archived: input.archived })
        .where(eq(customers.id, input.id));
      return { ok: true };
    }),
});
