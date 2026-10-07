import { describe, expect, it } from "vitest";
import { CORE_SCHEMA_VERSION } from "../src/index.ts";

describe("workspace", () => {
  it("loads the core package", () => {
    expect(CORE_SCHEMA_VERSION).toBe(1);
  });
});
