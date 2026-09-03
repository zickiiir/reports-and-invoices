"use client";

import { MantineProvider } from "@mantine/core";
import { useLocalStorage } from "@mantine/hooks";

import { theme as baseTheme } from "~/mantine-theme";

import { PrimaryColorContext, type PrimaryColorOption } from "./primary-color";

/**
 * The app's `primaryColor` is a user preference switchable at runtime (Settings), so
 * unlike the rest of the theme it can't be fixed in `createTheme()` — MantineProvider
 * receives the theme as a prop, which this wrapper reactively changes.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // `getInitialValueInEffect: false` (read localStorage right on the first render)
  // would cause a hydration mismatch here — the server doesn't know what's in
  // localStorage, renders the default, the client immediately gets a different value on
  // the very first pass. We leave the default at `true`: both sides agree on
  // `defaultValue` during hydration, and the real value is applied right after in an
  // effect (an imperceptible flash instead of a hydration error and a "regeneration" of
  // the whole tree).
  const [primaryColor, setPrimaryColor] = useLocalStorage<PrimaryColorOption>({
    key: "reports-and-invoices-primary-color",
    defaultValue: "blue",
  });

  return (
    <PrimaryColorContext.Provider value={{ primaryColor, setPrimaryColor }}>
      <MantineProvider theme={{ ...baseTheme, primaryColor }} defaultColorScheme="auto">
        {children}
      </MantineProvider>
    </PrimaryColorContext.Provider>
  );
}
