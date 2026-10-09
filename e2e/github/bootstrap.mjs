// Prepares a throwaway GitHub organization for the GitHub install test: public repositories product-specs, backend
// and web-admin (public, so a Free organization has rulesets, auto-merge and secrets), each team with a CI workflow,
// and a feature in the backend repository for hub-report to publish. Idempotent.
// Reads ~/.sdlc-hub-test/github.json: { "org": "...", "token": "<owner's fine-grained token>",
// "people": { "<login>": "<token>" } } (people optional: a second account, member of the org with write access,
// for the refusal test). Nothing secret is written to the repository.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const FILE = join(homedir(), ".sdlc-hub-test", "github.json");
const { org, token } = JSON.parse(readFileSync(FILE, "utf8"));
const API = "https://api.github.com";

async function call(method, path, body) {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(60_000),
  });
  const text = await r.text();
  if (!r.ok && r.status !== 404) throw new Error(`${method} ${path}: ${r.status} ${text.slice(0, 300)}`);
  return r.status === 404 ? null : text ? JSON.parse(text) : null;
}

/** Creates or updates a file on the default branch through the contents API. */
async function put(repo, path, content, message) {
  const now = await call("GET", `/repos/${org}/${repo}/contents/${path}`);
  const next = Buffer.from(content).toString("base64");
  if (now && now.content.replace(/\n/g, "") === next) return;
  await call("PUT", `/repos/${org}/${repo}/contents/${path}`, { message, content: next, ...(now ? { sha: now.sha } : {}) });
  console.log(`${repo}: wrote ${path}`);
}

const me = await call("GET", "/user");
const membership = await call("GET", `/user/memberships/orgs/${org}`);
if (membership?.role !== "admin") throw new Error(`${me.login} is not an owner of ${org}`);

// A new organization can have deploy keys off (this one did); setup checks it, and the test organization turns it on.
if ((await call("GET", `/orgs/${org}`)).deploy_keys_enabled_for_repositories === false) {
  await call("PATCH", `/orgs/${org}`, { deploy_keys_enabled_for_repositories: true });
  console.log(`turned on deploy keys in ${org}`);
}

for (const repo of ["product-specs", "backend", "web-admin"]) {
  if (!(await call("GET", `/repos/${org}/${repo}`))) {
    await call("POST", `/orgs/${org}/repos`, { name: repo, private: false, auto_init: true, description: "SDLC Hub test repository" });
    console.log(`created ${org}/${repo}`);
  }
}

const ci = 'name: CI\non:\n  push:\n  pull_request:\njobs:\n  tests:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: if [ -f fail-tests ]; then echo "tests failed"; exit 1; fi; echo "tests passed"\n';
for (const repo of ["backend", "web-admin"]) await put(repo, ".github/workflows/ci.yml", ci, "CI");

const slug = "bulk-order-export";
await put("backend", `docs/features/${slug}/tasks.json`, JSON.stringify({ slug, tasks: [{ id: "T1", title: "export_jobs migration", layer: "migration", deps: [], acs: ["AC-01"] }] }), "Tasks of bulk order export");
await put("backend", `docs/features/${slug}/tasks/tracker.md`, "| # | Task | Layer | Owner | Estimate | Blocked by | Status |\n|---|---|---|---|---|---|---|\n| T1 | export_jobs migration | migration | taras.m | S | — | in_progress |\n", "Tracker of bulk order export");

const plan = (await call("GET", `/orgs/${org}`))?.plan?.name ?? "unknown";
console.log(`ready: ${org} (plan ${plan}), owner ${me.login}`);
