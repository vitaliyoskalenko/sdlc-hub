// The admin installs the hub into the cycle group, the team leads merge their hub-report merge requests, the admin
// adds the people, and each person sets their machine up with the script the admin generated for them.
// Run: npm run -s build && node --experimental-transform-types --no-warnings e2e/cycle/install.ts

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseConfig, parseRoles, setupScript } from "@sdlc-hub/core";
import { install, preflight, type SetupAnswers } from "@sdlc-hub/install";
import { as, GROUP, home, jobLog, NAMES, projectId, REPO_ROOT, run, settle, URL_, wait } from "./lib.ts";

const ANSWERS: SetupAnswers = {
  host: "gitlab",
  address: URL_,
  namespace: GROUP,
  repoMode: "existing",
  repo: "product-specs",
  teams: [
    { name: "Backend", repo: "backend", kind: "backend" },
    { name: "Web", repo: "web-admin", kind: "web" },
  ],
  contract: 0,
  project: "Marketplace",
  tracker: { type: "none" },
  links: {},
  assistants: { claude: true, codex: false, cursor: false },
  engine: "sdd",
  headless: false,
};

/** Who is who: the roles the admin gives on the Team page. */
const PEOPLE: { user: string; role: string; team?: string; lead?: boolean }[] = [
  { user: "olena.k", role: "po" },
  { user: "maksym.d", role: "pm" },
  { user: "daria.l", role: "designer" },
  { user: "taras.m", role: "dev", team: "backend", lead: true },
  { user: "petro.v", role: "dev", team: "web", lead: true },
  { user: "iryna.s", role: "qa" },
  { user: "bohdan.r", role: "ops" },
];

const admin = as("nazar.t");
const specs = projectId("product-specs");
const bundle = readFileSync(join(REPO_ROOT, "packages/cli/dist/cli.mjs"), "utf8");

// 1. Checks, then install, as the group Owner.
const pre = await preflight(ANSWERS, admin);
for (const c of pre.checks) console.log(`${c.ok ? "✓" : "✗"} ${c.text}`);
if (!pre.ok) throw new Error("The checks before install failed");
const r = await install(ANSWERS, admin, { hubBundle: bundle });
for (const s of r.steps) console.log(`${s.state === "fail" ? "✗" : "✓"} ${s.state}: ${s.text}`);
for (const l of r.left) console.log(`  next: ${l}`);
if (r.steps.some((s) => s.state === "fail")) throw new Error("Install failed");

// The hub files go through a merge request once main is protected (a second run): wait for it.
const pending = (await admin.openMergeRequests(specs, "sdlc-hub/install"))[0];
if (pending) console.log(`install merge request: ${(await settle(admin, specs, pending.iid)).state}`);

// 2. Each team lead merges the hub-report merge request of their repository.
for (const [repo, lead] of [["backend", "taras.m"], ["web-admin", "petro.v"]] as const) {
  const gl = as(lead);
  const id = projectId(repo);
  const mr = (await gl.openMergeRequests(id, "sdlc-hub/hub-report"))[0];
  if (!mr) continue;
  const m = await gl.autoMerge(id, mr.iid, wait);
  console.log(`${repo}: hub-report merge request !${mr.iid} ${(await settle(gl, id, m.iid)).state}, by ${lead}`);
}

// 3. The admin adds the people, as the Team page would: one merge request on roles.yaml that only the admin passes.
const roles = (await admin.file(specs, ".hub/roles.yaml", "main"))!;
const missing = PEOPLE.filter((p) => !new RegExp(`user: ${p.user.replace(".", "\\.")}\\b`).test(roles));
if (missing.length) {
  const lines = missing.map((p) => `  - { user: ${p.user}, name: ${NAMES[p.user]}, role: ${p.role}${p.team ? `, team: ${p.team}` : ""}${p.lead ? ", lead: true" : ""} }\n`).join("");
  const mr = await admin.propose(specs, { target: "main", branch: `people-${Date.now()}`, title: "Add the team", description: "", actions: [{ action: "update", file_path: ".hub/roles.yaml", content: roles.replace(/\n?$/, "\n") + lines }] });
  const m = await settle(admin, specs, mr.iid);
  if (m.state !== "merged") throw new Error(`roles.yaml did not merge: ${await jobLog(specs, m.head_pipeline?.id ?? 0, "hub-guard")}`);
  console.log(`roles.yaml: added ${missing.map((p) => p.user).join(", ")}`);
}

// 4. Each person runs the setup script the admin generated for them. Claude Code is a stand-in here, so the
// script's "claude plugin install" does not touch this machine's plugin registry; the cycle loads the plugins
// with --plugin-dir instead.
const config = parseConfig((await admin.file(specs, ".hub/config.yaml", "main"))!, "config").value!;
const people = parseRoles((await admin.file(specs, ".hub/roles.yaml", "main"))!, "roles").value!.people;
for (const person of people) {
  const dir = home(person.user);
  mkdirSync(join(dir, "bin"), { recursive: true });
  writeFileSync(join(dir, "setup.sh"), setupScript({ config, person, shell: "bash", release: "cycle", date: new Date().toISOString().slice(0, 10), by: "nazar.t" }));
  writeFileSync(join(dir, "bin/claude"), `#!/bin/sh\necho "$@" >> "${join(dir, "claude-setup.log")}"\n`, { mode: 0o755 });
  const out = run(person.user, dir, "bash", [join(dir, "setup.sh")], { PATH: `${join(dir, "bin")}:${process.env["PATH"]}`, HUB_NO_START: "1" });
  console.log(`${person.user}: ${out.split("\n").filter((l) => /^✓ You are/.test(l))[0] ?? out.trim().split("\n").at(-1)}`);
}
console.log("installed");
