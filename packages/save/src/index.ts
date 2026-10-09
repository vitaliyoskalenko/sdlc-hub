// Saves from the site. The server commits in its own git worktree, never in the checkout the assistant works in,
// and pushes a branch `hub/<user>/<label>-<time>`. On GitLab, push options open the merge request and set it to merge
// itself when hub-guard passes, so git alone is enough, over HTTPS or SSH. GitHub has no such options: there the
// saver opens the pull request and sets it to merge itself through the API, with the person's own token. A save stays pending until main has it;
// when hub-guard refuses it, the reason is in hub-state. Records live in the git directory, not in the repository.

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { parseSaveRefusal, refusalPath, saveBranch, type Change, type FileSource, type Finding } from "@sdlc-hub/core";
import { refSource } from "@sdlc-hub/git";

/** The change is already on main. */
export class Unchanged extends Error {}

/** The person's earlier change to the same file still waits to merge: a second one would conflict with it. */
export class Pending extends Error {}

export interface Save {
  branch: string;
  title: string;
  user: string;
  paths: string[];
  at: string;
  sha: string;
  /** The blob of each saved path (null for a deletion), to see a squashed merge on main. */
  blobs: Record<string, string | null>;
  /**
   * queued: made while the host could not be reached; sent at the next look at the saves or hub sync.
   * conflict: main changed the same lines after a rebase; the person keeps their version or the newer one.
   */
  state: "queued" | "pending" | "merged" | "refused" | "conflict";
  /** What the save was, for the site: for example kind, slug and step. */
  meta?: Record<string, string>;
  mr?: { iid: number; url: string };
  findings?: Finding[];
  /** Advisory mode: what breaks a rule; the save merges anyway. */
  warnings?: Finding[];
  /** The save was moved onto a newer main once, after a conflict. */
  rebased?: boolean;
  /** The paths that still conflict, in state conflict. */
  conflict?: string[];
}

export interface SaveRequest {
  user: string;
  /** A few words for the branch name. */
  label: string;
  /** The commit message and the merge request title. */
  title: string;
  meta?: Record<string, string>;
  /** The changes, built from main as it is on the remote right now. */
  build: (main: FileSource) => Change[];
  /** Read after build: what the guard warned about, in advisory mode. */
  warnings?: () => Finding[] | undefined;
}

export interface SaverOptions {
  /** The product-specs checkout. */
  root: string;
  identity: { name: string; email: string };
  remote?: string;
  target?: string;
  /** Push options that open the merge request; GitLab's by default. */
  pushOptions?: (title: string, target: string) => string[];
  /**
   * Opens the request after the push where push options cannot: on GitHub, a pull request set to merge itself. When
   * it fails, the pushed branch is deleted and the save fails.
   */
  propose?: (p: { branch: string; title: string; target: string }) => Promise<{ iid: number; url: string }>;
  /** Closes a request whose branch was deleted, where the host does not (GitHub). */
  close?: (save: Save) => Promise<void>;
  now?: () => Date;
  env?: NodeJS.ProcessEnv;
}

/** Opens the merge request; with autoMerge (the default) it merges itself when the pipeline succeeds. */
export function gitlabPushOptions(title: string, target: string, autoMerge = true): string[] {
  return ["merge_request.create", `merge_request.target=${target}`, ...(autoMerge ? ["merge_request.merge_when_pipeline_succeeds"] : []), "merge_request.remove_source_branch", `merge_request.title=${title}`].flatMap((o) => ["-o", o]);
}

