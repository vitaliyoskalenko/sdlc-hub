import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { CONFIG, ROLES } from "@sdlc-hub/fixtures";
import { parseConfig, parseRoles, reposFor, scriptName, setupScript, type ScriptShell } from "../src/index.ts";

const config = parseConfig(CONFIG, "c").value!;
const people = parseRoles(ROLES, "r").value!.people;
const who = (u: string) => people.find((p) => p.user === u)!;
const script = (user: string, shell: ScriptShell = "bash") => setupScript({ config, person: who(user), shell, release: "a1b2c3d4e5f6", date: "2026-10-08", by: "nazar.t" });
const dir = mkdtempSync(join(tmpdir(), "hub-script-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("the setup script", () => {
  it("is valid bash", () => {
    for (const u of ["iryna.s", "petro.v", "olena.k"]) {
      const f = join(dir, scriptName(u, "bash"));
      writeFileSync(f, script(u));
      expect(() => execFileSync("bash", ["-n", f])).not.toThrow();
    }
  });
  it("carries who the person is and where the repositories live", () => {
    const s = script("iryna.s");
    expect(s).toContain('HUB_GIT_HOST="https://gitlab.example.com"');
    expect(s).toContain('HUB_REPO="shop/product-specs"');
    expect(s).toContain('HUB_USER="iryna.s"');
    expect(s).toContain('HUB_ROLES="qa"');
    expect(s).toContain('HUB_TEAM_REPOS="shop/backend shop/web-admin shop/android-app shop/ios-app"');
    expect(s).toContain('HUB_RELEASE="a1b2c3d4e5f6"');
    expect(s.split("\n")[1]).toBe("# SDLC Hub setup for iryna.s (qa). Generated 2026-10-08 by nazar.t. Contains no secrets. Safe to run again.");
  });
  it("clones only what the role needs", () => {
    expect(reposFor(config, who("petro.v"))).toEqual(["shop/web-admin"]);
    expect(reposFor(config, who("olena.k"))).toEqual([]);
    expect(reposFor(config, who("bohdan.r"))).toHaveLength(4);
  });
  it("never carries a secret", () => {
    for (const shell of ["bash", "powershell"] as const) expect(script("iryna.s", shell)).not.toMatch(/token|password|glpat-|PRIVATE-TOKEN|Authorization/i);
  });
  it("has the same steps in PowerShell", () => {
    const s = script("petro.v", "powershell");
    expect(s).toContain('$HubTeamRepos = @("shop/web-admin")');
    expect(s).toContain("Run node hub/cli.js setup --user $HubUser --roles $HubRoles --assistant $HubAssistant --release $HubRelease");
    expect([...s.matchAll(/Write-Host "(\d)\/6/g)].map((m) => m[1])).toEqual(["1", "2", "3", "4", "5", "6"]);
    expect(scriptName("petro.v", "powershell")).toBe("setup-petro.v.ps1");
  });
  it("refuses a value a script cannot carry safely", () => {
    const bad = { ...who("iryna.s"), user: 'x"; rm -rf ~; "' };
    expect(() => setupScript({ config, person: bad, shell: "bash", release: "a", date: "2026-10-08", by: "nazar.t" })).toThrow(/cannot carry/);
  });
});
