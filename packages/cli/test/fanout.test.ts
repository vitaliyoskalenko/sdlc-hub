import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { fixtures, materialize } from "@sdlc-hub/fixtures";
import { refSource } from "@sdlc-hub/git";
import { fanoutInto, fanoutPush, fanoutTokenVariable } from "../src/fanout.ts";
import { print } from "../src/person.ts";

const temp: string[] = [];
afterAll(() => temp.forEach((d) => rmSync(d, { recursive: true, force: true })));
const env = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@x", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@x", GIT_CONFIG_GLOBAL: "/dev/null" };
const git = (cwd: string, ...a: string[]) => execFileSync("git", a, { cwd, env, encoding: "utf8" }).trim();

/** The demo's product-specs, and a "server" folder with each team repository at shop/<repo>.git. */
function setup() {
  const dir = mkdtempSync(join(tmpdir(), "hub-fanout-t-"));
  temp.push(dir);
  const { root } = materialize(fixtures["demo"]!, join(dir, "specs"));
  const server = join(dir, "server");
  for (const repo of ["backend", "web-admin", "android-app", "ios-app"]) {
    const bare = join(server, "shop", `${repo}.git`);
    mkdirSync(bare, { recursive: true });
    git(bare, "init", "-q", "--bare", "-b", "main");
    git(bare, "config", "receive.advertisePushOptions", "true");
    const seed = join(dir, `seed-${repo}`);
    git(dir, "init", "-q", "-b", "main", seed);
    writeFileSync(join(seed, "README.md"), `# ${repo}\n`);
    git(seed, "add", ".");
    git(seed, "commit", "-q", "-m", "seed");
    git(seed, "push", "-q", bare, "main");
  }
  return { root, server, dir };
}

describe("hub fanout", () => {
  it("on GitLab, proposes each team's shared files on hub/fanout with that team's token, and nothing twice", () => {
    const { root, server } = setup();
    const tokens = Object.fromEntries(["backend", "web"].map((t) => [fanoutTokenVariable(t), "t"]));
    const r = fanoutPush({ specs: refSource(root, "HEAD"), sha: git(root, "rev-parse", "HEAD"), serverUrl: `file://${server}`, env: { ...env, ...tokens } });
    expect(print(r.lines)).toMatch(/backend: proposed the shared files to shop\/backend on hub\/fanout/);
    expect(print(r.lines)).toMatch(/android: HUB_FANOUT_TOKEN_ANDROID is not set/);
    const backend = join(server, "shop/backend.git");
    const files = git(backend, "ls-tree", "-r", "--name-only", "hub/fanout").split("\n");
    expect(files).toContain("README.md"); // from the team's main
    expect(files.some((f) => /^docs\/features\/[^/]+\/spec\.md$/.test(f))).toBe(true);
    expect(files.some((f) => f.endsWith("/_handoff.md"))).toBe(true);
    expect(files.some((f) => f.endsWith("/hub/feature.yaml"))).toBe(false); // the hub's own files stay in product-specs
    const again = fanoutPush({ specs: refSource(root, "HEAD"), sha: git(root, "rev-parse", "HEAD"), serverUrl: `file://${server}`, env: { ...env, ...tokens } });
    expect(print(again.lines)).toMatch(/backend: the merge request on hub\/fanout in shop\/backend has these files already/);
  });

  it("on GitHub, writes the team's files into its own checkout on hub/fanout, for the workflow's pull request", () => {
    const { root, server, dir } = setup();
    const web = join(dir, "web-clone");
    git(dir, "clone", "-q", join(server, "shop/web-admin.git"), web);
    const r = fanoutInto({ specs: refSource(root, "HEAD"), sha: git(root, "rev-parse", "HEAD"), team: "web", dir: web, env });
    expect(r.changed).toBe(true);
    expect(git(web, "rev-parse", "--abbrev-ref", "HEAD")).toBe("hub/fanout");
    expect(git(web, "log", "-1", "--format=%an %s")).toBe("hub-fanout Shared files from product-specs (hub-fanout)");
    expect(() => fanoutInto({ specs: refSource(root, "HEAD"), sha: "x", team: "nope", dir: web, env })).toThrow(/no team nope/);
  });
});
