import { useLocalStorage } from "@mantine/hooks";
import { type MRT_DensityState } from "mantine-react-table";

interface TableUiPrefs {
  density: MRT_DensityState;
  showColumnFilters: boolean;
  showGlobalFilter: boolean;
}

const defaultPrefs: TableUiPrefs = {
  density: "xs",
  showColumnFilters: true,
  showGlobalFilter: true,
};

type Updater<T> = T | ((prev: T) => T);

function resolve<T>(updater: Updater<T>, prev: T): T {
  return typeof updater === "function" ? (updater as (prev: T) => T)(prev) : updater;
}

/**
 * Per-table UI preferences (row density, search/filter visibility) stored in the
 * browser's localStorage — search and filters default to always-on (until the user
 * turns them off themselves), unlike mantine-react-table's default behavior.
 * `key` must be unique per page (e.g. "customers", "payers").
 */
export function useTableUiState(key: string) {
  const [prefs, setPrefs] = useLocalStorage<TableUiPrefs>({
    key: `table-ui:${key}`,
    defaultValue: defaultPrefs,
  });

  return {
    state: prefs,
    onDensityChange: (updater: Updater<MRT_DensityState>) =>
      setPrefs((p) => ({ ...p, density: resolve(updater, p.density) })),
    onShowColumnFiltersChange: (updater: Updater<boolean>) =>
      setPrefs((p) => ({ ...p, showColumnFilters: resolve(updater, p.showColumnFilters) })),
    onShowGlobalFilterChange: (updater: Updater<boolean>) =>
      setPrefs((p) => ({ ...p, showGlobalFilter: resolve(updater, p.showGlobalFilter) })),
  };
}
