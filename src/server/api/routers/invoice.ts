import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { assertOwnerOrSuperUser } from "~/server/access/visibility";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
  customers,
  invoiceItems,
  invoiceNumberCounters,
  invoiceStatusEnum,
  invoices,
  payers,
  users,
} from "~/server/db/schema";
import {
  computeInvoiceDates,
  defaultInvoiceDateRules,
} from "~/server/invoicing/dates";
import { applyLineItemTemplate } from "~/server/invoicing/line-item";
import {
  getNumberingState,
  numberingPeriodKey,
  releaseInvoiceNumber,
  reserveInvoiceNumber,
  setInvoiceNumberSequence,
} from "~/server/invoicing/numbering";
import { parseTimesheet } from "~/server/timesheet/parse";
import { readTimesheetRaw } from "~/server/timesheet/storage";

const itemInput = z.object({
  name: z.string().min(1),
  quantity: z.number(),
  unitPrice: z.number(),
  discount: z.number().default(0),
  vatRate: z.number().default(0),
});

/** `YYYY-MM-DD` — a malformed or empty string would otherwise reach Postgres and fail
 * the whole save with an "invalid input syntax for type date" error. */
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Postgres `unique_violation`, possibly wrapped by drizzle in `cause`. */
function isUniqueViolation(err: unknown): boolean {
  for (let e: unknown = err; e && typeof e === "object"; e = (e as { cause?: unknown }).cause) {
    if ((e as { code?: unknown }).code === "23505") return true;
  }
  return false;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const itemTotal = (i: z.infer<typeof itemInput>) =>
  round2(i.quantity * i.unitPrice - i.discount);

export const invoiceRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z
        .object({
          userId: z.string().uuid().optional(),
          status: z.enum(invoiceStatusEnum.enumValues).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const ownerId = input?.userId ?? ctx.session.user.id;
      assertOwnerOrSuperUser(ctx.session.user, ownerId);

      return ctx.db.query.invoices.findMany({
        where: and(
          eq(invoices.userId, ownerId),
          input?.status ? eq(invoices.status, input.status) : undefined,
        ),
        with: { payer: true },
        orderBy: [desc(invoices.createdAt)],
      });
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const invoice = await ctx.db.query.invoices.findFirst({
        where: eq(invoices.id, input.id),
        with: { payer: true, items: true },
      });
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND" });
      assertOwnerOrSuperUser(ctx.session.user, invoice.userId);
      return invoice;
    }),

  /**
   * The next invoice number for a payer/period plus the free numbers below it (gaps in
   * the series — e.g. an invoice for an older timesheet entered after later ones). Read
   * only, nothing is reserved.
   */
  previewNumber: protectedProcedure
    .input(
      z.object({
        payerId: z.string().uuid(),
        sourceYear: z.number().int(),
        sourceMonth: z.number().int().min(1).max(12),
      }),
    )
    .query(async ({ ctx, input }) => {
      const payer = await ctx.db.query.payers.findFirst({
        where: eq(payers.id, input.payerId),
      });
      if (!payer) throw new TRPCError({ code: "NOT_FOUND" });
      assertOwnerOrSuperUser(ctx.session.user, payer.userId);

      const owner = await ctx.db.query.users.findFirst({
        where: eq(users.id, payer.userId),
        columns: { invoiceNumberingScope: true },
      });
      const state = await getNumberingState(
        ctx.db,
        payer.userId,
        owner?.invoiceNumberingScope ?? "month",
        input.sourceYear,
        input.sourceMonth,
      );
      return { next: state.next, free: state.free, suggested: state.suggested };
    }),

  /** The logged-in user's numbering sequence state for a given period (settings). */
  numberSequence: protectedProcedure
    .input(
      z.object({
        sourceYear: z.number().int(),
        sourceMonth: z.number().int().min(1).max(12),
      }),
    )
    .query(async ({ ctx, input }) => {
      const me = await ctx.db.query.users.findFirst({
        where: eq(users.id, ctx.session.user.id),
        columns: { invoiceNumberingScope: true },
      });
      const scope = me?.invoiceNumberingScope ?? "month";
      const period = numberingPeriodKey(scope, input.sourceYear, input.sourceMonth);
      const counter = await ctx.db.query.invoiceNumberCounters.findFirst({
        where: and(
          eq(invoiceNumberCounters.userId, ctx.session.user.id),
          eq(invoiceNumberCounters.period, period),
        ),
      });
      const lastSequence = counter?.lastSequence ?? 0;
      return {
        scope,
        period,
        lastSequence,
        nextNumber: `${period}${String(lastSequence + 1).padStart(2, "0")}`,
      };
    }),

  /**
   * A manual intervention in the logged-in user's numbering sequence — overwrites the
   * "last used number" for a given period. A sensitive operation (see the warning in
   * the UI), so no other data changes and no derivation — just a direct write of what
   * the user entered.
   */
  setNumberSequence: protectedProcedure
    .input(
      z.object({
        sourceYear: z.number().int(),
        sourceMonth: z.number().int().min(1).max(12),
        lastSequence: z.number().int().min(0).max(99),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const me = await ctx.db.query.users.findFirst({
        where: eq(users.id, ctx.session.user.id),
        columns: { invoiceNumberingScope: true },
      });
      const scope = me?.invoiceNumberingScope ?? "month";
      await setInvoiceNumberSequence(
        ctx.db,
        ctx.session.user.id,
        scope,
        input.sourceYear,
        input.sourceMonth,
        input.lastSequence,
      );
      return { ok: true };
    }),

  /**
   * Creates an invoice draft for the given PAYER and reported period. One payer can
   * cover several timesheet aliases (e.g. Acme pays for both AC1 and AC2) — one
   * invoice line item gets created for each non-archived alias belonging to the payer
   * that has hours worked in the given period.
   */
  createDraft: protectedProcedure
    .input(
      z.object({
        payerId: z.string().uuid(),
        sourceYear: z.number().int(),
        sourceMonth: z.number().int().min(1).max(12),
        variableSymbol: z.string().optional(),
        constantSymbol: z.string().optional(),
        note: z.string().optional(),
        /** A free number from `previewNumber.free`; omitted = the next one in the series. */
        number: z.string().max(20).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const payer = await ctx.db.query.payers.findFirst({
        where: eq(payers.id, input.payerId),
      });
      if (!payer) throw new TRPCError({ code: "NOT_FOUND" });
      assertOwnerOrSuperUser(ctx.session.user, payer.userId);

      const owner = await ctx.db.query.users.findFirst({
        where: eq(users.id, payer.userId),
      });
      if (!owner) throw new TRPCError({ code: "NOT_FOUND" });

      const payerCustomers = await ctx.db.query.customers.findMany({
        where: and(eq(customers.payerId, payer.id), eq(customers.archived, false)),
      });

      const period = `${input.sourceYear}${String(input.sourceMonth).padStart(2, "0")}`;
      const dates = computeInvoiceDates(
        { year: input.sourceYear, month: input.sourceMonth },
        owner.invoiceDateRules ?? defaultInvoiceDateRules,
      );

      const rawTimesheet = await readTimesheetRaw(payer.userId, period);
      const parsed = parseTimesheet(rawTimesheet, period);
      const hoursByAlias = new Map(parsed.timesheets.map((t) => [t.name, t.hours]));

      const items = payerCustomers
        .map((c) => ({
          name: c.defaultLineItemText ?? applyLineItemTemplate(owner.defaultLineItemTemplate, c.alias),
          quantity: hoursByAlias.get(c.alias) ?? 0,
          unitPrice: c.defaultHourlyRate ? Number(c.defaultHourlyRate) : 0,
          discount: 0,
          vatRate: 0,
        }))
        .filter((item) => item.quantity > 0);

      if (items.length === 0) {
        // None of the payer's aliases had hours in the timesheet — leave one empty
        // line for manual entry, so the invoice can be edited right away.
        items.push({
          name: payerCustomers[0]?.defaultLineItemText ?? applyLineItemTemplate(owner.defaultLineItemTemplate, payerCustomers[0]?.alias ?? ""),
          quantity: 0,
          unitPrice: payerCustomers[0]?.defaultHourlyRate
            ? Number(payerCustomers[0].defaultHourlyRate)
            : 0,
          discount: 0,
          vatRate: 0,
        });
      }

      const total = round2(items.reduce((sum, i) => sum + itemTotal(i), 0));
      let number: string;
      if (input.number) {
        // Only a gap in the series, recomputed here — never an arbitrary number from the
        // client, and the counter stays untouched (the gap is below it).
        const state = await getNumberingState(
          ctx.db,
          payer.userId,
          owner.invoiceNumberingScope,
          input.sourceYear,
          input.sourceMonth,
        );
        if (!state.free.includes(input.number)) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `Číslo ${input.number} už v řadě není volné.`,
          });
        }
        number = input.number;
      } else {
        number = await reserveInvoiceNumber(
          ctx.db,
          payer.userId,
          owner.invoiceNumberingScope,
          input.sourceYear,
          input.sourceMonth,
        );
      }

      const [invoice] = await ctx.db
        .insert(invoices)
        .values({
          userId: payer.userId,
          payerId: payer.id,
          number,
          // Shows up as the variable symbol on the QR payment and in the PDF — if the
          // user didn't provide their own, the invoice number is used directly (can be
          // overwritten later in the draft's detail view).
          variableSymbol: input.variableSymbol ?? number,
          constantSymbol: input.constantSymbol,
          issueDate: dates.issueDate,
          dueDate: dates.dueDate,
          performanceDate: dates.performanceDate,
          periodLabel: dates.periodLabel,
          sourceYear: input.sourceYear,
          sourceMonth: input.sourceMonth,
          status: "draft",
          totalAmount: String(total),
          note: input.note,
        })
        .returning()
        .catch((err: unknown) => {
          // Two drafts racing for the same free number — the unique (userId, number)
          // constraint lets only one through.
          if (isUniqueViolation(err)) {
            throw new TRPCError({
              code: "CONFLICT",
              message: `Číslo ${number} mezitím obsadila jiná faktura.`,
            });
          }
          throw err;
        });
      if (!invoice) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await ctx.db.insert(invoiceItems).values(
        items.map((item, position) => ({
          invoiceId: invoice.id,
          position,
          name: item.name,
          quantity: String(item.quantity),
          unitPrice: String(item.unitPrice),
          discount: String(item.discount),
          vatRate: String(item.vatRate),
          total: String(itemTotal(item)),
        })),
      );

      return ctx.db.query.invoices.findFirst({
        where: eq(invoices.id, invoice.id),
        with: { payer: true, items: true },
      });
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        variableSymbol: z.string().optional(),
        constantSymbol: z.string().optional(),
        issueDate: isoDate.nullable().optional(),
        dueDate: isoDate.nullable().optional(),
        performanceDate: isoDate.nullable().optional(),
        periodLabel: z.string().optional(),
        status: z.enum(invoiceStatusEnum.enumValues).optional(),
        note: z.string().optional(),
        items: z.array(itemInput).min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.invoices.findFirst({
        where: eq(invoices.id, input.id),
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      assertOwnerOrSuperUser(ctx.session.user, existing.userId);

      const totalAmount = round2(
        input.items.reduce((sum, i) => sum + itemTotal(i), 0),
      );

      await ctx.db.transaction(async (tx) => {
        await tx
          .update(invoices)
          .set({
            variableSymbol: input.variableSymbol,
            constantSymbol: input.constantSymbol,
            issueDate: input.issueDate,
            dueDate: input.dueDate,
            performanceDate: input.performanceDate,
            periodLabel: input.periodLabel,
            status: input.status,
            note: input.note,
            totalAmount: String(totalAmount),
          })
          .where(eq(invoices.id, input.id));

        await tx.delete(invoiceItems).where(eq(invoiceItems.invoiceId, input.id));
        await tx.insert(invoiceItems).values(
          input.items.map((item, position) => ({
            invoiceId: input.id,
            position,
            name: item.name,
            quantity: String(item.quantity),
            unitPrice: String(item.unitPrice),
            discount: String(item.discount),
            vatRate: String(item.vatRate),
            total: String(itemTotal(item)),
          })),
        );
      });

      return ctx.db.query.invoices.findFirst({
        where: eq(invoices.id, input.id),
        with: { payer: true, items: true },
      });
    }),

  /** Status-only change from the invoice list — `update` needs the whole invoice
   * including items, which the list doesn't have. */
  setStatus: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        status: z.enum(invoiceStatusEnum.enumValues),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.invoices.findFirst({
        where: eq(invoices.id, input.id),
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      assertOwnerOrSuperUser(ctx.session.user, existing.userId);

      await ctx.db
        .update(invoices)
        .set({ status: input.status })
        .where(eq(invoices.id, input.id));
      return { ok: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.invoices.findFirst({
        where: eq(invoices.id, input.id),
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      assertOwnerOrSuperUser(ctx.session.user, existing.userId);
      if (existing.status !== "draft") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Smazat lze jen fakturu ve stavu koncept.",
        });
      }
      const owner = await ctx.db.query.users.findFirst({
        where: eq(users.id, existing.userId),
        columns: { invoiceNumberingScope: true },
      });

      await ctx.db.transaction(async (tx) => {
        await tx.delete(invoices).where(eq(invoices.id, input.id));
        // Deleting the newest draft gives its number back, so the next invoice doesn't
        // skip it. Drafts without a source period can't be mapped to a series.
        if (owner && existing.sourceYear !== null && existing.sourceMonth !== null) {
          await releaseInvoiceNumber(
            tx,
            existing.userId,
            owner.invoiceNumberingScope,
            existing.sourceYear,
            existing.sourceMonth,
            existing.number,
          );
        }
      });
      return { ok: true };
    }),
});
