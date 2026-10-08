// Read-only access to product-specs and the team clones. Every git call is a fixed argument list, never a
// shell, and none of them changes a repository: ls-files, ls-tree, show, log, blame, rev-parse.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";
import { loadProject, type FileSource, type Issue, type Project, type ProjectView, type Roles } from "@sdlc-hub/core";

const calls: Record<string, number> = {};
/** How many times each git subcommand ran since the last reset; for tests that keep the number of calls bounded. */
export const gitCalls = (): Record<string, number> => ({ ...calls });
export const resetGitCalls = (): void => {
  for (const k of Object.keys(calls)) delete calls[k];
};

function git(cwd: string, args: string[], input?: string): string | undefined {
  const sub = args.find((a) => !a.startsWith("-") && !a.includes("=")) ?? "";
  calls[sub] = (calls[sub] ?? 0) + 1;
  try {
    return execFileSync("git", ["-c", "core.quotePath=false", ...args], {
      cwd,
      encoding: "utf8",
      input,
      stdio: [input === undefined ? "ignore" : "pipe", "pipe", "ignore"],
      maxBuffer: 256 * 1024 * 1024,
    });
  } catch {
    return undefined;
  }
}

/** Turns a git author into a roles.yaml user: by e-mail local part, user name or display name. */
type Resolve = (name: string, email: string) => string;

function resolver(roles: Roles | undefined): Resolve {
  return (name, email) => {
    const local = email.replace(/[<>]/g, "").split("@")[0] ?? "";
    const p = roles?.people.find((x) => x.user === local || x.user === name || x.name === name);
    return p?.user ?? name;
  };
}

/**
 * The author of the last commit that touched each path, from one `git log --name-only` over the history of `ref`.
 * The log runs newest first, so the first time a path appears is its last change.
 */
function authorsOf(cwd: string, ref: string, who: Resolve): Map<string, string> {
  const out = git(cwd, ["log", "--name-only", "--no-renames", "--format=%x01%an%x00%ae", ref, "--"]) ?? "";
  const map = new Map<string, string>();
  let current = "";
  for (const line of out.split("\n")) {
    if (line.startsWith("\x01")) {
      const [name, email] = line.slice(1).split("\0");
      current = who(name ?? "", email ?? "");
    } else if (line && !map.has(line)) map.set(line, current);
  }
  return map;
}

/** The author of every line of one file at `ref`, from one `git blame --porcelain`. */
function lineAuthorsOf(cwd: string, ref: string, path: string, who: Resolve): string[] {
  const out = git(cwd, ["blame", "--porcelain", ref, "--", path]) ?? "";
  const byCommit = new Map<string, { name: string; email: string }>();
  const lines: string[] = [];
  let sha = "";
  let final = 0;
  for (const line of out.split("\n")) {
    const head = /^([0-9a-f]{40}) \d+ (\d+)/.exec(line);
    if (head) {
      sha = head[1]!;
      final = Number(head[2]);
      if (!byCommit.has(sha)) byCommit.set(sha, { name: "", email: "" });
    } else if (line.startsWith("author ")) byCommit.get(sha)!.name = line.slice(7);
    else if (line.startsWith("author-mail ")) byCommit.get(sha)!.email = line.slice(12);
    else if (line.startsWith("\t")) {
      const a = byCommit.get(sha)!;
      lines[final] = who(a.name, a.email);
    }
  }
  return lines;
}

const listUnder = (paths: string[], prefix: string) => (prefix === "" ? paths : paths.filter((p) => p.startsWith(`${prefix}/`)));

/** The checked-out files of a repository, as git sees them (ignored files left out). */
export function workingTreeSource(root: string, who: Resolve = (n) => n): FileSource {
  const base = resolve(root);
  let paths: string[] | undefined;
  let known: Set<string> | undefined;
  const all = () => (paths ??= (git(base, ["ls-files", "-co", "--exclude-standard", "-z"]) ?? "").split("\0").filter(Boolean).sort());
  let authors: Map<string, string> | undefined;
  return {
    read(path) {
      const full = resolve(base, path);
      known ??= new Set(all());
      if (!full.startsWith(base + sep) || !known.has(path)) return undefined;
      try {
        return readFileSync(full, "utf8");
      } catch {
        return undefined;
      }
    },
    list: (prefix) => listUnder(all(), prefix),
    author(path) {
      authors ??= authorsOf(base, "HEAD", who);
      return authors.get(path);
    },
  };
}

