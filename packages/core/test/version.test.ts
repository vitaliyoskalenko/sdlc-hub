import { describe, expect, it } from "vitest";
import { compareVersions, HUB_VERSION, hubPackageJson, hubVersionOf } from "../src/index.ts";

describe("the hub's version", () => {
  it("compares major, minor and patch as numbers", () => {
    expect(compareVersions("0.10.0", "0.9.3")).toBe(1);
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
    expect(compareVersions("0.6.0", "0.6.1")).toBe(-1);
    expect(compareVersions("dev", "0.0.0")).toBe(0);
  });
  it("is written to hub/package.json and read back; an old file has none", () => {
    expect(hubVersionOf(hubPackageJson())).toBe(HUB_VERSION);
    expect(JSON.parse(hubPackageJson())).toMatchObject({ type: "module" });
    expect(hubVersionOf('{ "private": true, "type": "module" }\n')).toBeNull();
    expect(hubVersionOf(undefined)).toBeNull();
  });
});
