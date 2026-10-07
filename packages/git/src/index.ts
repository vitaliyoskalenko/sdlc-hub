// Read-only access to product-specs and the team clones. Every git call is a fixed argument list, never a
// shell, and none of them changes a repository: ls-files, ls-tree, show, log, blame, rev-parse.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";
import { loadProject, type FileSource, type Issue, type Project, type ProjectView, type Roles } from "@sdlc-hub/core";

function git(cwd: string, args: string[]): string | undefined {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 });
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

function lastAuthor(cwd: string, args: string[], who: Resolve): string | undefined {
  const out = git(cwd, ["log", "-1", "--format=%an%x00%ae", ...args]);
  if (!out?.trim()) return undefined;
  const [name, email] = out.trim().split("\0");
  return who(name ?? "", email ?? "");
}

const listUnder = (paths: string[], prefix: string) => (prefix === "" ? paths : paths.filter((p) => p.startsWith(`${prefix}/`)));

/** The checked-out files of a repository, as git sees them (ignored files left out). */
export function workingTreeSource(root: string, who: Resolve = (n) => n): FileSource {
  const base = resolve(root);
  let paths: string[] | undefined;
  const all = () => (paths ??= (git(base, ["ls-files", "-co", "--exclude-standard", "-z"]) ?? "").split("\0").filter(Boolean).sort());
  const authors = new Map<string, string | undefined>();
  return {
    read(path) {
      const full = resolve(base, path);
      if (!full.startsWith(base + sep) || !all().includes(path)) return undefined;
      try {
        return readFileSync(full, "utf8");
      } catch {
        return undefined;
      }
    },
    list: (prefix) => listUnder(all(), prefix),
    author(path) {
      if (!authors.has(path)) authors.set(path, lastAuthor(base, ["--", path], who));
      return authors.get(path);
    },
  };
}

/** The files of a branch or other ref, without checking it out. `author("<path>#L<n>")` names one line. */
export function refSource(root: string, ref: string, who: Resolve = (n) => n): FileSource {
  let paths: string[] | undefined;
  const all = () => (paths ??= (git(root, ["ls-tree", "-r", "--name-only", "-z", ref]) ?? "").split("\0").filter(Boolean).sort());
  const texts = new Map<string, string | undefined>();
  const authors = new Map<string, string | undefined>();
  return {
    read(path) {
      if (!all().includes(path)) return undefined;
      if (!texts.has(path)) texts.set(path, git(root, ["show", `${ref}:${path}`]));
      return texts.get(path);
    },
    list: (prefix) => listUnder(all(), prefix),
    author(key) {
      if (authors.has(key)) return authors.get(key);
      const m = /^(.*)#L(\d+)$/.exec(key);
      let a: string | undefined;
      if (m) {
        const out = git(root, ["blame", "--porcelain", "-L", `${m[2]},${m[2]}`, ref, "--", m[1]!]);
        const name = /^author (.*)$/m.exec(out ?? "")?.[1];
        const email = /^author-mail (.*)$/m.exec(out ?? "")?.[1];
        a = name ? who(name, email ?? "") : undefined;
      } else a = lastAuthor(root, [ref, "--", key], who);
      authors.set(key, a);
      return a;
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
