import { TRPCError } from "@trpc/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import { hashPassword } from "~/server/auth/password";
import { assertSuperUser } from "~/server/access/visibility";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
  colorSchemeEnum,
  cursorStyleEnum,
  editorKeybindingEnum,
  invoiceNumberingScopeEnum,
  primaryColorEnum,
  userRoleEnum,
  users,
} from "~/server/db/schema";
import { defaultInvoiceDateRules } from "~/server/invoicing/dates";

// Same rules as the checklist in users-admin-table.tsx — but that's only a client-side
// hint, this must be enforced here too, otherwise an arbitrarily weak password can be
// sent via tRPC (verified).
const passwordPolicySchema = z
  .string()
  .min(8, "Heslo musí mít alespoň 8 znaků")
  .regex(/\d/, "Heslo musí obsahovat alespoň 1 číslici")
  .regex(/[A-Z]/, "Heslo musí obsahovat alespoň 1 velké písmeno")
  .regex(/[^A-Za-z0-9]/, "Heslo musí obsahovat alespoň 1 speciální znak");

const profileSchema = z.object({
  name: z.string().min(1),
  street: z.string().optional(),
  city: z.string().optional(),
  zip: z.string().optional(),
  ico: z.string().optional(),
  dic: z.string().optional(),
  phone: z.string().optional(),
  invoiceEmail: z.string().email().optional().or(z.literal("")),
  bankAccount: z.string().optional(),
  bankCode: z.string().optional(),
  // The client only sends a data: image URL here (see settings-form.tsx, FileReader).
  // Enforced here too — without this, arbitrary text could be sent here, which then
  // gets inserted into <img src="..."> on the invoice in invoice-template.ts, rendered
  // via Puppeteer (see escapeAttr there — this is a second layer, not the only protection).
  signatureImageUrl: z
    .string()
    .max(4_000_000)
    .regex(/^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/]+=*$/, {
      message: "Podpis musí být obrázek (PNG/JPEG/GIF/WEBP).",
    })
    .optional()
    .or(z.literal("")),
});

const dateRuleSchema = z.union([
  z.object({ type: z.literal("lastDayOfPeriodMonth") }),
  z.object({
    type: z.literal("dayOfNextMonth"),
    day: z.number().int().min(1).max(28),
  }),
]);

const dateRulesSchema = z.object({
  issue: dateRuleSchema,
  due: dateRuleSchema,
  performance: dateRuleSchema,
});

// For `.returning()` — a projection of column references.
const publicUserColumnRefs = {
  id: users.id,
  email: users.email,
  name: users.name,
  firstName: users.firstName,
  lastName: users.lastName,
  role: users.role,
  managerId: users.managerId,
} as const;

// For `db.query.users.findMany({ columns })` — boolean flags.
const publicUserColumnFlags = {
  id: true,
  email: true,
  name: true,
  firstName: true,
  lastName: true,
  role: true,
  managerId: true,
} as const;

