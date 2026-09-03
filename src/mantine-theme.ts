import { createTheme } from "@mantine/core";

export const theme = createTheme({
  primaryColor: "blue",
  defaultRadius: "md",
  fontFamily:
    "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif",
  components: {
    // The default "filled" variant is too loud for small buttons (column sorting
    // in mantine-react-table, edit icons in tables) — subtle fits the rest of the
    // app better. Written as a plain object (not `ActionIcon.extend(...)`) — that
    // call fails with "extend is not a function" in the RSC bundle of layout.tsx.
    ActionIcon: {
      defaultProps: { variant: "subtle" },
    },
  },
});
