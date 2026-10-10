import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { fixtures, materialize } from "@sdlc-hub/fixtures";
import { print } from "../src/person.ts";
import { uninstall } from "../src/uninstall.ts";

const temp: string[] = [];
afterAll(() => temp.forEach((d) => rmSync(d, { recursive: true, force: true })));
const git = (cwd: string, ...a: string[]) => execFileSync("git", a, { cwd, encoding: "utf8" }).trim();

function clone(user: string) {
  const dir = mkdtempSync(join(tmpdir(), "hub-uninstall-"));
  temp.push(dir);
  const { root } = materialize(fixtures["demo"]!, join(dir, "seed"));
  const remote = join(dir, "remote.git");
  git(dir, "clone", "-q", "--bare", root, remote);
  const c = join(dir, "clone");
  git(dir, "clone", "-q", remote, c);
  for (const [k, v] of [["hub.user", user], ["user.name", user], ["user.email", `${user}@example.com`]]) git(c, "config", k!, v!);
  return { remote, clone: c };
}

describe("hub uninstall", () => {
  it("proposes the removal of .hub/ as the admin's save, keeps the documents, and lists the host steps", async () => {
    const { remote, clone: c } = clone("nazar.t");
    const r = await uninstall({ root: c, saver: { pushOptions: () => [] } });
    expect(r.ok, print(r.lines)).toBe(true);
    expect(print(r.lines)).toContain("After the merge: Delete the project shop/hub-ci");
    const branch = git(remote, "branch", "--list", "hub/nazar.t/uninstall-*").replace("*", "").trim();
    expect(git(remote, "ls-tree", "-r", "--name-only", branch).split("\n").filter((p) => p.startsWith(".hub/"))).toEqual([]);
    expect(git(remote, "ls-tree", "-r", "--name-only", branch)).toContain("docs/features/tasks-issues/spec.md");
  });

  it("is the admin's only", async () => {
    const { clone: c } = clone("olena.k");
    expect(print((await uninstall({ root: c, saver: { pushOptions: () => [] } })).lines)).toContain("Only the admin removes the hub");
  });
});
