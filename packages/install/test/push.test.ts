import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { pushFiles } from "../src/index.ts";

const temp: string[] = [];
afterAll(() => temp.forEach((d) => rmSync(d, { recursive: true, force: true })));
const git = (cwd: string, ...a: string[]) => execFileSync("git", a, { cwd, encoding: "utf8" }).trim();

function repo() {
  const dir = mkdtempSync(join(tmpdir(), "hub-pushfiles-"));
  temp.push(dir);
  const bare = join(dir, "r.git");
  git(dir, "init", "-q", "--bare", "-b", "main", bare);
  const seed = join(dir, "seed");
  git(dir, "init", "-q", "-b", "main", seed);
  git(seed, "-c", "user.name=t", "-c", "user.email=t@x", "commit", "-q", "--allow-empty", "-m", "start");
  git(seed, "push", "-q", bare, "main");
  return bare;
}
const author = { name: "Nazar T.", email: "nazar.t@example.com" };

describe("writing product-specs with git", () => {
  it("commits a file of the bundle's size to a branch, as the admin, and reports nothing to do the second time", () => {
    const bare = repo();
    const big = "x".repeat(3_000_000);
    const sha = pushFiles({ url: bare, from: "main", to: "sdlc-hub/install", files: { "hub/cli.js": big, ".hub/config.yaml": "a: 1\n" }, message: "Update SDLC Hub", author });
    expect(sha).toMatch(/^[0-9a-f]{40}$/);
    expect(git(bare, "log", "-1", "--format=%an %s", "sdlc-hub/install")).toBe("Nazar T. Update SDLC Hub");
    expect(git(bare, "cat-file", "-s", "sdlc-hub/install:hub/cli.js")).toBe("3000000");
    expect(pushFiles({ url: bare, from: "sdlc-hub/install", to: "sdlc-hub/install", files: { "hub/cli.js": big }, message: "again", author })).toBeNull();
  });
});
