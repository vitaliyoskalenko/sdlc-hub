// hub uninstall: the admin removes the hub from product-specs by one save; the documents stay. What install set up
// on the host is listed for the admin to lift by hand, after the merge: removing a protection, a token or a secret is
// the admin's call, not the hub's.

import { gitIdentity, openProject, personOf } from "@sdlc-hub/git";
import { fanoutTokenVariable, uninstallChanges } from "@sdlc-hub/core";
import { createSaver, type Line, type SaverOptions } from "@sdlc-hub/save";
import { hostSaves } from "./host-saves.ts";

export async function uninstall(o: { root: string; saver?: Pick<SaverOptions, "pushOptions" | "propose" | "close" | "nudge"> }): Promise<{ ok: boolean; lines: Line[] }> {
  const { project } = openProject(o.root);
  if (!project) return { ok: false, lines: [{ ok: false, text: ".hub/ does not load: remove the hub's files by a merge request by hand" }] };
  const user = personOf(o.root, project.roles);
  if (!user || !project.roles.people.find((p) => p.user === user)?.roles.includes("admin")) return { ok: false, lines: [{ ok: false, text: "Only the admin removes the hub" }] };
  const id = gitIdentity(o.root);
  const saver = createSaver({ root: o.root, identity: { name: id.name || user, email: id.email || `${user}@localhost` }, ...(o.saver ?? hostSaves(project.config)) });
  const lines: Line[] = [];
  try {
    const s = await saver.save({ user, label: "uninstall", title: "Remove SDLC Hub (the documents stay)", meta: { kind: "uninstall" }, build: (main) => uninstallChanges(main) });
    lines.push({ ok: true, text: `Proposed the removal as ${s.mr?.url || s.branch}; it merges when hub-guard passes. The feature documents stay.` });
  } catch (e) {
    return { ok: false, lines: [{ ok: false, text: `Could not propose the removal: ${(e as Error).message.split("\n")[0]}` }] };
  }
  const c = project.config;
  const todo =
    c.git.provider === "gitlab"
      ? [
          `In ${c.git.namespace}/${c.git.repo}: Settings, CI/CD, set the CI configuration file back to .gitlab-ci.yml; Settings, Merge requests, turn off "Pipelines must succeed"; Settings, Repository, let Maintainers push to main again`,
          `Delete the variables HUB_GUARD_TOKEN, HUB_RECHECK_TOKEN and ${c.teams.map((t) => fanoutTokenVariable(t.id)).join(", ")} of ${c.git.repo}, and HUB_STATE_TOKEN of the group; revoke the project access tokens hub-report, hub-guard, hub-recheck and hub-fanout`,
          `Delete the project ${c.git.namespace}/hub-ci`,
          "In each team repository, remove the hub-report include from .gitlab-ci.yml and ci/hub-report.gitlab-ci.yml",
          "Delete the branch hub-state when nobody needs its history",
        ]
      : [
          `In ${c.git.namespace}/${c.git.repo}: Settings, Rules, delete the ruleset "sdlc-hub: main"; Settings, Deploy keys, delete the "sdlc-hub hub-state" keys`,
          "In each team repository, delete the secret HUB_STATE_KEY and the workflows hub-report.yml and hub-fanout.yml",
          "Delete the branch hub-state when nobody needs its history",
        ];
  for (const t of todo) lines.push({ ok: true, text: `After the merge: ${t}`, blocking: false });
  return { ok: true, lines };
}