export function createSaver(o: SaverOptions) {
  const remote = o.remote ?? "origin";
  const target = o.target ?? "main";
  const now = o.now ?? (() => new Date());
  const baseEnv = { ...(o.env ?? process.env), GIT_TERMINAL_PROMPT: "0" };
  const run = (cwd: string, args: string[], env: NodeJS.ProcessEnv = baseEnv) =>
    execFileSync("git", ["-c", "core.quotePath=false", ...args], { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 });
  const tryRun = (cwd: string, args: string[]) => {
    try {
      return run(cwd, args);
    } catch {
      return undefined;
    }
  };

  const common = (() => {
    const d = run(o.root, ["rev-parse", "--git-common-dir"]).trim();
    return isAbsolute(d) ? d : resolve(o.root, d);
  })();
  const home = join(common, "sdlc-hub");
  const recordsFile = join(home, "saves.json");
  const worktree = join(home, "worktree");
  const mainRef = `refs/remotes/${remote}/${target}`;
  const stateRef = `refs/remotes/${remote}/hub-state`;

  const read = (): Save[] => {
    try {
      return JSON.parse(readFileSync(recordsFile, "utf8")) as Save[];
    } catch {
      return [];
    }
  };
  const write = (list: Save[]) => {
    mkdirSync(home, { recursive: true });
    writeFileSync(`${recordsFile}.tmp`, JSON.stringify(list, null, 2) + "\n");
    renameSync(`${recordsFile}.tmp`, recordsFile);
  };

  const fetch = (...branches: string[]) => run(o.root, ["fetch", "-q", remote, ...branches.map((b) => `+refs/heads/${b}:refs/remotes/${remote}/${b}`)]);

  /** The hub's own worktree, detached at main of the remote and clean. */
  function checkout(): string {
    if (!existsSync(join(worktree, ".git"))) {
      tryRun(o.root, ["worktree", "prune"]);
      rmSync(worktree, { recursive: true, force: true });
      mkdirSync(dirname(worktree), { recursive: true });
      run(o.root, ["worktree", "add", "-q", "--detach", "-f", worktree, mainRef]);
    }
    run(worktree, ["checkout", "-q", "-f", "--detach", mainRef]);
    run(worktree, ["clean", "-fdq"]);
    return worktree;
  }

  return {
    list: read,

    async save(req: SaveRequest): Promise<Save> {
      // Offline, the save is made on main as this machine last saw it, and queued.
      let online = true;
      try {
        fetch(target);
      } catch {
        if (tryRun(o.root, ["rev-parse", "--verify", "-q", mainRef]) === undefined) throw new Error("The git host cannot be reached, and this checkout has never fetched main");
        online = false;
      }
      const changes = req.build(refSource(o.root, mainRef));
      const touched = new Set(changes.flatMap((c) => (c.from ? [c.from, c.path] : [c.path])));
      const waiting = () => read().filter((s) => (s.state === "pending" || s.state === "queued") && s.user === req.user && s.paths.some((p) => touched.has(p)));
      if (waiting().length && (online && this.refresh(), waiting().length)) throw new Pending(`Your earlier change to ${[...touched].join(", ")} is still waiting to merge; wait for it, then try again`);
      const wt = checkout();
      for (const c of changes) {
        if (c.from && c.from !== c.path) rmSync(join(wt, c.from), { force: true });
        const file = join(wt, c.path);
        if (c.next === undefined) rmSync(file, { force: true });
        else {
          mkdirSync(dirname(file), { recursive: true });
          writeFileSync(file, c.next);
        }
      }
      run(wt, ["add", "-A"]);
      if (tryRun(wt, ["diff", "--cached", "--quiet"]) !== undefined) throw new Unchanged("Nothing to save: main already has this");
      const at = now();
      const id = { GIT_AUTHOR_NAME: o.identity.name, GIT_AUTHOR_EMAIL: o.identity.email, GIT_COMMITTER_NAME: o.identity.name, GIT_COMMITTER_EMAIL: o.identity.email, GIT_AUTHOR_DATE: at.toISOString(), GIT_COMMITTER_DATE: at.toISOString() };
      run(wt, ["commit", "-q", "-m", req.title], { ...baseEnv, ...id });
      const sha = run(wt, ["rev-parse", "HEAD"]).trim();
      const paths = [...new Set(changes.flatMap((c) => (c.from && c.from !== c.path ? [c.from, c.path] : [c.path])))].sort();
      const blobs = Object.fromEntries(paths.map((p) => [p, tryRun(wt, ["rev-parse", `HEAD:${p}`])?.trim() ?? null]));
      const branch = saveBranch(req.user, req.label, at);
      const warnings = req.warnings?.();
      const s: Save = { branch, title: req.title, user: req.user, paths, at: at.toISOString().replace(/\.\d+Z$/, "Z"), sha, blobs, state: "queued", ...(req.meta ? { meta: req.meta } : {}), ...(warnings?.length ? { warnings } : {}) };
      if (online && (await send(s)) === "offline") online = false;
      write([s, ...read()]);
      return s;
    },

    /** Sends the saves made offline, oldest first; those the host still cannot be reached for stay queued. */
    async sendQueued(): Promise<Save[]> {
      const list = read();
      const queued = list.filter((s) => s.state === "queued").reverse();
      if (!queued.length) return list;
      if (tryRun(o.root, ["ls-remote", "--heads", remote, target]) === undefined) return list;
      for (const s of queued) {
        try {
          if ((await send(s)) === "offline") break;
        } catch (e) {
          // The host refused it (not a lost connection): the save fails like any other.
          s.state = "refused";
          s.findings = [{ user: s.user, path: s.paths[0] ?? "", reason: (e as Error).message }];
        }
      }
      write(list);
      return list;
    },

    /** Looks at main and hub-state on the remote; offline it keeps what it knew. */
    refresh(): Save[] {
      const list = read();
      if (!list.some((s) => s.state === "pending" || s.state === "conflict")) return list;
      if (tryRun(o.root, ["fetch", "-q", remote, `+refs/heads/${target}:${mainRef}`, `+refs/heads/hub-state:${stateRef}`]) === undefined) return list;
      const state = refSource(o.root, stateRef);
      for (const s of list) {
        if (s.state !== "pending" && s.state !== "conflict") continue;
        const ancestor = tryRun(o.root, ["merge-base", "--is-ancestor", s.sha, mainRef]) !== undefined;
        const same = Object.entries(s.blobs).every(([p, b]) => (tryRun(o.root, ["rev-parse", `${mainRef}:${p}`])?.trim() ?? null) === b);
        const text = state.read(refusalPath(s.branch));
        const r = text ? parseSaveRefusal(text, refusalPath(s.branch)).value : undefined;
        if (r && r.sha === s.sha && r.advisory) s.warnings = r.findings;
        if (ancestor || same) {
          s.state = "merged";
          continue;
        }
        if (r && r.sha === s.sha && !r.advisory) {
          s.state = "refused";
          s.findings = r.findings;
          if (r.mr) s.mr ??= { iid: r.mr, url: "" };
          continue;
        }
        if (s.state !== "pending") continue;
        // main changed the same lines since the save: move it onto main once; after that the person decides.
        const clash = conflicts(s.sha);
        if (!clash?.length) continue;
        if (!s.rebased && moveOnto(s, "merge")) continue;
        s.state = "conflict";
        s.conflict = clash;
      }
      write(list);
      return list;
    },

    /**
     * A save in conflict: "mine" puts the person's version of each file on the newest main and sends it again;
     * "newer" drops the save, so main's version stays.
     */
    async resolve(branch: string, choice: "mine" | "newer"): Promise<Save | undefined> {
      const list = read();
      const s = list.find((x) => x.branch === branch && x.state === "conflict");
      if (!s) throw new Error("That save does not wait for a decision");
      fetch(target);
      if (choice === "mine") {
        if (!moveOnto(s, "mine")) throw new Error("Could not put your version on main");
        write(list);
        return s;
      }
      tryRun(o.root, ["push", "-q", remote, "--delete", s.branch]);
      await o.close?.(s).catch(() => undefined);
      write(list.filter((x) => x !== s));
      return undefined;
    },
  };

  /**
   * Pushes a save's branch and opens its request: pending after. "offline" when the host cannot be reached (the save
   * stays queued); throws when the host refuses it.
   */
  async function send(s: Save): Promise<"sent" | "offline"> {
    const options = (o.pushOptions ?? gitlabPushOptions)(s.title, target);
    // From the checkout, not the worktree: a remote may be a path relative to the checkout. They share objects.
    const push = spawnSync("git", ["push", ...options, remote, `${s.sha}:refs/heads/${s.branch}`], { cwd: o.root, env: baseEnv, encoding: "utf8" });
    if (push.status !== 0) {
      if (tryRun(o.root, ["ls-remote", "--heads", remote, target]) === undefined) return "offline";
      throw new Error(`The push failed: ${(push.stderr || push.error?.message || "").trim()}`);
    }
    // GitLab answers with the merge request's address.
    const link = /(https?:\/\/\S+\/-\/merge_requests\/(\d+))/.exec(push.stderr ?? "");
    let mr = link ? { iid: Number(link[2]), url: link[1]! } : undefined;
    if (o.propose)
      try {
        mr = await o.propose({ branch: s.branch, title: s.title, target });
      } catch (e) {
        spawnSync("git", ["push", "-q", remote, "--delete", s.branch], { cwd: o.root, env: baseEnv });
        throw new Error(`The change was pushed but no pull request opened, so it was taken back: ${(e as Error).message}`);
      }
    if (mr) s.mr = mr;
    s.state = "pending";
    return "sent";
  }

  /** The paths a save conflicts on with main now: empty when it merges cleanly, undefined when git cannot tell. */
  function conflicts(sha: string): string[] | undefined {
    const r = spawnSync("git", ["merge-tree", "--write-tree", "--name-only", "--no-messages", mainRef, sha], { cwd: o.root, env: baseEnv, encoding: "utf8" });
    if (r.status === 0) return [];
    if (r.status !== 1) return undefined; // git before 2.38, or another error
    return r.stdout.split("\n").slice(1).filter(Boolean);
  }

  /**
   * Makes the save's change again on the newest main and force-pushes its branch, which updates the open request.
   * merge: a three-way merge of each file (signoffs.yaml, which only grows, keeps both sides' entries); false when a
   * file still conflicts. mine: the person's version of each file wins.
   */
  function moveOnto(s: Save, how: "merge" | "mine"): boolean {
    const wt = checkout();
    const parent = run(o.root, ["rev-parse", `${s.sha}^`]).trim();
    for (const p of s.paths) {
      const ours = tryRun(o.root, ["show", `${s.sha}:${p}`]);
      const file = join(wt, p);
      if (ours === undefined) {
        rmSync(file, { force: true });
        continue;
      }
      let next = ours;
      if (how === "merge") {
        const theirs = tryRun(o.root, ["show", `${mainRef}:${p}`]);
        const base = tryRun(o.root, ["show", `${parent}:${p}`]);
        if (theirs !== undefined && theirs !== base) {
          const dir = join(home, "merge");
          mkdirSync(dir, { recursive: true });
          writeFileSync(join(dir, "ours"), ours);
          writeFileSync(join(dir, "base"), base ?? "");
          writeFileSync(join(dir, "theirs"), theirs);
          const union = /\/hub\/signoffs\.yaml$/.test(p) ? ["--union"] : [];
          const m = spawnSync("git", ["merge-file", "-p", ...union, join(dir, "ours"), join(dir, "base"), join(dir, "theirs")], { encoding: "utf8" });
          rmSync(dir, { recursive: true, force: true });
          if (m.status !== 0) return false;
          next = m.stdout;
        }
      }
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, next);
    }
    run(wt, ["add", "-A"]);
    const at = now().toISOString();
    const id = { GIT_AUTHOR_NAME: o.identity.name, GIT_AUTHOR_EMAIL: o.identity.email, GIT_COMMITTER_NAME: o.identity.name, GIT_COMMITTER_EMAIL: o.identity.email, GIT_AUTHOR_DATE: at, GIT_COMMITTER_DATE: at };
    run(wt, ["commit", "-q", "--allow-empty", "-m", s.title], { ...baseEnv, ...id });
    const sha = run(wt, ["rev-parse", "HEAD"]).trim();
    // With the push options again: GitLab drops merge-when-pipeline-succeeds on a force push, and the options set it
    // on the same merge request (GitLab CE 19.4.1, 9 October 2026).
    const options = (o.pushOptions ?? gitlabPushOptions)(s.title, target);
    const push = spawnSync("git", ["push", "-q", "--force", ...options, remote, `${sha}:refs/heads/${s.branch}`], { cwd: o.root, env: baseEnv, encoding: "utf8" });
    if (push.status !== 0) return false;
    s.sha = sha;
    s.blobs = Object.fromEntries(s.paths.map((p) => [p, tryRun(wt, ["rev-parse", `HEAD:${p}`])?.trim() ?? null]));
    s.state = "pending";
    s.rebased = true;
    delete s.conflict;
    return true;
  }
}

export type Saver = ReturnType<typeof createSaver>;
export { saveBug, saveBugEdit, saveEstimate, savePeople, saveRelease, saveSettings, saveSignoff, saveValidation, saveVerdicts, type BugSaveInput, type FeatureSaveInput, type PeopleSaveInput, type SaveOutcome, type SignoffInput } from "./signoff.ts";
export { tokenEnv, writeHubState, type HubStateWrite } from "./hub-state.ts";
export { flushEvents, queueEvent, queuedEvents, type QueuedEvent } from "./events.ts";
export { localTests, type Line, type LocalTestOptions } from "./local-tests.ts";
