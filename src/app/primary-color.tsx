"use client";

import { createContext, useContext } from "react";

import { type PrimaryColor } from "~/server/db/schema";

/** A curated selection from Mantine's default color scale — `satisfies` guards against
 * it drifting from `primaryColorEnum` in ~/server/db/schema.ts (a type-only import, not
 * a runtime one — that would needlessly pull the whole server/db/schema.ts into the
 * client bundle). */
export const PRIMARY_COLOR_OPTIONS = [
  "blue",
  "indigo",
  "violet",
  "grape",
  "pink",
  "red",
  "orange",
  "teal",
  "green",
] as const satisfies readonly PrimaryColor[];
export type PrimaryColorOption = (typeof PRIMARY_COLOR_OPTIONS)[number];

export const PrimaryColorContext = createContext<{
  primaryColor: PrimaryColorOption;
  setPrimaryColor: (color: PrimaryColorOption) => void;
} | null>(null);

export function usePrimaryColor() {
  const ctx = useContext(PrimaryColorContext);
  if (!ctx) {
    throw new Error("usePrimaryColor musí být použito uvnitř ThemeProvider");
  }
  return ctx;
}
