import { asc, eq, or } from "drizzle-orm";
import { z } from "zod";

import {
  assertCanReadTimesheet,
  assertOwnerOrSuperUser,
  getReadableTimesheetUserIds,
} from "~/server/access/visibility";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { users } from "~/server/db/schema";
import { syncTimesheetToNextcloud } from "~/server/nextcloud/sync";
import { parseTimesheet } from "~/server/timesheet/parse";
import {
  listPeriods,
  readTimesheetRaw,
  saveTimesheet,
} from "~/server/timesheet/storage";

const periodSchema = z
  .string()
  .regex(/^\d{6}$/, "Období musí být ve tvaru YYYYMM");

export const timesheetRouter = createTRPCRouter({
  /** Users whose timesheets the caller may see — for the "on behalf of" switcher in the UI. */
  visibleUsers: protectedProcedure.query(async ({ ctx }) => {
    const visible = await getReadableTimesheetUserIds(ctx.session.user);
    if (visible === "all") {
      return ctx.db.query.users.findMany({
        columns: { id: true, name: true, role: true },
        orderBy: [asc(users.name)],
      });
    }
    return ctx.db.query.users.findMany({
      where: or(...visible.map((id) => eq(users.id, id))),
      columns: { id: true, name: true, role: true },
      orderBy: [asc(users.name)],
    });
  }),

  listPeriods: protectedProcedure
    .input(z.object({ userId: z.string().uuid().optional() }))
    .query(async ({ ctx, input }) => {
      const userId = input.userId ?? ctx.session.user.id;
      await assertCanReadTimesheet(ctx.session.user, userId);
      return listPeriods(userId);
    }),

  read: protectedProcedure
    .input(
      z.object({ userId: z.string().uuid().optional(), period: periodSchema }),
    )
    .query(async ({ ctx, input }) => {
      const userId = input.userId ?? ctx.session.user.id;
      await assertCanReadTimesheet(ctx.session.user, userId);
      const content = await readTimesheetRaw(userId, input.period);
      const parsed = parseTimesheet(content, input.period);
      return { content, parsed };
    }),

  /** Live recalculation of hours/overtime/errors over the currently-drafted content, without saving. */
  parseLive: protectedProcedure
    .input(z.object({ content: z.string(), period: periodSchema }))
    .query(({ input }) => parseTimesheet(input.content, input.period)),

  save: protectedProcedure
    .input(
      z.object({
        userId: z.string().uuid().optional(),
        period: periodSchema,
        content: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = input.userId ?? ctx.session.user.id;
      assertOwnerOrSuperUser(ctx.session.user, userId);
      const parsed = await saveTimesheet(userId, input.period, input.content);
      // Sync is best-effort (see syncTimesheetToNextcloud, never throws), but unlike
      // "fire-and-forget" we wait for the result so the frontend can inform the user
      // about it via a notification (mainly about a silent conflict).
      const nextcloudSync = await syncTimesheetToNextcloud(
        userId,
        input.period,
        input.content,
      );
      return { ...parsed, nextcloudSync };
    }),

  /** Bulk import (drag & drop of old `praceYYYYMM[DB].txt` files). */
  importBatch: protectedProcedure
    .input(
      z.object({
        userId: z.string().uuid().optional(),
        files: z
          .array(z.object({ period: periodSchema, content: z.string() }))
          .min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = input.userId ?? ctx.session.user.id;
      assertOwnerOrSuperUser(ctx.session.user, userId);

      const results = [];
      for (const file of input.files) {
        const parsed = await saveTimesheet(userId, file.period, file.content);
        const nextcloudSync = await syncTimesheetToNextcloud(
          userId,
          file.period,
          file.content,
        );
        results.push({
          period: file.period,
          totalHours: parsed.timesheets.reduce((sum, t) => sum + t.hours, 0),
          errors: parsed.errors.length,
          nextcloudSync,
        });
      }
      return results;
    }),
});
