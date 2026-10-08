// Prepares a local GitLab CE (docker container sdlc-hub-gitlab, http://localhost:8929) for the install tests:
// a group with an Owner who is not an instance admin, product-specs and four team repositories, an Owner token with
// the api scope, and an instance runner that reaches GitLab as host.docker.internal. Idempotent.
// Secrets go to ~/.sdlc-hub-test/gitlab.json (mode 600), never into the repository.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

const URL_ = "http://localhost:8929";
const API = `${URL_}/api/v4`;
const DIR = join(homedir(), ".sdlc-hub-test");
const FILE = join(DIR, "gitlab.json");
const state = existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : {};
const save = () => {
  mkdirSync(DIR, { recursive: true, mode: 0o700 });
  writeFileSync(FILE, JSON.stringify(state, null, 2));
  chmodSync(FILE, 0o600);
};

async function call(token, method, path, body) {
  const r = await fetch(`${API}${path}`, { method, headers: { "PRIVATE-TOKEN": token, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  const data = text ? JSON.parse(text) : null;
  if (!r.ok && r.status !== 404) throw new Error(`${method} ${path}: ${r.status} ${text.slice(0, 300)}`);
  return r.status === 404 ? null : data;
}

// 1. A root token, made inside the container (only an instance admin can create users and runners).
if (!state.rootToken || !(await fetch(`${API}/user`, { headers: { "PRIVATE-TOKEN": state.rootToken } })).ok) {
  const t = `glpat-${randomBytes(15).toString("hex")}`;
  execFileSync("docker", ["exec", "sdlc-hub-gitlab", "gitlab-rails", "runner",
    `u = User.find_by_username('root'); pt = u.personal_access_tokens.create!(name: 'sdlc-hub-test', scopes: ['api', 'sudo', 'admin_mode'], expires_at: 300.days.from_now); pt.set_token('${t}'); pt.save!`], { stdio: "inherit" });
  state.rootToken = t;
  save();
  console.log("root token created");
}
const root = state.rootToken;

// 2. The admin who installs: an Owner of the group, not an instance admin.
async function user(username, name) {
  const found = (await call(root, "GET", `/users?username=${username}`))[0];
  if (found) return found;
  return call(root, "POST", "/users", { username, name, email: `${username}@example.com`, password: `Pw-${randomBytes(12).toString("hex")}`, skip_confirmation: true });
}
const owner = await user("nazar.t", "Nazar T.");
const people = {};
for (const [u, n] of [["taras.m", "Taras M."], ["petro.v", "Petro V."], ["olena.k", "Olena K."]]) people[u] = await user(u, n);

let group = await call(root, "GET", "/groups/shop");
if (!group) group = await call(root, "POST", "/groups", { name: "shop", path: "shop", visibility: "private" });
const member = await call(root, "GET", `/groups/${group.id}/members/${owner.id}`);
if (!member) await call(root, "POST", `/groups/${group.id}/members`, { user_id: owner.id, access_level: 50 });
for (const p of Object.values(people)) if (!(await call(root, "GET", `/groups/${group.id}/members/${p.id}`))) await call(root, "POST", `/groups/${group.id}/members`, { user_id: p.id, access_level: 30 });

// 3. product-specs and the team repositories; the web team already has its own CI, Android has none.
const CI = { "web-admin": "stages: [build, test]\nbuild:\n  stage: build\n  script: [echo build]\n" };
for (const repo of ["product-specs", "backend", "web-admin", "android-app", "ios-app"]) {
  if (await call(root, "GET", `/projects/${encodeURIComponent(`shop/${repo}`)}`)) continue;
  const p = await call(root, "POST", "/projects", { name: repo, path: repo, namespace_id: group.id, visibility: "private", initialize_with_readme: true });
  if (CI[repo]) await call(root, "POST", `/projects/${p.id}/repository/commits`, { branch: "main", commit_message: "CI", actions: [{ action: "create", file_path: ".gitlab-ci.yml", content: CI[repo] }] });
  console.log(`created shop/${repo}`);
}

// 4. The Owner's token with the api scope: what the admin pastes into setup.
if (!state.ownerToken || !(await fetch(`${API}/user`, { headers: { "PRIVATE-TOKEN": state.ownerToken } })).ok) {
  const t = await call(root, "POST", `/users/${owner.id}/personal_access_tokens`, { name: "SDLC Hub setup", scopes: ["api"], expires_at: new Date(Date.now() + 200 * 86400000).toISOString().slice(0, 10) });
  state.ownerToken = t.token;
  save();
  console.log("owner token created for nazar.t");
}

// 4b. Tokens of two team members, for the guard tests: what each person's git credential holds.
state.people ??= {};
for (const u of ["olena.k", "taras.m"]) {
  if (state.people[u] && (await fetch(`${API}/user`, { headers: { "PRIVATE-TOKEN": state.people[u] } })).ok) continue;
  const t = await call(root, "POST", `/users/${people[u].id}/personal_access_tokens`, { name: "SDLC Hub test", scopes: ["api"], expires_at: new Date(Date.now() + 200 * 86400000).toISOString().slice(0, 10) });
  state.people[u] = t.token;
  save();
  console.log(`token created for ${u}`);
}

// 5. An instance runner in Docker that reaches GitLab as host.docker.internal.
if (!state.runnerReady) {
  const r = await call(root, "POST", "/user/runners", { runner_type: "instance_type", description: "sdlc-hub-test", run_untagged: true });
  execFileSync("docker", ["rm", "-f", "sdlc-hub-runner"], { stdio: "ignore" });
  execFileSync("docker", ["run", "-d", "--name", "sdlc-hub-runner", "-v", "/var/run/docker.sock:/var/run/docker.sock", "gitlab/gitlab-runner:latest"], { stdio: "inherit" });
  execFileSync("docker", ["exec", "sdlc-hub-runner", "gitlab-runner", "register", "--non-interactive", "--url", "http://host.docker.internal:8929", "--token", r.token, "--executor", "docker", "--docker-image", "alpine:latest", "--clone-url", "http://host.docker.internal:8929"], { stdio: "inherit" });
  // Jobs reach GitLab under the same name: the hub-report template reads HUB_GIT_URL.
  if (!(await call(root, "GET", `/groups/${group.id}/variables/HUB_GIT_URL`))) await call(root, "POST", `/groups/${group.id}/variables`, { key: "HUB_GIT_URL", value: "http://host.docker.internal:8929", raw: true });
  state.runnerReady = true;
  save();
  console.log("runner registered");
}
console.log(`ready: ${URL_} · group shop · owner nazar.t · secrets in ${FILE}`);
