import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { writeHubState } from "../src/index.ts";

const temp: string[] = [];
afterAll(() => temp.forEach((d) => rmSync(d, { recursive: true, force: true })));
const git = (cwd: string, ...a: string[]) => execFileSync("git", a, { cwd, encoding: "utf8" }).trim();

function remote(pushOptions: boolean) {
  const dir = mkdtempSync(join(tmpdir(), "hub-state-w-"));
  temp.push(dir);
  const bare = join(dir, "r.git");
  git(dir, "init", "-q", "--bare", "-b", "hub-state", bare);
  if (pushOptions) {
    git(bare, "config", "receive.advertisePushOptions", "true");
    // What GitLab sees: the options the push carried.
    writeFileSync(join(bare, "hooks/pre-receive"), `#!/bin/sh\nenv | grep '^GIT_PUSH_OPTION_' > "${join(dir, "options.txt")}"\nexit 0\n`, { mode: 0o755 });
  }
  const seed = join(dir, "seed");
  git(dir, "init", "-q", "-b", "hub-state", seed);
  git(seed, "-c", "user.name=t", "-c", "user.email=t@x", "commit", "-q", "--allow-empty", "-m", "start");
  git(seed, "push", "-q", bare, "hub-state");
  return { dir, bare };
}
const edit = (dir: string) => (writeFileSync(join(dir, "x.json"), "{}\n"), true);

describe("writing hub-state", () => {
  it("asks the host to run no pipeline for the push", () => {
    const { dir, bare } = remote(true);
    expect(writeHubState({ url: bare, message: "m", edit })).toBe(true);
    expect(execFileSync("cat", [join(dir, "options.txt")], { encoding: "utf8" })).toContain("GIT_PUSH_OPTION_0=ci.skip");
  });
  it("still pushes to a remote that takes no push options", () => {
    const { bare } = remote(false);
    expect(writeHubState({ url: bare, message: "m", edit })).toBe(true);
    expect(git(bare, "show", "hub-state:x.json")).toBe("{}");
  });
});
