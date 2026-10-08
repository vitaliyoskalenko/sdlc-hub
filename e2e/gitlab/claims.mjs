// Checks open-items claims 1 and 2 on the local GitLab CE (after bootstrap.mjs). Prints one line per finding.
// Claim 1: on protected main (push: No one, merge: Developers and Maintainers) with "Pipelines must succeed", a merge
// request a Developer sets to merge when the pipeline succeeds merges, in the Developer's name; a direct push is refused.
// Claim 2: with forking off, nobody can fork the specifications repository, so no pipeline can come from a fork.

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";

const URL_ = "http://localhost:8929";
const API = `${URL_}/api/v4`;
const s = JSON.parse(readFileSync(join(homedir(), ".sdlc-hub-test", "gitlab.json"), "utf8"));
const call = async (token, method, path, body) => {
  const r = await fetch(`${API}${path}`, { method, headers: { "PRIVATE-TOKEN": token, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  return { status: r.status, data: t ? JSON.parse(t) : null };
};
const ok = (r, what) => {
  if (r.status >= 300) throw new Error(`${what}: ${r.status} ${JSON.stringify(r.data).slice(0, 300)}`);
  return r.data;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const root = s.rootToken;

// A Developer of the group and a token for them.
const dev = (await call(root, "GET", "/users?username=taras.m")).data[0];
if (!s.devToken || (await call(s.devToken, "GET", "/user")).status !== 200) {
  s.devToken = ok(await call(root, "POST", `/users/${dev.id}/personal_access_tokens`, { name: "claims", scopes: ["api", "write_repository"], expires_at: new Date(Date.now() + 100 * 86400000).toISOString().slice(0, 10) }), "dev token").token;
  writeFileSync(join(homedir(), ".sdlc-hub-test", "gitlab.json"), JSON.stringify(s, null, 2), { mode: 0o600 });
}

// --- claim 1
const group = ok(await call(root, "GET", "/groups/shop"), "group");
let p = (await call(root, "GET", `/projects/${encodeURIComponent("shop/claim-1")}`)).data;
if (!p?.id) {
  p = ok(await call(root, "POST", "/projects", { name: "claim-1", path: "claim-1", namespace_id: group.id, visibility: "private", initialize_with_readme: true }), "project");
  ok(await call(root, "POST", `/projects/${p.id}/repository/commits`, { branch: "main", commit_message: "ci", actions: [{ action: "create", file_path: ".gitlab-ci.yml", content: "check:\n  script: [\"echo checking\"]\n" }] }), "ci");
}
await call(root, "DELETE", `/projects/${p.id}/protected_branches/main`);
ok(await call(root, "POST", `/projects/${p.id}/protected_branches`, { name: "main", push_access_level: 0, merge_access_level: 30 }), "protect main");
ok(await call(root, "PUT", `/projects/${p.id}`, { only_allow_merge_if_pipeline_succeeds: true }), "pipelines must succeed");

// A direct push by the Developer to main must be refused.
const work = mkdtempSync(join(tmpdir(), "claim1-"));
const env = { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "http.extraHeader", GIT_CONFIG_VALUE_0: `Authorization: Basic ${Buffer.from(`oauth2:${s.devToken}`).toString("base64")}` };
const git = (...a) => execFileSync("git", a, { cwd: work, env, stdio: "pipe" }).toString();
git("clone", "-q", `${URL_}/shop/claim-1.git`, ".");
writeFileSync(join(work, "direct.txt"), `${Date.now()}\n`);
git("add", ".");
git("-c", "user.name=Taras M.", "-c", "user.email=taras.m@example.com", "commit", "-q", "-m", "direct");
let pushed = true;
try {
  git("push", "-q", "origin", "HEAD:main");
} catch {
  pushed = false;
}
console.log(`claim 1 · a Developer's direct push to protected main: ${pushed ? "ACCEPTED (unexpected)" : "refused"}`);

// The Developer's merge request, set to merge when the pipeline succeeds.
const branch = `save-${Date.now()}`;
git("push", "-q", "origin", `HEAD:refs/heads/${branch}`);
rmSync(work, { recursive: true, force: true });
const mr = ok(await call(s.devToken, "POST", `/projects/${p.id}/merge_requests`, { source_branch: branch, target_branch: "main", title: "A save from the site", remove_source_branch: true, squash: true }), "mr");
// GitLab first checks whether a new merge request can merge; until then it answers 422 or 405.
for (let i = 0; i < 30; i++) {
  const st = ok(await call(s.devToken, "GET", `/projects/${p.id}/merge_requests/${mr.iid}`), "mr").detailed_merge_status;
  if (!["unchecked", "checking", "preparing", "approvals_syncing"].includes(st)) break;
  await sleep(2000);
}
let set = { status: 0 };
for (let i = 0; i < 20; i++) {
  set = await call(s.devToken, "PUT", `/projects/${p.id}/merge_requests/${mr.iid}/merge`, { merge_when_pipeline_succeeds: true, squash: true });
  if (set.status < 300) break;
  await sleep(3000);
}
console.log(`claim 1 · the Developer sets "merge when pipeline succeeds": ${set.status} ${set.data?.merge_when_pipeline_succeeds ?? set.data?.state ?? JSON.stringify(set.data).slice(0, 120)}`);
let m;
for (let i = 0; i < 60; i++) {
  m = ok(await call(root, "GET", `/projects/${p.id}/merge_requests/${mr.iid}`), "mr state");
  if (m.state === "merged") break;
  await sleep(5000);
}
console.log(`claim 1 · result: ${m.state}${m.state === "merged" ? `, merged by ${m.merged_by?.username ?? m.merge_user?.username}` : ""}; pipeline ${m.head_pipeline?.status ?? "none"}`);

// --- claim 2
const specs = ok(await call(root, "GET", `/projects/${encodeURIComponent("shop/product-specs")}`), "specs");
console.log(`claim 2 · forking of product-specs: ${specs.forking_access_level}`);
const fork = await call(s.devToken, "POST", `/projects/${specs.id}/fork`, { namespace_path: "taras.m", path: `product-specs-fork-${Date.now()}` });
console.log(`claim 2 · a member's fork of product-specs: ${fork.status < 300 ? "ALLOWED (unexpected)" : `refused (${fork.status} ${JSON.stringify(fork.data?.message ?? fork.data).slice(0, 120)})`}`);
if (fork.status < 300) await call(root, "DELETE", `/projects/${fork.data.id}`);
