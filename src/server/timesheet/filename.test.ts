import { describe, expect, it } from "vitest";

import { parsePeriodFromFilename, suggestedFilename } from "./filename";

describe("parsePeriodFromFilename", () => {
  it("recognizes the full name with DB and extension", () => {
    expect(parsePeriodFromFilename("prace202607DB.txt")).toBe("202607");
  });

  it("DB is optional", () => {
    expect(parsePeriodFromFilename("prace202607.txt")).toBe("202607");
  });

  it("extension is optional", () => {
    expect(parsePeriodFromFilename("prace202607DB")).toBe("202607");
    expect(parsePeriodFromFilename("prace202607")).toBe("202607");
  });

  it("is case-insensitive", () => {
    expect(parsePeriodFromFilename("PRACE202607db.TXT")).toBe("202607");
  });

  it("rejects an invalid month", () => {
    expect(parsePeriodFromFilename("prace202613.txt")).toBeNull();
  });

  it("rejects a completely different name", () => {
    expect(parsePeriodFromFilename("vykaz-cervenec.txt")).toBeNull();
  });
});

describe("suggestedFilename", () => {
  it("returns the canonical filename for download", () => {
    expect(suggestedFilename("202607")).toBe("prace202607.txt");
  });
});
