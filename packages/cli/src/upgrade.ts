// hub upgrade: the admin runs a newer hub in their clone of product-specs (npx sdlc-hub@<version> upgrade). It writes the
// hub's own files again from that hub: hub/cli.js, its version, the plugin and the assistants' files, and on GitHub the
// hub-guard workflow. It is one save, a merge request in the admin's name; .hub/ stays as the admin wrote it.

import { spawnSync } from "node:child_process";
import { compareVersions, HUB_VERSION, hubVersionOf } from "@sdlc-hub/core";
import { gitIdentity, openProject, personOf, refSource } from "@sdlc-hub/git";
import { hubOwnedFiles } from "@sdlc-hub/install";
import { createSaver, Unchanged, type Line, type SaverOptions } from "@sdlc-hub/save";
import { hostSaves } from "./host-saves.ts";

export interface UpgradeOptions {
  root: string;
  /** The text of the hub that runs: it becomes hub/cli.js. */
  bundle: string;
  version?: string;
  /** How the save opens its request; from the host in config.yaml by default. */
  saver?: Pick<SaverOptions, "pushOptions" | "propose" | "close" | "nudge">;
}

export async function upgrade(o: UpgradeOptions): Promise<{ ok: boolean; lines: Line[] }> {
  const lines: Line[] = [];
  const say = (ok: boolean, text: string) => lines.push({ ok, text });
  const version = o.version ?? HUB_VERSION;
  const opened = openProject(o.root);
  if (!opened.project) {
    say(false, ".hub/ does not load; fix it first");
    return { ok: false, lines };
  }
  const { project } = opened;
  const user = personOf(o.root, project.roles);
  if (!user || !project.roles.people.find((p) => p.user === user)?.roles.includes("admin")) {
    say(false, "Only the admin upgrades the hub: hub/ and the assistants' files are the admin's");
    return { ok: false, lines };
  }
  const id = gitIdentity(o.root);
  const saver = createSaver({ root: o.root, identity: { name: id.name || user, email: id.email || `${user}@localhost` }, ...(o.saver ?? hostSaves(project.config)) });
  // main as it is on the remote now: the upgrade replaces what is there.
  const fetched = spawnSync("git", ["fetch", "-q", "origin", "+refs/heads/main:refs/remotes/origin/main"], { cwd: o.root, encoding: "utf8", env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
  if (fetched.status !== 0) {
    say(false, `Could not reach the git host: ${(fetched.stderr ?? "").trim().split("\n").at(-1)}`);
    return { ok: false, lines };
  }
  const main = refSource(o.root, "refs/remotes/origin/main");
  const from = hubVersionOf(main.read("hub/package.json"));
  if (from && compareVersions(from, version) > 0) {
    say(false, `main has hub ${from}, newer than this one (${version}): run the newer one`);
    return { ok: false, lines };
  }
  const c = project.config;
  const files = await hubOwnedFiles({
    host: c.git.provider,
    assistants: { codex: c.assistants.includes("codex"), cursor: c.assistants.includes("cursor") },
    engine: c.engine,
    marketplace: c.project.name,
    bundle: o.bundle,
    version,
    read: async (p) => main.read(p),
  });
  try {
    const s = await saver.save({
      user,
      label: `upgrade-${version}`,
      title: `Upgrade SDLC Hub ${from ?? "(unversioned)"} to ${version}`,
      meta: { kind: "upgrade", version },
      build: (m) => Object.entries(files).flatMap(([path, next]) => {
        const base = m.read(path);
        return base === next ? [] : [{ path, next, ...(base !== undefined ? { base } : {}) }];
      }),
    });
    say(true, `Proposed the upgrade from ${from ?? "an unversioned hub"} to ${version} as ${s.mr?.url || s.branch}; it merges itself when hub-guard passes`);
    say(true, "Everyone gets it with hub sync; a site that runs the older hub turns read only until it is restarted");
    if (c.git.provider === "gitlab") lines.push({ ok: true, text: "hub-ci keeps its job configuration: run setup again if a release note says it changed", blocking: false });
  } catch (e) {
    if (e instanceof Unchanged) say(true, `main already has hub ${version}`);
    else say(false, `Could not propose the upgrade: ${(e as Error).message.split("\n")[0]}`);
  }
  return { ok: lines.every((l) => l.ok || l.blocking === false), lines };
}