export const userRouter = createTRPCRouter({
  me: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.query.users.findFirst({
      where: eq(users.id, ctx.session.user.id),
      columns: { passwordHash: false },
    });
    if (!user) throw new TRPCError({ code: "NOT_FOUND" });
    return user;
  }),

  updateProfile: protectedProcedure
    .input(profileSchema)
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(users)
        .set({
          ...input,
          invoiceEmail: input.invoiceEmail === "" ? undefined : input.invoiceEmail,
        })
        .where(eq(users.id, ctx.session.user.id));
      return { ok: true };
    }),

  updateDateRules: protectedProcedure
    .input(dateRulesSchema)
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(users)
        .set({ invoiceDateRules: input })
        .where(eq(users.id, ctx.session.user.id));
      return { ok: true };
    }),

  updateInvoiceNumberingScope: protectedProcedure
    .input(z.object({ invoiceNumberingScope: z.enum(invoiceNumberingScopeEnum.enumValues) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(users)
        .set({ invoiceNumberingScope: input.invoiceNumberingScope })
        .where(eq(users.id, ctx.session.user.id));
      return { ok: true };
    }),

  updateLineItemTemplate: protectedProcedure
    .input(z.object({ template: z.string().max(255) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(users)
        .set({ defaultLineItemTemplate: input.template || null })
        .where(eq(users.id, ctx.session.user.id));
      return { ok: true };
    }),

  updateDefaultHourlyRate: protectedProcedure
    .input(z.object({ rate: z.number().nonnegative().optional() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(users)
        .set({
          defaultHourlyRate: input.rate !== undefined ? String(input.rate) : null,
        })
        .where(eq(users.id, ctx.session.user.id));
      return { ok: true };
    }),

  // One mutation for the whole group of timesheet editor settings (shortcuts, cursor,
  // line numbers) — the UI hides them behind a single "Save" button (see
  // timesheet-editor.tsx), so they're saved together here too, not separately on each change.
  updateEditorPreferences: protectedProcedure
    .input(
      z.object({
        editorKeybinding: z.enum(editorKeybindingEnum.enumValues),
        cursorStyle: z.enum(cursorStyleEnum.enumValues),
        showLineNumbers: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db.update(users).set(input).where(eq(users.id, ctx.session.user.id));
      return { ok: true };
    }),

  updateColorScheme: protectedProcedure
    .input(z.object({ colorScheme: z.enum(colorSchemeEnum.enumValues) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(users)
        .set({ colorScheme: input.colorScheme })
        .where(eq(users.id, ctx.session.user.id));
      return { ok: true };
    }),

  updatePrimaryColor: protectedProcedure
    .input(z.object({ primaryColor: z.enum(primaryColorEnum.enumValues) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(users)
        .set({ primaryColor: input.primaryColor })
        .where(eq(users.id, ctx.session.user.id));
      return { ok: true };
    }),

  updateWorkloadSettings: protectedProcedure
    .input(
      z.object({
        workdays: z.array(z.number().int().min(1).max(7)).min(1).max(7),
        hoursPerWorkday: z.number().positive().max(24),
        // Null = no custom goal, computed from the "achievable maximum".
        monthlyHoursGoal: z.number().positive().max(999).nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(users)
        .set({
          workdays: [...new Set(input.workdays)].sort(),
          hoursPerWorkday: String(input.hoursPerWorkday),
          monthlyHoursGoal:
            input.monthlyHoursGoal === null ? null : String(input.monthlyHoursGoal),
        })
        .where(eq(users.id, ctx.session.user.id));
      return { ok: true };
    }),

  changePassword: protectedProcedure
    .input(z.object({ newPassword: passwordPolicySchema }))
    .mutation(async ({ ctx, input }) => {
      const passwordHash = await hashPassword(input.newPassword);
      await ctx.db
        .update(users)
        .set({ passwordHash })
        .where(eq(users.id, ctx.session.user.id));
      return { ok: true };
    }),

  // --- super_user administration ---

  list: protectedProcedure.query(async ({ ctx }) => {
    assertSuperUser(ctx.session.user);
    return ctx.db.query.users.findMany({
      columns: publicUserColumnFlags,
      orderBy: [asc(users.name)],
    });
  }),

  create: protectedProcedure
    .input(
      z.object({
        email: z.string().email(),
        password: passwordPolicySchema,
        firstName: z.string().min(1),
        lastName: z.string().min(1),
        role: z.enum(userRoleEnum.enumValues),
        managerId: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertSuperUser(ctx.session.user);
      const passwordHash = await hashPassword(input.password);
      // "name" (invoicing name/company, see profileSchema) is only pre-filled from
      // firstName+lastName on creation — the person can then overwrite it in Settings,
      // e.g. to a company name.
      const [created] = await ctx.db
        .insert(users)
        .values({
          email: input.email.toLowerCase().trim(),
          passwordHash,
          name: `${input.firstName} ${input.lastName}`,
          firstName: input.firstName,
          lastName: input.lastName,
          role: input.role,
          managerId: input.managerId ?? null,
          invoiceDateRules: defaultInvoiceDateRules,
        })
        .returning(publicUserColumnRefs);
      return created;
    }),

  updateRoleAndManager: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        role: z.enum(userRoleEnum.enumValues),
        managerId: z.string().uuid().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertSuperUser(ctx.session.user);
      if (input.id === input.managerId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Uživatel nemůže být sám sobě nadřízeným.",
        });
      }
      await ctx.db
        .update(users)
        .set({ role: input.role, managerId: input.managerId })
        .where(eq(users.id, input.id));
      return { ok: true };
    }),
});
