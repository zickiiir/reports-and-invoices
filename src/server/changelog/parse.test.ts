import { describe, expect, it } from "vitest";

import { parseChangelog } from "./parse";

describe("parseChangelog", () => {
  it("splits releases by their version heading, newest first", () => {
    const releases = parseChangelog(`# reports-and-invoices

## 1.1.0

### Minor Changes

- Nová funkce

## 1.0.0

### Major Changes

- Základ appky
- Druhá položka
`);
    expect(releases).toEqual([
      { version: "1.1.0", body: "### Minor Changes\n\n- Nová funkce" },
      {
        version: "1.0.0",
        body: "### Major Changes\n\n- Základ appky\n- Druhá položka",
      },
    ]);
  });

  it("returns nothing for a changelog without releases", () => {
    expect(parseChangelog("# reports-and-invoices\n")).toEqual([]);
  });
});
