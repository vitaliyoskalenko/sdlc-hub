import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { fixtures, materialize } from "@sdlc-hub/fixtures";

const bundle = new URL("../dist/cli.mjs", import.meta.url).pathname;
const temp: string[] = [];
afterAll(() => temp.forEach((d) => rmSync(d, { recursive: true, force: true })));

describe.skipIf(!existsSync(bundle))("hub script", () => {
  it("prints a person's setup script, with no secret in it", () => {
    const dir = mkdtempSync(join(tmpdir(), "hub-script-cmd-"));
    temp.push(dir);
    const { root } = materialize(fixtures["demo"]!, join(dir, "seed"));
    execFileSync("git", ["config", "hub.user", "nazar.t"], { cwd: root });
    const r = spawnSync("node", [bundle, "script", "--user", "iryna.s", "--shell", "powershell"], { cwd: root, encoding: "utf8" });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('$HubRoles     = "qa"');
    expect(spawnSync("node", [bundle, "script", "--user", "nobody"], { cwd: root, encoding: "utf8" }).stderr).toMatch(/nobody is not in roles\.yaml/);
  });
});