/** The files of a branch or other ref, without checking it out. `author("<path>#L<n>")` names one line. */
export function refSource(root: string, ref: string, who: Resolve = (n) => n): FileSource {
  let paths: string[] | undefined;
  const all = () => (paths ??= (git(root, ["ls-tree", "-r", "--name-only", "-z", ref]) ?? "").split("\0").filter(Boolean).sort());
  let texts: Map<string, string> | undefined;
  let authors: Map<string, string> | undefined;
  const lineAuthors = new Map<string, string[]>();
  /** Every file of the ref in one `git cat-file --batch`: hub-state holds small machine records. */
  const load = (): Map<string, string> => {
    if (texts) return texts;
    texts = new Map();
    const names = all();
    if (!names.length) return texts;
    const out = git(root, ["cat-file", "--batch"], names.map((p) => `${ref}:${p}`).join("\n") + "\n");
    if (out === undefined) return texts;
    const buf = Buffer.from(out, "utf8");
    let at = 0;
    for (const name of names) {
      const nl = buf.indexOf(10, at);
      if (nl < 0) break;
      const header = buf.subarray(at, nl).toString("utf8");
      at = nl + 1;
      const m = /^[0-9a-f]+ blob (\d+)$/.exec(header);
      if (!m) continue; // "missing"
      const size = Number(m[1]);
      texts.set(name, buf.subarray(at, at + size).toString("utf8"));
      at += size + 1;
    }
    return texts;
  };
  return {
    read: (path) => load().get(path),
    list: (prefix) => listUnder(all(), prefix),
    author(key) {
      const m = /^(.*)#L(\d+)$/.exec(key);
      if (m) {
        if (!lineAuthors.has(m[1]!)) lineAuthors.set(m[1]!, lineAuthorsOf(root, ref, m[1]!, who));
        return lineAuthors.get(m[1]!)![Number(m[2])];
      }
      authors ??= authorsOf(root, ref, who);
      return authors.get(key);
    },
  };
}

function hubStateRef(root: string): string | undefined {
  for (const ref of ["refs/remotes/origin/hub-state", "refs/heads/hub-state"])
    if (git(root, ["rev-parse", "--verify", "--quiet", ref]) !== undefined) return ref;
  return undefined;
}

/** The git identity configured for a repository, to find the person in roles.yaml. */
export function gitIdentity(root: string): { name: string; email: string } {
  return { name: (git(root, ["config", "user.name"]) ?? "").trim(), email: (git(root, ["config", "user.email"]) ?? "").trim() };
}

/** The person `hub setup` recorded for this checkout (git config hub.user), if any. */
export function hubUser(root: string): string | undefined {
  return git(root, ["config", "--get", "hub.user"])?.trim() || undefined;
}

/** Who this checkout belongs to: the person hub setup recorded, else the one whose git identity matches. */
export function personOf(root: string, roles: Roles | undefined): string | undefined {
  const recorded = hubUser(root);
  if (recorded && roles?.people.some((p) => p.user === recorded)) return recorded;
  return userFor(roles, gitIdentity(root));
}

/** The roles.yaml user for a git identity, or undefined. */
export function userFor(roles: Roles | undefined, id: { name: string; email: string }): string | undefined {
  const local = id.email.split("@")[0] ?? "";
  return roles?.people.find((p) => p.user === local || p.user === id.name || p.name === id.name)?.user;
}

/** The top of the git working tree that contains `dir`. */
export function topLevel(dir: string): string | undefined {
  return git(dir, ["rev-parse", "--show-toplevel"])?.trim() || undefined;
}

export interface OpenProject {
  root: string;
  view: ProjectView;
  /** Present when .hub/ loads without errors. */
  project?: Project;
  issues: Issue[];
}

export interface OpenOptions {
  /** The current time; the clock by default. */
  now?: string;
}

/**
 * Opens product-specs at `root`: main from the working tree, hub-state from origin/hub-state or the local branch,
 * and each team repository from a clone beside product-specs, named like the repository (shop/web-admin → ../web-admin).
 */
export function openProject(root: string, opts: OpenOptions = {}): OpenProject {
  const plain = workingTreeSource(root);
  const loaded = loadProject(plain);
  const who = resolver(loaded.value?.roles);
  const specs = workingTreeSource(root, who);
  const ref = hubStateRef(root);
  const clones = new Map<string, FileSource | null>();
  const view: ProjectView = {
    specs,
    hubState: ref ? refSource(root, ref, who) : null,
    teamClone(team) {
      if (!clones.has(team)) {
        const repo = loaded.value?.config.teams.find((t) => t.id === team)?.repo;
        const dir = repo ? join(dirname(resolve(root)), basename(repo)) : undefined;
        clones.set(team, dir && existsSync(join(dir, ".git")) ? workingTreeSource(dir, who) : null);
      }
      return clones.get(team) ?? null;
    },
    now: opts.now ?? new Date().toISOString(),
  };
  return { root, view, ...(loaded.value ? { project: loaded.value } : {}), issues: loaded.issues };
}
