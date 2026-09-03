import { customerRouter } from "~/server/api/routers/customer";
import { invoiceRouter } from "~/server/api/routers/invoice";
import { nextcloudRouter } from "~/server/api/routers/nextcloud";
import { payerRouter } from "~/server/api/routers/payer";
import { timesheetRouter } from "~/server/api/routers/timesheet";
import { userRouter } from "~/server/api/routers/user";
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  user: userRouter,
  payer: payerRouter,
  customer: customerRouter,
  timesheet: timesheetRouter,
  invoice: invoiceRouter,
  nextcloud: nextcloudRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 * @example
 * const trpc = createCaller(createContext);
 * const res = await trpc.post.all();
 *       ^? Post[]
 */
export const createCaller = createCallerFactory(appRouter);
