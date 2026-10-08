// hub test: a local run of a team's autotests, in the person's clone of that team repository, recorded in hub-state
// with the label local. A local run never satisfies the autotests gate; the site shows it beside the CI runs.
// The command comes from .hub/config.yaml (teams[].test), which only the admin changes.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { detectFeature, listFeatures } from "@sdlc-hub/core";
import { gitIdentity, openProject, personOf } from "@sdlc-hub/git";
import { writeHubState } from "./hub-state.ts";
import type { Line } from "./person.ts";

export interface LocalTestOptions {
  root: string;
  slug: string;
  /** One team; by default the person's own team, or every team of the feature that has a clone here. */
  team?: string;
  now?: () => Date;
  /** Keep the command's output out of the terminal (tests, the MCP server). */
  quiet?: boolean;
}

const iso = (d: Date) => d.toISOString().replace(/\.\d+Z$/, "Z");

export function localTests(o: LocalTestOptions): { ok: boolean; lines: Line[] } {
  const lines: Line[] = [];
  const say = (ok: boolean, text: string, blocking = true) => lines.push({ ok, text, blocking });
  const opened = openProject(o.root);
  if (!opened.project) {
    say(false, ".hub/ does not load");
    return { ok: false, lines };
  }
  const { project } = opened;
  if (!listFeatures(opened.view.specs).includes(o.slug)) {
    say(false, `There is no feature ${o.slug}`);
    return { ok: false, lines };
  }
  const user = personOf(o.root, project.roles);
  const person = project.roles.people.find((p) => p.user === user);
  const featureTeams = detectFeature(project, opened.view, o.slug).teams.map((t) => t.id);
  const ids = o.team ? [o.team] : person?.team && featureTeams.includes(person.team) ? [person.team] : featureTeams;
  const runs: { team: string; result: "passed" | "failed"; ref?: string }[] = [];
  for (const id of ids) {
    const team = project.config.teams.find((t) => t.id === id);
    if (!team) {
      say(false, `There is no team ${id}`);
      continue;
    }
    if (!team.test) {
      say(false, `${id} has no test command: the admin sets teams[].test in .hub/config.yaml`, !!o.team);
      continue;
    }
    const clone = join(dirname(resolve(o.root)), basename(team.repo));
    if (!existsSync(join(clone, ".git"))) {
      say(false, `There is no clone of ${team.repo} beside product-specs (${clone}); run your setup script, or clone it there`, !!o.team);
      continue;
    }
    const shell = process.platform === "win32" ? ["cmd", ["/c", team.test]] : ["sh", ["-c", team.test]];
    const r = spawnSync(shell[0] as string, shell[1] as string[], { cwd: clone, stdio: o.quiet ? "pipe" : "inherit", encoding: "utf8" });
    const result = r.status === 0 ? "passed" : "failed";
    const branch = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: clone, encoding: "utf8" }).stdout.trim();
    const sha = spawnSync("git", ["rev-parse", "--short=7", "HEAD"], { cwd: clone, encoding: "utf8" }).stdout.trim();
    runs.push({ team: id, result, ...(branch && sha ? { ref: `${branch}@${sha}` } : {}) });
    say(result === "passed", result === "passed" ? `${id}: passed` : `${id}: failed (exit code ${r.status ?? "none"})`, false);
  }
  if (runs.length) {
    const at = iso((o.now ?? (() => new Date()))());
    const stamp = at.replace(/\D/g, "");
    try {
      const url = spawnSync("git", ["remote", "get-url", "origin"], { cwd: o.root, encoding: "utf8" }).stdout.trim();
      const id = gitIdentity(o.root);
      writeHubState({
        url: /^[a-z][a-z0-9+.-]*:\/\//.test(url) || /^[^/]+@[^:]+:/.test(url) ? url : resolve(o.root, url),
        message: `hub test: ${o.slug} by ${user ?? "unknown"}`,
        author: { name: id.name || user || "hub", email: id.email || "hub@localhost" },
        edit(dir) {
          for (const r of runs) {
            const path = join(dir, "features", o.slug, "tests", `local-${r.team}-${user ?? "unknown"}-${stamp}.json`);
            mkdirSync(dirname(path), { recursive: true });
            writeFileSync(path, `${JSON.stringify({ source: "local", team: r.team, result: r.result, at, ...(user ? { user } : {}), ...(r.ref ? { ref: r.ref } : {}) }, null, 2)}\n`);
          }
          return true;
        },
      });
      say(true, "Recorded as a local run in hub-state. Only CI runs count for the autotests gate.");
    } catch (e) {
      say(false, `Could not record the run: ${(e as Error).message.split("\n")[0]}`, false);
    }
  }
  return { ok: lines.every((l) => l.ok || l.blocking === false), lines };
}
