import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

import { type UserRole } from "~/server/auth/config";
import { db } from "~/server/db";
import { users } from "~/server/db/schema";

export interface CallerIdentity {
  id: string;
  role: UserRole;
}

/**
 * Roles and visibility:
 * - super_user: sees/manages absolutely everything
 * - senior_programmer: fully manages own data + READ-ONLY access to subordinates'
 *   timesheets (users.managerId → their id)
 * - developer: only their own data
 */

/** userIds whose timesheets the caller may read (read-only extension for senior_programmer). */
export async function getReadableTimesheetUserIds(
  caller: CallerIdentity,
): Promise<string[] | "all"> {
  if (caller.role === "super_user") return "all";
  if (caller.role === "developer") return [caller.id];

  const subordinates = await db.query.users.findMany({
    where: eq(users.managerId, caller.id),
    columns: { id: true },
  });
  return [caller.id, ...subordinates.map((s) => s.id)];
}

/** May caller READ user `targetUserId`'s timesheets? (super_user always, senior their subordinates, otherwise only themselves). */
export async function canReadTimesheet(
  caller: CallerIdentity,
  targetUserId: string,
): Promise<boolean> {
  if (caller.id === targetUserId || caller.role === "super_user") return true;
  if (caller.role !== "senior_programmer") return false;

  const target = await db.query.users.findFirst({
    where: eq(users.id, targetUserId),
    columns: { managerId: true },
  });
  return target?.managerId === caller.id;
}

/** Throws UNAUTHORIZED if the caller may not read `targetUserId`'s timesheets. */
export async function assertCanReadTimesheet(
  caller: CallerIdentity,
  targetUserId: string,
) {
  if (!(await canReadTimesheet(caller, targetUserId))) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Nemáte oprávnění zobrazit výkazy tohoto uživatele.",
    });
  }
}

/** Writing a timesheet and managing customers/invoices/settings: owner or super_user only. */
export function assertOwnerOrSuperUser(
  caller: CallerIdentity,
  ownerId: string,
) {
  if (caller.role === "super_user" || caller.id === ownerId) return;
  throw new TRPCError({
    code: "FORBIDDEN",
    message: "Nemáte oprávnění k této akci.",
  });
}

export function assertSuperUser(caller: CallerIdentity) {
  if (caller.role !== "super_user") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Tato akce vyžaduje roli super-user.",
    });
  }
}
