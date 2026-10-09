// Writing the hub-state branch of product-specs from CI: fetch it, change files, commit and push, and start again
// from a fresh copy when someone else pushed in between. Git takes its credentials from the environment.

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface HubStateWrite {
  /** product-specs, as git reaches it. */
  url: string;
  message: string;
  author?: { name: string; email: string };
  /** Changes the checkout in `dir`; returns false when there is nothing to change. */
  edit: (dir: string) => boolean;
  env?: NodeJS.ProcessEnv;
}

/** Returns true when it pushed a commit. */
export function writeHubState(o: HubStateWrite): boolean {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const dir = mkdtempSync(join(tmpdir(), "hub-state-"));
    const env = {
      ...(o.env ?? process.env),
      GIT_TERMINAL_PROMPT: "0",
      GIT_AUTHOR_NAME: o.author?.name ?? "SDLC Hub",
      GIT_AUTHOR_EMAIL: o.author?.email ?? "sdlc-hub@localhost",
      GIT_COMMITTER_NAME: "SDLC Hub",
      GIT_COMMITTER_EMAIL: "sdlc-hub@localhost",
    };
    const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, stdio: "pipe", env }).toString();
    try {
      git("init", "-q");
      git("fetch", "-q", "--depth", "1", o.url, "hub-state");
      git("checkout", "-q", "-B", "hub-state", "FETCH_HEAD");
      if (!o.edit(dir)) return false;
      git("add", "-A");
      git("commit", "-q", "-m", o.message);
      try {
        // ci.skip: machine data needs no pipeline. A remote that takes no push options gets the plain push.
        try {
          git("push", "-q", "-o", "ci.skip", o.url, "HEAD:refs/heads/hub-state");
        } catch (e) {
          if (!/push options/i.test(String((e as { stderr?: unknown }).stderr ?? ""))) throw e;
          git("push", "-q", o.url, "HEAD:refs/heads/hub-state");
        }
        return true;
      } catch (e) {
        if (attempt === 3) throw new Error(`Could not push to hub-state after 3 attempts: ${(e as Error).message}`);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  return false;
}

/** Git's environment for HTTPS with a token: the header goes through GIT_CONFIG_*, never the command line. */
export function tokenEnv(token: string, base: NodeJS.ProcessEnv = process.env, user = "oauth2"): NodeJS.ProcessEnv {
  // GitLab takes "oauth2" as the user for a token; GitHub "x-access-token".
  return { ...base, GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "http.extraHeader", GIT_CONFIG_VALUE_0: `Authorization: Basic ${Buffer.from(`${user}:${token}`).toString("base64")}` };
}
