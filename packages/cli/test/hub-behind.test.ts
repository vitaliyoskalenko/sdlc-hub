import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { hubPackageJson } from "@sdlc-hub/core";
import { hubBehind } from "../src/hub-behind.ts";

const temp: string[] = [];
afterAll(() => temp.forEach((d) => rmSync(d, { recursive: true, force: true })));

describe("a site older than its hub", () => {
  it("is read only when the checkout has a newer hub, and says what to do", () => {
    const root = mkdtempSync(join(tmpdir(), "hub-behind-"));
    temp.push(root);
    execFileSync("git", ["init", "-q"], { cwd: root });
    expect(hubBehind(root, "0.6.0")).toBeUndefined(); // no hub/package.json: the demo, or before versions
    mkdirSync(join(root, "hub"));
    writeFileSync(join(root, "hub/package.json"), hubPackageJson("0.6.0"));
    expect(hubBehind(root, "0.6.0")).toBeUndefined();
    writeFileSync(join(root, "hub/package.json"), hubPackageJson("0.7.0"));
    expect(hubBehind(root, "0.6.0")).toMatch(/runs hub 0\.6\.0, and product-specs has hub 0\.7\.0.*sync/);
  });
});
