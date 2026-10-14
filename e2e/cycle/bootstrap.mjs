// Prepares the local GitLab CE for the full feature cycle (e2e/cycle/README.md): a group "cycle" apart from the
// install tests' "shop", every role as a person with their own token, product-specs, and two team repositories
// with a small Node project whose CI runs its tests. Run e2e/gitlab/bootstrap.mjs first (root token, runner).
// Idempotent. Secrets go to ~/.sdlc-hub-test/gitlab.json (mode 600), under "cycle", never into the repository.

import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

const URL_ = "http://localhost:8929";
const API = `${URL_}/api/v4`;
const FILE = join(homedir(), ".sdlc-hub-test", "gitlab.json");
const state = JSON.parse(readFileSync(FILE, "utf8"));
const save = () => {
  writeFileSync(FILE, JSON.stringify(state, null, 2));
  chmodSync(FILE, 0o600);
};
const root = state.rootToken;
if (!root) throw new Error("Run e2e/gitlab/bootstrap.mjs first: it makes the root token and the runner.");

async function call(token, method, path, body) {
  const r = await fetch(`${API}${path}`, { method, headers: { "PRIVATE-TOKEN": token, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  if (!r.ok && r.status !== 404) throw new Error(`${method} ${path}: ${r.status} ${text.slice(0, 300)}`);
  return r.status === 404 ? null : text ? JSON.parse(text) : null;
}

// 1. The people: the admin (an Owner of the group, not an instance admin) and one person per role.
export const PEOPLE = [
  ["nazar.t", "Nazar T."],
  ["olena.k", "Olena K."],
  ["maksym.d", "Maksym D."],
  ["daria.l", "Daria L."],
  ["taras.m", "Taras M."],
  ["petro.v", "Petro V."],
  ["iryna.s", "Iryna S."],
  ["bohdan.r", "Bohdan R."],
];
const users = {};
for (const [username, name] of PEOPLE) {
  users[username] =
    (await call(root, "GET", `/users?username=${username}`))[0] ??
    (await call(root, "POST", "/users", { username, name, email: `${username}@example.com`, password: `Pw-${randomBytes(12).toString("hex")}`, skip_confirmation: true }));
}

let group = await call(root, "GET", "/groups/cycle");
if (!group) group = await call(root, "POST", "/groups", { name: "cycle", path: "cycle", visibility: "private" });
for (const [u] of PEOPLE)
  if (!(await call(root, "GET", `/groups/${group.id}/members/${users[u].id}`))) await call(root, "POST", `/groups/${group.id}/members`, { user_id: users[u].id, access_level: u === "nazar.t" ? 50 : 30 });
// Jobs reach GitLab as host.docker.internal: the hub-report template reads HUB_GIT_URL.
if (!(await call(root, "GET", `/groups/${group.id}/variables/HUB_GIT_URL`))) await call(root, "POST", `/groups/${group.id}/variables`, { key: "HUB_GIT_URL", value: "http://host.docker.internal:8929", raw: true });

// 2. The repositories. Each team repository is a small Node project with its own tests in CI, so the autotests
// gate has real pipelines to read.
const ci = "stages: [test]\n\ntest:\n  stage: test\n  image: node:22-alpine\n  script:\n    - npm test\n";
const pkg = (name) => JSON.stringify({ name, version: "0.1.0", private: true, type: "module", scripts: { test: "node --test" } }, null, 2) + "\n";
const SEED = {
  backend: {
    "package.json": pkg("backend"),
    ".gitlab-ci.yml": ci,
    "README.md": "# backend\n\nThe Marketplace admin API. Node 22, no dependencies: `node src/server.js` serves it, `npm test` runs the tests.\n",
    "src/server.js": `// The Marketplace admin API: plain node:http, JSON in and out.
import { createServer } from "node:http";

/** Orders in memory, for this example project. */
export const orders = new Map([["1001", { id: "1001", customer: "Ann", total: 42 }]]);

export function handle(method, path) {
  if (method === "GET" && path === "/health") return { status: 200, body: { ok: true } };
  const m = /^\\/orders\\/([^/]+)$/.exec(path);
  if (method === "GET" && m) return orders.has(m[1]) ? { status: 200, body: orders.get(m[1]) } : { status: 404, body: { error: "no such order" } };
  return { status: 404, body: { error: "not found" } };
}

export const server = createServer((req, res) => {
  const r = handle(req.method, req.url);
  res.writeHead(r.status, { "content-type": "application/json" }).end(JSON.stringify(r.body));
});

if (import.meta.url === \`file://\${process.argv[1]}\`) server.listen(3000);
`,
    "test/server.test.js": `import { test } from "node:test";
import assert from "node:assert/strict";
import { handle } from "../src/server.js";

test("health answers ok", () => assert.deepEqual(handle("GET", "/health"), { status: 200, body: { ok: true } }));
test("an order is found by its id", () => assert.equal(handle("GET", "/orders/1001").body.customer, "Ann"));
test("an unknown order is 404", () => assert.equal(handle("GET", "/orders/9").status, 404));
`,
  },
  "web-admin": {
    "package.json": pkg("web-admin"),
    ".gitlab-ci.yml": ci,
    "README.md": "# web-admin\n\nThe Marketplace admin web app. Views are pure functions from data to HTML; `npm test` runs the tests.\n",
    "src/order-page.js": `// The order page of the admin app: data in, HTML out.
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

export function orderPage(order) {
  return \`<main><h1>Order \${esc(order.id)}</h1><p>Customer: \${esc(order.customer)}</p><p>Total: \${esc(order.total)}</p></main>\`;
}
`,
    "test/order-page.test.js": `import { test } from "node:test";
import assert from "node:assert/strict";
import { orderPage } from "../src/order-page.js";

test("the order page shows the customer", () => assert.match(orderPage({ id: "1001", customer: "Ann", total: 42 }), /Customer: Ann/));
test("the order page escapes text", () => assert.match(orderPage({ id: "1", customer: "<b>", total: 1 }), /&lt;b&gt;/));
`,
  },
};
const projects = {};
for (const repo of ["product-specs", "backend", "web-admin"]) {
  let p = await call(root, "GET", `/projects/${encodeURIComponent(`cycle/${repo}`)}`);
  if (!p) {
    p = await call(root, "POST", "/projects", { name: repo, path: repo, namespace_id: group.id, visibility: "private", initialize_with_readme: repo === "product-specs" });
    if (SEED[repo])
      await call(root, "POST", `/projects/${p.id}/repository/commits`, {
        branch: "main",
        commit_message: "The project as it is before the feature",
        author_name: "Nazar T.",
        author_email: "nazar.t@example.com",
        actions: Object.entries(SEED[repo]).map(([file_path, content]) => ({ action: "create", file_path, content })),
      });
    console.log(`created cycle/${repo}`);
  }
  projects[repo] = p.id;
}

// Each team lead is a Maintainer of their own team repository, as in a real team, so they merge into its main.
// In the group they stay Developers: the hub asks for that, so no one can change hub-ci or the protection of main.
for (const [repo, lead] of [["backend", "taras.m"], ["web-admin", "petro.v"]]) {
  const m = await call(root, "GET", `/projects/${projects[repo]}/members/${users[lead].id}`);
  if (!m) await call(root, "POST", `/projects/${projects[repo]}/members`, { user_id: users[lead].id, access_level: 40 });
}

// 3. A token per person: what their git credential holds. The admin's has the api scope, for setup.
state.cycle ??= { people: {} };
for (const [u] of PEOPLE) {
  const have = state.cycle.people[u];
  if (have && (await fetch(`${API}/user`, { headers: { "PRIVATE-TOKEN": have } })).ok) continue;
  const t = await call(root, "POST", `/users/${users[u].id}/personal_access_tokens`, { name: "SDLC Hub cycle", scopes: ["api"], expires_at: new Date(Date.now() + 200 * 86400000).toISOString().slice(0, 10) });
  state.cycle.people[u] = t.token;
  save();
  console.log(`token created for ${u}`);
}
state.cycle.projects = projects;
save();
console.log(`ready: ${URL_}/cycle · ${PEOPLE.length} people · secrets in ${FILE}`);
