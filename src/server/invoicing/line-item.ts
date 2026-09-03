export const DEFAULT_LINE_ITEM_TEMPLATE = "Dle výkazu {alias}";

/** Replaces "{alias}" in the template (from the user's settings) with the actual customer alias. */
export function applyLineItemTemplate(
  template: string | null | undefined,
  alias: string,
): string {
  return (template ?? DEFAULT_LINE_ITEM_TEMPLATE).replaceAll("{alias}", alias);
}
