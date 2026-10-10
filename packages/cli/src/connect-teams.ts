// hub connect-teams: after the admin adds a team on Settings and it merged, this runs install's team steps for every
// team in config.yaml, so a new one gets them: on GitLab its hub-report merge request and its fan-out token, on
// GitHub the deploy key's secret and the hub workflows. Teams already connected are skipped. It needs the admin's
// setup token (api on GitLab; the fine-grained token on GitHub), from HUB_SETUP_TOKEN or git's credential helper.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadProject } from "@sdlc-hub/core";
import { GitHub, GitLab } from "@sdlc-hub/host";
import { refSource } from "@sdlc-hub/git";
import { answersOf, githubApi, githubWeb, hostUrl, install, installGitHub, TEAM_STEPS, type StepEvent } from "@sdlc-hub/install";
import type { Line } from "@sdlc-hub/save";
import { credentialFill } from "./host-saves.ts";

export interface ConnectOptions {
  root: string;
  token?: string;
  fetcher?: typeof fetch;
  onStep?: (e: StepEvent) => void;
}

export async function connectTeams(o: ConnectOptions): Promise<{ ok: boolean; lines: Line[] }> {
  execFileSync("git", ["fetch", "-q", "origin", "+refs/heads/main:refs/remotes/origin/main"], { cwd: o.root, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" }, stdio: "ignore" });
  // The teams as main has them: the Settings change must have merged.
  const project = loadProject(refSource(o.root, "refs/remotes/origin/main")).value;
  if (!project) return { ok: false, lines: [{ ok: false, text: ".hub/ does not load on main" }] };
  const a = answersOf(project.config);
  const web = a.host === "github" ? githubWeb(a.address) : hostUrl(a.address);
  const token = o.token ?? process.env["HUB_SETUP_TOKEN"] ?? credentialFill(web);
  if (!token) return { ok: false, lines: [{ ok: false, text: `No token for ${web}: set HUB_SETUP_TOKEN to the token you used for setup (the api scope on GitLab; the organization's fine-grained token on GitHub)` }] };
  let bundle: string;
  try {
    bundle = readFileSync(join(o.root, "hub/cli.js"), "utf8");
  } catch {
    bundle = "";
  }
  const opts = { hubBundle: bundle, only: TEAM_STEPS, ...(o.onStep ? { onStep: o.onStep } : {}) };
  const r = a.host === "github" ? await installGitHub(a, new GitHub(token, githubApi(web), o.fetcher), opts) : await install(a, new GitLab(web, token, o.fetcher), opts);
  const lines: Line[] = r.steps.map((s) => ({ ok: s.state !== "fail", text: `${s.state === "skip" ? "already: " : ""}${s.text}` }));
  for (const l of r.left.filter((x) => /merges the|Allow GitHub Actions|Renew HUB_FANOUT/.test(x))) lines.push({ ok: true, text: l, blocking: false });
  return { ok: r.ok, lines };
}
