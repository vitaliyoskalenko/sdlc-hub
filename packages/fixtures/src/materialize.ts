// Writes a fixture as real git repositories: product-specs with main and hub-state, and the team clones
// beside it, each commit authored by the person the fixture names. For tests and the demo only.

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { parseConfig } from "@sdlc-hub/core";
import type { Files, Fixture } from "./build.ts";

const DATE = "2026-10-01T09:00:00Z";

function git(cwd: string, args: string[], author = "nazar.t", date = DATE) {
  execFileSync("git", args, {
    cwd,
    stdio: "pipe",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: author,
      GIT_AUTHOR_EMAIL: `${author}@example.com`,
      GIT_COMMITTER_NAME: author,
      GIT_COMMITTER_EMAIL: `${author}@example.com`,
      GIT_AUTHOR_DATE: date,
      GIT_COMMITTER_DATE: date,
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_NOSYSTEM: "1",
    },
  });
}

function write(root: string, path: string, text: string) {
  const full = join(root, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, text);
}

/** Commit files grouped by author, in a stable order. */
function commitByAuthor(root: string, files: Files, authorOf: (path: string) => string, message: string) {
  const groups = new Map<string, string[]>();
  for (const path of Object.keys(files).sort()) {
    const a = authorOf(path);
    groups.set(a, [...(groups.get(a) ?? []), path]);
  }
  for (const [author, paths] of groups) {
    for (const p of paths) write(root, p, files[p]!);
    git(root, ["add", "--", ...paths], author);
    git(root, ["commit", "-q", "-m", `${message} (${author})`], author);
  }
}

export interface OnDisk {
  /** The product-specs working tree. */
  root: string;
  /** The folder that holds product-specs and the team clones. */
  parent: string;
}

export function materialize(fixture: Fixture, parent: string): OnDisk {
  const root = join(parent, "product-specs");
  mkdirSync(root, { recursive: true });
  git(root, ["init", "-q", "-b", "main"]);
  const authors = fixture.authors ?? {};
  commitByAuthor(root, fixture.main, (p) => authors[`main/${p}`] ?? "nazar.t", "main");
  for (const c of fixture.later ?? []) {
    for (const [p, t] of Object.entries(c.files)) write(root, p, t);
    git(root, ["add", "--", ...Object.keys(c.files)], c.author, c.at);
    git(root, ["commit", "-q", "-m", c.message], c.author, c.at);
  }

  if (fixture.hubState) {
    git(root, ["checkout", "-q", "--orphan", "hub-state"]);
    git(root, ["rm", "-rfq", "."]);
    const lines: Files = {};
    const rest: Files = {};
    for (const [p, t] of Object.entries(fixture.hubState)) (p.endsWith(".jsonl") ? lines : rest)[p] = t;
    commitByAuthor(root, rest, (p) => authors[`hub-state/${p}`] ?? "hub-report", "hub-state");
    // Event logs grow one line per commit, so git can name the author of each line.
    for (const [p, text] of Object.entries(lines)) {
      const all = text.split("\n").filter((l) => l.trim());
      all.forEach((_, i) => {
        const author = authors[`hub-state/${p}#L${i + 1}`] ?? "hub-plugin";
        write(root, p, all.slice(0, i + 1).join("\n") + "\n");
        git(root, ["add", "--", p], author);
        git(root, ["commit", "-q", "-m", `event ${i + 1} (${author})`], author);
      });
    }
    git(root, ["checkout", "-q", "main"]);
  }

  const config = parseConfig(fixture.main[".hub/config.yaml"] ?? "", ".hub/config.yaml").value;
  for (const [team, files] of Object.entries(fixture.teams ?? {})) {
    const repo = config?.teams.find((t) => t.id === team)?.repo ?? team;
    const dir = join(parent, basename(repo));
    mkdirSync(dir, { recursive: true });
    git(dir, ["init", "-q", "-b", "main"]);
    if (Object.keys(files).length) commitByAuthor(dir, files, () => "dev", "team");
  }
  return { root, parent };
}
