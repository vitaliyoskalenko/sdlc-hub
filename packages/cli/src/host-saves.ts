// How a save opens its request on the project's host. GitLab takes push options, so the saver's defaults do. GitHub
// has none: after the push the saver opens the pull request and sets it to merge itself through the API, with the
// person's own token from git's credential helper (the one their HTTPS clone uses, or `gh auth setup-git`).

import { execFileSync } from "node:child_process";
import type { Config } from "@sdlc-hub/core";
import { GitHub } from "@sdlc-hub/host";
import { githubApi, githubWeb } from "@sdlc-hub/install";
import { gitlabPushOptions, type SaverOptions } from "@sdlc-hub/save";

/** The token git would use for a host, or undefined; never prompts. */
export function credentialFill(web: string): string | undefined {
  try {
    const u = new URL(web);
    const out = execFileSync("git", ["credential", "fill"], {
      input: `protocol=${u.protocol.replace(":", "")}\nhost=${u.host}\n\n`,
      encoding: "utf8",
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" },
      stdio: ["pipe", "pipe", "ignore"],
    });
    return /^password=(.+)$/m.exec(out)?.[1];
  } catch {
    return undefined;
  }
}

export interface HostSaveOptions {
  fill?: (web: string) => string | undefined;
  fetcher?: typeof fetch;
}

export function hostSaves(config: Config, o: HostSaveOptions = {}): Pick<SaverOptions, "pushOptions" | "propose" | "close"> {
  // Without auto-merge (git.auto_merge: false) a request waits for someone to merge it.
  const autoMerge = config.git.auto_merge !== false;
  if (config.git.provider !== "github") return autoMerge ? {} : { pushOptions: (title, target) => gitlabPushOptions(title, target, false) };
  const web = githubWeb(config.git.host);
  const client = () => {
    const token = (o.fill ?? credentialFill)(web);
    if (!token) throw new Error(`git has no token for ${new URL(web).host}. Sign in with \`gh auth login\` and \`gh auth setup-git\`, or clone over HTTPS with a credential helper`);
    return new GitHub(token, githubApi(web), o.fetcher);
  };
  return {
    pushOptions: () => [],
    // GitHub leaves a pull request open when its branch is deleted.
    async close(save) {
      if (save.mr?.iid) await client().closePull(config.git.namespace, config.git.repo, save.mr.iid);
    },
    async propose({ branch, title, target }) {
      const gh = client();
      const pr = await gh.createPull(config.git.namespace, config.git.repo, branch, target, title, autoMerge ? "Saved from SDLC Hub. It merges itself when hub-guard passes." : "Saved from SDLC Hub. Merge it when hub-guard has run.");
      if (autoMerge) await gh.autoMerge(pr);
      return { iid: pr.number, url: pr.html_url };
    },
  };
}
