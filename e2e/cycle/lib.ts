// Shared by the full-cycle scripts (e2e/cycle/README.md): who each person is, their own git credential as the
// environment of the commands run in their name, and their workspace. Nothing here writes the system keychain or the
// person's Claude Code plugin registry: keys go to the workspace, plugins are loaded with --plugin-dir.

import { execFileSync, spawnSync, type SpawnSyncReturns } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { GitLab, type MergeRequest } from "@sdlc-hub/host";

export const URL_ = "http://localhost:8929";
export const GROUP = "cycle";
export const REPO_ROOT = join(import.meta.dirname, "../..");
/** Where the workspaces live: CYCLE_WORK, or a folder under the system's temporary folder. */
export const WORK = process.env["CYCLE_WORK"] ?? join(process.env["TMPDIR"] ?? "/tmp", "sdlc-hub-cycle");

type Secrets = { rootToken: string; cycle: { people: Record<string, string>; projects: Record<string, number> } };
export const secrets = JSON.parse(readFileSync(join(homedir(), ".sdlc-hub-test/gitlab.json"), "utf8")) as Secrets;

export const NAMES: Record<string, string> = {
  "nazar.t": "Nazar T.",
  "olena.k": "Olena K.",
  "maksym.d": "Maksym D.",
  "daria.l": "Daria L.",
  "taras.m": "Taras M.",
  "petro.v": "Petro V.",
  "iryna.s": "Iryna S.",
  "bohdan.r": "Bohdan R.",
};

export const root = () => new GitLab(URL_, secrets.rootToken);
export const as = (user: string) => new GitLab(URL_, secrets.cycle.people[user]!);
export const projectId = (repo: string) => secrets.cycle.projects[repo]!;
export const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** A person's workspace: their clones, their usage key, the log of their assistant runs. */
export const home = (user: string) => join(WORK, user);

/** The environment of a command run as this person: their git identity and credential, their key folder. */
export function envOf(user: string): NodeJS.ProcessEnv {
  const token = secrets.cycle.people[user]!;
  mkdirSync(join(home(user), "keys"), { recursive: true });
  return {
    ...process.env,
    GIT_TERMINAL_PROMPT: "0",
    GIT_CONFIG_COUNT: "3",
    GIT_CONFIG_KEY_0: "http.extraHeader",
    GIT_CONFIG_VALUE_0: `Authorization: Basic ${Buffer.from(`oauth2:${token}`).toString("base64")}`,
    GIT_CONFIG_KEY_1: "user.name",
    GIT_CONFIG_VALUE_1: NAMES[user]!,
    GIT_CONFIG_KEY_2: "user.email",
    GIT_CONFIG_VALUE_2: `${user}@example.com`,
    HUB_KEYS_DIR: join(home(user), "keys"),
    HUB_WORK: join(home(user), "work"),
  };
}

/** Runs a command as this person; throws with its output when it fails. */
export function run(user: string, cwd: string, cmd: string, args: string[], extra: NodeJS.ProcessEnv = {}): string {
  const r: SpawnSyncReturns<string> = spawnSync(cmd, args, { cwd, encoding: "utf8", env: { ...envOf(user), ...extra }, maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`${user}: ${cmd} ${args.join(" ")} failed (${r.status})\n${r.stdout}\n${r.stderr}`);
  return r.stdout;
}

/** The person's clone of a repository of the group, fetched up to date. */
export function clone(user: string, repo: string): string {
  const dir = join(home(user), "work", repo);
  if (!existsSync(join(dir, ".git"))) {
    mkdirSync(join(home(user), "work"), { recursive: true });
    run(user, join(home(user), "work"), "git", ["clone", "-q", `${URL_}/${GROUP}/${repo}.git`, repo]);
  } else run(user, dir, "git", ["fetch", "-q", "origin"]);
  return dir;
}

/** Polls a merge request until it merged, closed, or its pipeline failed. */
export async function settle(gl: GitLab, project: number, iid: number, minutes = 6): Promise<MergeRequest> {
  let m = await gl.mergeRequest(project, iid);
  for (let i = 0; i < minutes * 12 && (m.state === "opened" || m.state === "locked") && m.head_pipeline?.status !== "failed"; i++) {
    await wait(5000);
    m = await gl.mergeRequest(project, iid);
  }
  return m;
}

/** The trace of a job of a pipeline, by name. */
export async function jobLog(project: number, pipeline: number, name: string): Promise<string> {
  const h = { "PRIVATE-TOKEN": secrets.rootToken };
  const jobs = (await fetch(`${URL_}/api/v4/projects/${project}/pipelines/${pipeline}/jobs`, { headers: h }).then((r) => r.json())) as { id: number; name: string }[];
  const job = jobs.find((j) => j.name === name);
  return job ? fetch(`${URL_}/api/v4/projects/${project}/jobs/${job.id}/trace`, { headers: h }).then((r) => r.text()) : "";
}

export const sh = (cmd: string, args: string[], cwd = REPO_ROOT) => execFileSync(cmd, args, { cwd, encoding: "utf8" });
