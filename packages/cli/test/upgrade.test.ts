import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { hubPackageJson } from "@sdlc-hub/core";
import { fixtures, materialize } from "@sdlc-hub/fixtures";
import { print } from "../src/person.ts";
import { upgrade } from "../src/upgrade.ts";

const temp: string[] = [];
afterAll(() => temp.forEach((d) => rmSync(d, { recursive: true, force: true })));
const git = (cwd: string, ...a: string[]) => execFileSync("git", a, { cwd, encoding: "utf8" }).trim();

/** The demo project on hub 0.5.0, with a bare remote, and a clone as the given person. */
function project(user: string) {
  const dir = mkdtempSync(join(tmpdir(), "hub-upgrade-"));
  temp.push(dir);
  const { root } = materialize(fixtures["demo"]!, join(dir, "seed"));
  execFileSync("mkdir", ["-p", join(root, "hub")]);
  writeFileSync(join(root, "hub/package.json"), hubPackageJson("0.5.0"));
  writeFileSync(join(root, "hub/cli.js"), "// hub 0.5.0\n");
  git(root, "add", "-A");
  git(root, "-c", "user.name=t", "-c", "user.email=t@x", "commit", "-q", "-m", "hub 0.5.0");
  const remote = join(dir, "remote.git");
  git(dir, "clone", "-q", "--bare", root, remote);
  const clone = join(dir, "clone");
  git(dir, "clone", "-q", remote, clone);
  for (const [k, v] of [["hub.user", user], ["user.name", user], ["user.email", `${user}@example.com`]]) git(clone, "config", k!, v!);
  return { remote, clone };
}

describe("hub upgrade", () => {
  it("proposes the newer hub's files as one save in the admin's name, and leaves .hub/ alone", async () => {
    const { remote, clone } = project("nazar.t");
    const r = await upgrade({ root: clone, bundle: "// hub 0.6.0\n", version: "0.6.0", saver: { pushOptions: () => [] } });
    expect(r.ok, print(r.lines)).toBe(true);
    expect(print(r.lines)).toContain("Proposed the upgrade from 0.5.0 to 0.6.0");
    const branch = git(remote, "branch", "--list", "hub/nazar.t/upgrade-*").replace("*", "").trim();
    expect(git(remote, "show", `${branch}:hub/cli.js`)).toBe("// hub 0.6.0");
    expect(git(remote, "show", `${branch}:hub/package.json`)).toContain('"version": "0.6.0"');
    expect(git(remote, "show", `${branch}:hub/plugin/.claude-plugin/plugin.json`)).toContain('"name": "hub"');
    expect(git(remote, "diff", "--name-only", "main", branch).split("\n").filter((p) => p.startsWith(".hub/"))).toEqual([]);
  });

  it("is the admin's only, and never goes back to an older hub", async () => {
    const po = project("olena.k");
    expect(print((await upgrade({ root: po.clone, bundle: "x", version: "0.6.0", saver: { pushOptions: () => [] } })).lines)).toContain("Only the admin upgrades the hub");
    const admin = project("nazar.t");
    const r = await upgrade({ root: admin.clone, bundle: "x", version: "0.4.0", saver: { pushOptions: () => [] } });
    expect(r.ok).toBe(false);
    expect(print(r.lines)).toContain("main has hub 0.5.0, newer than this one (0.4.0)");
  });
});
