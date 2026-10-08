import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { parseTestRun } from "@sdlc-hub/core";
import { fixtures, materialize } from "@sdlc-hub/fixtures";
import { localTests } from "../src/local-tests.ts";

const temp: string[] = [];
afterAll(() => temp.forEach((d) => rmSync(d, { recursive: true, force: true })));
const git = (cwd: string, ...a: string[]) => execFileSync("git", a, { cwd, encoding: "utf8" }).trim();

/** The demo with a bare remote, Petro's clone of web-admin beside it, and test commands in config.yaml. */
function setup(webTest: string) {
  const dir = mkdtempSync(join(tmpdir(), "hub-localtests-"));
  temp.push(dir);
  const { root } = materialize(fixtures["demo"]!, dir);
  git(dir, "clone", "-q", "--bare", root, join(dir, "remote.git"));
  git(root, "remote", "add", "origin", "../remote.git");
  git(root, "config", "hub.user", "petro.v");
  if (!existsSync(join(dir, "web-admin/.git"))) {
    mkdirSync(join(dir, "web-admin"));
    git(join(dir, "web-admin"), "init", "-q", "-b", "main");
    git(join(dir, "web-admin"), "-c", "user.name=t", "-c", "user.email=t@x", "commit", "-q", "--allow-empty", "-m", "start");
  }
  const config = join(root, ".hub/config.yaml");
  writeFileSync(config, readFileSync(config, "utf8").replace("kind: web }", `kind: web, test: "${webTest}" }`));
  return { root, remote: join(dir, "remote.git") };
}

describe("hub test", () => {
  it("runs the team's test command in its clone and records the run as local, with who ran it", () => {
    const { root, remote } = setup("echo ok > ran.txt");
    const r = localTests({ root, slug: "bulk-order-export", now: () => new Date("2026-10-08T10:00:00Z"), quiet: true });
    expect(r.lines.map((l) => l.text), JSON.stringify(r.lines)).toContain("web: passed");
    expect(readFileSync(join(root, "../web-admin/ran.txt"), "utf8")).toBe("ok\n");
    const files = git(remote, "ls-tree", "-r", "--name-only", "hub-state", "features/bulk-order-export/tests").split("\n").filter((f) => f.includes("local-web"));
    expect(files).toHaveLength(1);
    expect(parseTestRun(git(remote, "show", `hub-state:${files[0]}`), "t").value).toMatchObject({ source: "local", team: "web", result: "passed", user: "petro.v", at: "2026-10-08T10:00:00Z" });
  });
  it("records a failure", () => {
    const { root } = setup("exit 3");
    expect(localTests({ root, slug: "bulk-order-export", quiet: true }).lines.map((l) => l.text)).toContain("web: failed (exit code 3)");
  });
  it("says what is missing: a team with no test command, a team with no clone here", () => {
    const { root } = setup("true");
    const r = localTests({ root, slug: "bulk-order-export", team: "backend", quiet: true });
    expect(r.lines[0]!.text).toMatch(/backend has no test command: the admin sets teams\[\]\.test in \.hub\/config\.yaml/);
    expect(localTests({ root, slug: "nope", quiet: true }).lines[0]!.text).toMatch(/There is no feature nope/);
  });
});
