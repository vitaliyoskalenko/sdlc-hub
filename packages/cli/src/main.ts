// The hub command line. Phase 1a: `serve` on a product-specs checkout, and `demo` on a fixture repository.

import { existsSync, mkdtempSync, readdirSync, rmSync, statSync, watch } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { execFile, execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { gitIdentity, openProject, personOf, refSource, topLevel } from "@sdlc-hub/git";
import { startServer, type RunningServer, type ServerOptions } from "@sdlc-hub/server";
import { GitHub, GitLab } from "@sdlc-hub/host";
import { isSaveBranch, setupScript } from "@sdlc-hub/core";
import { baseTime, formatFindings, guardRepo, mergeRequestPeople, pullRequestPeople, recordRefusal } from "./guard.ts";
import { actionHandler } from "./actions.ts";
import { addDemoRemote, demoHost } from "./demo-host.ts";
import { localTests } from "@sdlc-hub/save";
import { collectUsage, noteContext } from "@sdlc-hub/usage";
import { sync } from "./sync.ts";
import { rekey } from "./rekey.ts";
import { upgrade } from "./upgrade.ts";
import { hubBehind } from "./hub-behind.ts";
import { fanoutInto, fanoutPush } from "./fanout.ts";
import { connectTeams } from "./connect-teams.ts";
import { membersOf } from "./members.ts";
import { checklistOf } from "./checklist.ts";
import { recheckGitHub, recheckGitLab } from "./recheck.ts";
import { uninstall } from "./uninstall.ts";
import { claudeHeadless } from "./headless.ts";
import { seedDemoUsage } from "./demo-usage.ts";
import { keyStore } from "@sdlc-hub/usage";
import { doctor, personSetup, print, remoteUrl } from "./person.ts";
import { report, reportTests } from "./report.ts";
import { createHubMcp, sessionContext, type ToolContext } from "@sdlc-hub/plugin";
import { createSaver, flushEvents, queueEvent } from "@sdlc-hub/save";
import { gitCredentials, setupHandler } from "./setup.ts";
import { hostSaves } from "./host-saves.ts";
import { WEB_ASSETS } from "./web-assets.ts";

const HELP = `SDLC Hub

  hub init [--port <n>] [--no-open] [--no-keychain]
      Open the first-install site at http://127.0.0.1:4173/setup. Five screens, then Install.

  hub report --team <id> --specs-url <url> [--push] [--tests passed|failed]
      In a team repository's CI: publish the team's snapshot of each feature to hub-state,
      or with --tests the result of this pipeline, for the autotests gate.

  hub guard [--rules <ref>] [--server-url <url>]
      In the hub-guard job of a product-specs merge request: refuse changes outside the roles of the author
      and of everyone who pushed. The rules are read from --rules (main as fetched), never from the merge request.

  hub hook session-start|prompt|tool|stop
      Run by the assistant: session-start tells it who you are and what waits for you; prompt and tool note the
      feature and step a session works on; stop records the session's token usage on this machine.

  hub mcp [--assistant claude|codex|cursor]
      The MCP server the hub skills call, over stdio. The assistant starts it; you do not.

  hub setup --user <username> --roles <role ...> [--assistant claude|codex|cursor] [--release <hash>]
      Run by your setup script: confirms your roles on main and sets up this checkout and your assistant.

  hub test <slug> [--team <id>]
      Runs your team's autotests (teams[].test in .hub/config.yaml) in your clone and records a local run.

  hub sync
      Pulls main and hub-state, publishes your usage encrypted, and on the admin's or the PM's machine the
      open totals. It also refreshes Claude Code's copy of the hub plugin.

  hub connect-teams
      Run by the admin after adding a team on Settings: opens the hub-report merge request in the new team's
      repository and sets up its fan-out. Uses HUB_SETUP_TOKEN, or the setup token in git's credential helper.

  hub upgrade
      Run by the admin from a newer hub (npx sdlc-hub@<version> upgrade) in their clone of product-specs: proposes
      hub/, the plugin and the assistants' files of that version as one merge request. .hub/ stays as it is.

  hub script --user <username> [--shell bash|powershell]
      Prints a person's setup script, as the Team page gives it. It carries no secret.

  hub uninstall
      Run by the admin: proposes the removal of hub/, .hub/ and the assistants' hub files as one merge request.
      The documents stay. It lists what install set up on the host, to lift by hand after the merge.

  hub usage rekey
      On the admin's or a PM's machine, after the PM, an admin or someone's key changed: encrypts every usage
      record in hub-state again to the person, the admins and the PMs that roles.yaml names now.

  hub doctor
      Checks Node.js, .hub/, who you are, the git host and your assistant's hub plugin.

  hub serve [--port <n>] [--as <user>] [--open <path>]
      Serve the site for the product-specs checkout you are in.
      You are the person in .hub/roles.yaml that matches your git identity, or --as.

  hub demo [--as <user>] [--fixture <name>] [--port <n>]
      Write a fixture repository to a temporary folder and serve it in demo mode.
      --as picks the person (default iryna.s); the site lets you switch person and assistant.
`;

function flags(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith("--")) {
      const [k, v] = a.slice(2).split("=");
      out[k!] = v ?? (argv[i + 1] && !argv[i + 1]!.startsWith("--") ? argv[++i]! : "true");
    }
  }
  return out;
}

/** The built web app: next to the bundle once vendored, or in packages/web/dist during development. */
function webRoot(): string | undefined {
  const here = dirname(fileURLToPath(import.meta.url));
  for (const p of [join(here, "web"), resolve(here, "../../web/dist"), resolve(here, "../../../packages/web/dist")]) if (existsSync(join(p, "index.html"))) return p;
  return undefined;
}

async function listen(open: ServerOptions["open"], user: string, port: number, demo: boolean, extra: Partial<ServerOptions> = {}): Promise<RunningServer> {
  const opts: ServerOptions = { open, user, demo, ...(WEB_ASSETS ? { assets: WEB_ASSETS } : { webRoot: webRoot() }), port, ...extra };
  try {
    return await startServer(opts);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EADDRINUSE") throw e;
    console.log(`Port ${port} is busy; using a free one.`);
    return startServer({ ...opts, port: 0 });
  }
}

/** Re-read the files when they change, and tell every open page. */
function watchFiles(dirs: string[], server: RunningServer) {
  let timer: NodeJS.Timeout | undefined;
  for (const dir of dirs)
    try {
      watch(dir, { recursive: true }, (_e, file) => {
        if (file && /(^|[\\/])\.git[\\/]objects([\\/]|$)/.test(String(file))) return;
        clearTimeout(timer);
        timer = setTimeout(() => server.notify(), 300);
      });
    } catch {
      console.log(`Not watching ${dir}: changes there show after a reload.`);
    }
}

async function serve(f: Record<string, string>) {
  const root = topLevel(process.cwd());
  if (!root) throw new Error("Run hub serve inside the product-specs checkout.");
  const first = openProject(root);
  if (!first.project) {
    for (const i of first.issues) console.error(`${i.file}${i.line ? `:${i.line}` : ""}: ${i.message}`);
    throw new Error(".hub/ does not load; fix the files above.");
  }
  const user = f["as"] ?? personOf(root, first.project.roles);
  if (!user) throw new Error("Your git identity matches nobody in .hub/roles.yaml. Ask the admin to add you, or pass --as <user>.");
  // Saves need a remote to push to; without one the site stays read only and says why.
  let hasRemote = true;
  try {
    execFileSync("git", ["remote", "get-url", "origin"], { cwd: root, stdio: "ignore" });
  } catch {
    hasRemote = false;
  }
  // Headless validation starts the person's own Claude Code, read-only; only when the admin turned it on.
  const actions = hasRemote ? actionHandler({ root, identity: () => gitIdentity(root), headless: claudeHeadless(), hubBehind: () => hubBehind(root), members: membersOf(first.project.config), checklist: checklistOf(first.project.config), ...hostSaves(first.project.config) }) : undefined;
  // The per-person costs the admin and the PM may see are decrypted with this machine's usage key.
  const usageKey = () => {
    try {
      return keyStore(remoteUrl(root)).load();
    } catch {
      return undefined;
    }
  };
  const server = await listen(() => openProject(root), user, Number(f["port"] ?? 4173), false, { ...(actions ? { actions } : {}), usageKey });
  watchFiles([root], server);
  console.log(`SDLC Hub · ${first.project.config.project.name} · ${user}\nServing http://127.0.0.1:${server.port} (this machine only)\nCtrl+C stops the server.`);
  // --open /guide: the setup script ends on Your guide.
  if (f["open"]) openBrowser(`http://127.0.0.1:${server.port}${f["open"] === "true" ? "/" : f["open"].startsWith("/") ? f["open"] : `/${f["open"]}`}`);
}

async function demo(f: Record<string, string>) {
  const { fixtures, materialize } = await import("@sdlc-hub/fixtures");
  const name = f["fixture"] ?? "demo";
  const fixture = fixtures[name];
  if (!fixture) throw new Error(`No fixture "${name}". Choose one of: ${Object.keys(fixtures).join(", ")}`);
  // Demo folders left by a run that was killed without a signal are removed after a day.
  for (const old of readdirSync(tmpdir()).filter((n) => n.startsWith("sdlc-hub-demo-")))
    try {
      if (Date.now() - statSync(join(tmpdir(), old)).mtimeMs > 86_400_000) rmSync(join(tmpdir(), old), { recursive: true, force: true });
    } catch {
      /* another run may be removing it */
    }
  const dir = mkdtempSync(join(tmpdir(), "sdlc-hub-demo-"));
  const { root } = materialize(fixture, dir);
  const user = f["as"] ?? "iryna.s";
  const opened = openProject(root, { now: fixture.now });
  if (!opened.project?.roles.people.some((p) => p.user === user))
    console.log(`Note: ${user} is not in roles.yaml of this fixture; the site will ask who you are.`);
  // Saves go to a bare remote next to the checkout; a stand-in for the git host runs hub-guard and merges.
  const remote = addDemoRemote(root);
  let server: RunningServer | undefined;
  const host = demoHost({ root, remote, onSettled: () => server?.notify() });
  // The demo's clock starts at the fixture's time and moves on, so saves and what the site reads agree.
  const started = Date.now();
  const clock = () => new Date(Date.parse(fixture.now) + (Date.now() - started));
  const actions = actionHandler({
    root,
    identity: (u) => ({ name: opened.project?.roles.people.find((p) => p.user === u)?.name ?? u, email: `${u}@example.com` }),
    pushOptions: () => [],
    now: clock,
    afterPush: host.afterPush,
    // The demo's host, as the checklist would read it: one token close to its end.
    checklist: async () => ({
      items: [
        { ok: true, text: "main of product-specs takes no pushes: every change is a merge request" },
        { ok: true, text: '"Pipelines must succeed" is on' },
        { ok: false, text: "HUB_FANOUT_TOKEN_IOS expires on 2026-10-30, in 21 days: renew it. Without it, iOS gets no shared files." },
      ],
    }),
    // The demo's group: everyone in roles.yaml but sofiia.h, so the Team page shows the warning.
    members: async () => ({ users: (openProject(root).project?.roles.people ?? []).map((p) => p.user).filter((u) => u !== "sofiia.h") }),
  });
  // The demo project has a month of made-up usage, encrypted with a key made now, for the Costs screen.
  const usageKey = name === "demo" ? await seedDemoUsage(root, remote, fixture.now) : undefined;
  server = await listen(() => openProject(root, { now: clock().toISOString() }), user, Number(f["port"] ?? 4173), true, { actions, ...(usageKey ? { usageKey: () => usageKey } : {}) });
  watchFiles([dir], server);
  const people = opened.project?.roles.people.map((p) => `${p.user} (${p.roles.join(", ")})`).join(", ") ?? "";
  console.log(
    `SDLC Hub demo · fixture "${name}" · written to ${root}\n` +
      `Open http://127.0.0.1:${server.port}/?as=${encodeURIComponent(user)}\n` +
      `People: ${people}\n` +
      `Switch person with the "view as" control, or start again with --as <user>. Ctrl+C stops the demo and deletes the folder.`,
  );
  const stop = () => {
    rmSync(dir, { recursive: true, force: true });
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  process.on("SIGHUP", stop);
}

/** Opens a page in the default browser, with an argument list, never a shell. */
function openBrowser(url: string) {
  const [cmd, args] = process.platform === "darwin" ? ["open", [url]] : process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : ["xdg-open", [url]];
  execFile(cmd as string, args as string[], () => undefined);
}

async function init(f: Record<string, string>) {
  // --no-keychain keeps a pasted token in memory only (tests, shared machines).
  const credentials = f["no-keychain"] !== undefined ? { save: () => false } : gitCredentials;
  const handler = setupHandler({ hubBundle: () => readFileSync(fileURLToPath(import.meta.url), "utf8"), credentials });
  const server = await listen(() => ({ root: "", view: null as never, issues: [] }), "", Number(f["port"] ?? 4173), false, { setup: handler });
  const url = `http://127.0.0.1:${server.port}/setup`;
  console.log(`SDLC Hub\n✓ Setup is open at ${url}\n  Leave this window open. Ctrl+C stops the setup.`);
  if (f["no-open"] === undefined) openBrowser(url);
}

async function reportCommand(f: Record<string, string>) {
  if (!f["team"] || !f["specs-url"]) throw new Error("Give --team <id> and --specs-url <url>");
  if (f["tests"] !== undefined && f["tests"] !== "passed" && f["tests"] !== "failed") throw new Error("--tests is passed or failed");
  const r = report({ team: f["team"], cwd: process.cwd(), specsUrl: f["specs-url"], push: f["push"] !== undefined, env: process.env, now: new Date().toISOString().replace(/\.\d+Z$/, "Z") });
  console.log(`hub-report: ${r.slugs.length ? r.slugs.join(", ") : "no features in docs/features"}${r.pushed ? " · published to hub-state" : f["push"] !== undefined ? " · nothing changed" : ""}`);
  if (f["push"] === undefined) console.log(JSON.stringify(r.snapshots, null, 2));
  // The pipeline's result too, for the autotests gate: the hub job at the end of the pipeline passes --tests.
  if (f["tests"] === "passed" || f["tests"] === "failed") {
    const t = reportTests({ team: f["team"], cwd: process.cwd(), specsUrl: f["specs-url"], result: f["tests"], env: process.env, now: new Date().toISOString().replace(/\.\d+Z$/, "Z") });
    console.log(`hub-report: pipeline ${f["tests"]} · ${t.slugs.length ? t.slugs.join(", ") : "no features in docs/features"}`);
  }
}

async function guardCommand(f: Record<string, string>) {
  if (f["github"] !== undefined) return guardGitHub(f);
  const env = process.env;
  const base = env["CI_MERGE_REQUEST_DIFF_BASE_SHA"];
  const token = env["HUB_GUARD_TOKEN"];
  const server = f["server-url"] ?? env["HUB_GIT_URL"] ?? env["CI_SERVER_URL"];
  if (!base || !token || !server) throw new Error("hub guard runs in a merge request pipeline of product-specs, with HUB_GUARD_TOKEN set");
  const cwd = process.cwd();
  const { author, pushers } = await mergeRequestPeople(new GitLab(server, token), env, baseTime(cwd, base));
  const r = guardRepo({ cwd, baseSha: base, rulesRef: f["rules"] ?? base, author, pushers });
  console.log(formatFindings(r, author, pushers));
  if (r.ok) return;
  // A save from the site: tell the person's site why, and close the merge request by deleting its branch.
  const branch = env["CI_MERGE_REQUEST_SOURCE_BRANCH_NAME"] ?? "";
  const stateToken = env["HUB_STATE_TOKEN"];
  if (isSaveBranch(branch) && stateToken) {
    try {
      const sha = env["CI_COMMIT_SHA"] ?? execFileSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" }).trim();
      const at = new Date().toISOString().replace(/\.\d+Z$/, "Z");
      recordRefusal({ url: `${server.replace(/\/+$/, "")}/${env["CI_PROJECT_PATH"]}.git`, token: stateToken, branch, mr: Number(env["CI_MERGE_REQUEST_IID"]), author, sha, at, findings: r.findings, ...(r.advisory ? { advisory: true } : {}) });
      console.log(r.advisory ? "hub-guard: recorded the warnings in hub-state" : `hub-guard: recorded the refusal in hub-state and deleted ${branch}, which closes the merge request`);
    } catch (e) {
      console.log(`hub-guard: could not record the ${r.advisory ? "warnings" : "refusal"}: ${(e as Error).message}`);
    }
  }
  if (!r.advisory) process.exit(1);
}

/** The plugin's view of the product-specs checkout the assistant works in. */
function pluginContext(f: Record<string, string>): ToolContext {
  // The assistant starts the hub in the project, or passes the project folder in CLAUDE_PROJECT_DIR.
  const root = topLevel(process.env["CLAUDE_PROJECT_DIR"] ?? process.cwd());
  if (!root) throw new Error("The hub plugin runs inside the product-specs checkout.");
  const assistant = f["assistant"] === "codex" || f["assistant"] === "cursor" ? f["assistant"] : "claude";
  return {
    open: () => openProject(root),
    user: () => personOf(root, openProject(root).project?.roles),
    assistant,
    record: (slug, e) => {
      queueEvent(root, { slug, ...e });
      // Pushed at once when the host answers; otherwise hub sync sends it later.
      try {
        const id = gitIdentity(root);
        flushEvents(root, { url: remoteUrl(root), author: { name: id.name || "hub", email: id.email || "hub@localhost" } });
      } catch {
        /* queued */
      }
    },
    saver: () => createSaver({ root, identity: gitIdentity(root), ...(() => {
      const config = openProject(root).project?.config;
      return config ? hostSaves(config) : {};
    })() }),
    now: () => new Date(),
  };
}

async function mcp(f: Record<string, string>) {
  const { StdioServerTransport } = await import("@modelcontextprotocol/server/stdio");
  await createHubMcp(pluginContext(f)).connect(new StdioServerTransport());
}

/** A hook of the assistant. session-start prints what the new session should know; it never fails the session. */
/**
 * The assistant's hooks. They never fail the session: a problem is swallowed. Each assistant wants its own answer:
 * Claude Code and Codex take plain text at session start, Cursor JSON; Codex's Stop must print nothing.
 */
async function hook(f: Record<string, string>, event: string | undefined) {
  const assistant = f["assistant"] === "codex" || f["assistant"] === "cursor" ? f["assistant"] : "claude";
  if (event === "session-start") {
    let text: string;
    try {
      text = sessionContext(pluginContext(f));
    } catch (e) {
      text = `SDLC Hub: ${(e as Error).message}`;
    }
    console.log(assistant === "cursor" ? JSON.stringify({ additional_context: text }) : text);
    return;
  }
  try {
    const payload = JSON.parse(await stdinText()) as Record<string, unknown>;
    const roots = payload["workspace_roots"];
    const where = process.env["CLAUDE_PROJECT_DIR"] ?? process.env["CURSOR_PROJECT_DIR"] ?? (Array.isArray(roots) && typeof roots[0] === "string" ? roots[0] : String(payload["cwd"] ?? process.cwd()));
    const root = topLevel(where);
    if (root) {
      const common = execFileSync("git", ["rev-parse", "--git-common-dir"], { cwd: root, encoding: "utf8" }).trim();
      const store = { dir: join(resolve(root, common), "sdlc-hub", "usage") };
      const now = new Date().toISOString().replace(/\.\d+Z$/, "Z");
      // What the session works on: a typed hub command, or a hub tool.
      if (event === "prompt" || event === "tool") noteContext(store, payload, now);
      // What it used: the session's data since the last stop, kept on this machine until hub sync. Cursor keeps none.
      if (event === "stop" && assistant !== "cursor") {
        const opened = openProject(root);
        const person = opened.project?.roles.people.find((p) => p.user === personOf(root, opened.project?.roles));
        if (person) await collectUsage({ store, payload, person: { role: person.roles[0] ?? "unknown", ...(person.team ? { team: person.team } : {}) }, assistant, now });
      }
    }
  } catch {
    /* a hook never stops the assistant */
  }
  // Cursor's prompt hook answers whether the prompt goes on.
  if (event === "prompt" && assistant === "cursor") console.log(JSON.stringify({ continue: true }));
}

/** hub guard --github: in the hub-guard workflow (pull_request_target), on the pull request checked out as data. */
async function guardGitHub(f: Record<string, string>) {
  const env = process.env;
  const token = env["GITHUB_TOKEN"];
  if (!token || !env["GITHUB_EVENT_PATH"]) throw new Error("hub guard --github runs in the hub-guard workflow, with GITHUB_TOKEN set");
  const cwd = process.cwd();
  const rules = f["rules"] ?? "refs/remotes/origin/main";
  const event = JSON.parse(readFileSync(env["GITHUB_EVENT_PATH"], "utf8")) as Parameters<typeof pullRequestPeople>[2];
  const gh = new GitHub(token, env["GITHUB_API_URL"] ?? "https://api.github.com");
  const { author, pushers, branch, number } = await pullRequestPeople(gh, env, event);
  // Where the pull request leaves the target branch: its changes are judged from there.
  const base = execFileSync("git", ["merge-base", "HEAD", rules], { cwd, encoding: "utf8" }).trim();
  const r = guardRepo({ cwd, baseSha: base, rulesRef: rules, author, pushers });
  console.log(formatFindings(r, author, pushers));
  if (r.ok) return;
  // A save from the site: tell the person's site why, and close the pull request by deleting its branch.
  if (isSaveBranch(branch)) {
    try {
      const sha = execFileSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" }).trim();
      const at = new Date().toISOString().replace(/\.\d+Z$/, "Z");
      recordRefusal({ url: `${env["GITHUB_SERVER_URL"] ?? "https://github.com"}/${env["GITHUB_REPOSITORY"]}.git`, token, tokenUser: "x-access-token", branch, mr: number, author, sha, at, findings: r.findings, ...(r.advisory ? { advisory: true } : {}) });
      // Unlike GitLab, GitHub leaves the pull request open when its branch goes.
      if (!r.advisory) await gh.closePull(...(env["GITHUB_REPOSITORY"]!.split("/") as [string, string]), number);
      console.log(r.advisory ? "hub-guard: recorded the warnings in hub-state" : `hub-guard: recorded the refusal in hub-state, deleted ${branch} and closed the pull request`);
    } catch (e) {
      console.log(`hub-guard: could not record the ${r.advisory ? "warnings" : "refusal"}: ${(e as Error).message}`);
    }
  }
  if (!r.advisory) process.exit(1);
}

async function stdinText(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * hub fanout. In product-specs CI on GitLab: a merge request with the shared files in each team repository. With
 * --team <id> --specs <product-specs clone> --into <dir>, in a team repository's workflow on GitHub: the files on the
 * branch hub/fanout of that checkout, for the workflow to open the pull request.
 */
async function fanoutCommand(f: Record<string, string>) {
  if (f["into"] !== undefined) {
    const specsDir = f["specs"];
    if (!specsDir || !f["team"]) throw new Error("hub fanout --team <id> --specs <product-specs clone> --into <dir>");
    const sha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: specsDir, encoding: "utf8" }).trim();
    const r = fanoutInto({ specs: refSource(specsDir, "HEAD"), sha, team: f["team"], dir: f["into"] || ".", env: process.env });
    console.log(r.changed ? `hub-fanout: ${r.files} shared files on hub/fanout\nFANOUT_CHANGED=1` : "hub-fanout: nothing new for this team");
    return;
  }
  const server = f["server-url"] ?? process.env["CI_SERVER_URL"];
  if (!server) throw new Error("hub fanout runs in the product-specs pipeline on main (CI_SERVER_URL), or with --into in a team repository");
  const cwd = process.cwd();
  const sha = process.env["CI_COMMIT_SHA"] ?? execFileSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" }).trim();
  const r = fanoutPush({ specs: refSource(cwd, "HEAD"), sha, serverUrl: server, env: process.env });
  console.log(print(r.lines));
  if (!r.ok) process.exit(1);
}

/** hub recheck: in the pipeline (or workflow) on main after .hub/ changed, open merge requests run hub-guard again. */
async function recheckCommand(f: Record<string, string>) {
  const env = process.env;
  if (f["github"] !== undefined) {
    const [owner, repo] = (env["GITHUB_REPOSITORY"] ?? "").split("/");
    if (!env["GITHUB_TOKEN"] || !owner || !repo) throw new Error("hub recheck --github runs in the hub-recheck workflow, with GITHUB_TOKEN set");
    const r = await recheckGitHub({ gh: new GitHub(env["GITHUB_TOKEN"], env["GITHUB_API_URL"] ?? "https://api.github.com"), owner, repo });
    console.log(print(r.lines));
    return;
  }
  const token = env["HUB_RECHECK_TOKEN"];
  const server = f["server-url"] ?? env["HUB_GIT_URL"] ?? env["CI_SERVER_URL"];
  if (!token || !server || !env["CI_PROJECT_ID"]) throw new Error("hub recheck runs in the pipeline on main of product-specs, with HUB_RECHECK_TOKEN set");
  const r = await recheckGitLab({ gl: new GitLab(server, token), project: env["CI_PROJECT_ID"], target: env["CI_DEFAULT_BRANCH"] ?? "main" });
  console.log(print(r.lines));
}

/** hub connect-teams: the team steps of install, for a team the admin added on Settings. */
async function connectTeamsCommand() {
  const root = topLevel(process.cwd());
  if (!root) throw new Error("Run hub connect-teams in your clone of product-specs.");
  const r = await connectTeams({ root });
  console.log(print(r.lines));
  if (!r.ok) process.exit(1);
}

/** hub script --user <u> [--shell bash|powershell]: a person's setup script, as the Team page gives it. */
async function scriptCommand(f: Record<string, string>) {
  const root = topLevel(process.cwd());
  if (!root) throw new Error("Run hub script in your clone of product-specs.");
  const opened = openProject(root);
  if (!opened.project) throw new Error(".hub/ does not load");
  const person = opened.project.roles.people.find((p) => p.user === f["user"]);
  if (!person) throw new Error(`hub script --user <username>: ${f["user"] ? `${f["user"]} is not in roles.yaml` : "name the person"}`);
  const shell = f["shell"] === "powershell" ? "powershell" : "bash";
  const hub = opened.view.specs.read("hub/cli.js");
  const release = hub === undefined ? "none" : createHash("sha256").update(hub).digest("hex").slice(0, 12);
  const by = personOf(root, opened.project.roles) ?? "admin";
  process.stdout.write(setupScript({ config: opened.project.config, person, shell, release, date: new Date().toISOString().slice(0, 10), by }));
}

/** hub uninstall: the admin removes the hub from product-specs; the documents stay. */
async function uninstallCommand() {
  const root = topLevel(process.cwd());
  if (!root) throw new Error("Run hub uninstall in your clone of product-specs.");
  const r = await uninstall({ root });
  console.log(print(r.lines));
  if (!r.ok) process.exit(1);
}

/** hub upgrade: the admin proposes this hub's files for product-specs, as one merge request. */
async function upgradeCommand() {
  const root = topLevel(process.cwd());
  if (!root) throw new Error("Run hub upgrade in your clone of product-specs.");
  const r = await upgrade({ root, bundle: readFileSync(fileURLToPath(import.meta.url), "utf8") });
  console.log(print(r.lines));
  if (!r.ok) process.exit(1);
}

/** hub usage rekey: encrypt every usage record again to the readers roles.yaml names now. */
async function usageCommand(sub: string | undefined) {
  if (sub !== "rekey") throw new Error("hub usage rekey: encrypt the usage records again, after a PM or an admin changed");
  const root = topLevel(process.cwd());
  if (!root) throw new Error("Run hub usage rekey in your clone of product-specs.");
  const r = await rekey({ root });
  console.log(print(r.lines));
  if (!r.ok) process.exit(1);
}

async function syncCommand() {
  const root = topLevel(process.cwd());
  if (!root) throw new Error("Run hub sync in your clone of product-specs.");
  const r = await sync({ root });
  console.log(print(r.lines));
  if (!r.ok) process.exit(1);
}

async function setupCommand(f: Record<string, string>) {
  const root = topLevel(process.cwd());
  if (!root) throw new Error("Run hub setup in your clone of product-specs; the setup script does this for you.");
  if (!f["user"] || !f["roles"]) throw new Error("Give --user <username> and --roles <role ...>; the setup script does this for you.");
  const r = await personSetup({ root, user: f["user"], roles: f["roles"].split(/[ ,]+/).filter(Boolean), assistant: f["assistant"] ?? "claude", ...(f["release"] ? { release: f["release"] } : {}) });
  console.log(print(r.lines));
  if (!r.ok) process.exit(1);
}

async function doctorCommand() {
  const root = topLevel(process.cwd());
  if (!root) throw new Error("Run hub doctor in your clone of product-specs.");
  const r = doctor(root);
  console.log(print(r.lines));
  if (!r.ok) process.exit(1);
}

async function testCommand(f: Record<string, string>, slug: string | undefined) {
  const root = topLevel(process.cwd());
  if (!root) throw new Error("Run hub test in your clone of product-specs.");
  if (!slug || slug.startsWith("--")) throw new Error("Name the feature: hub test <slug> [--team <id>]");
  const r = localTests({ root, slug, ...(f["team"] ? { team: f["team"] } : {}) });
  console.log(print(r.lines));
  if (!r.ok) process.exit(1);
}

const [command, ...rest] = process.argv.slice(2);
const run = command === "serve" ? serve : command === "demo" ? demo : command === "init" ? init : command === "report" ? reportCommand : command === "guard" ? guardCommand : command === "mcp" ? mcp : command === "setup" ? setupCommand : command === "sync" ? syncCommand : command === "usage" ? () => usageCommand(rest[0]) : command === "upgrade" ? upgradeCommand : command === "fanout" ? fanoutCommand : command === "connect-teams" ? connectTeamsCommand : command === "recheck" ? recheckCommand : command === "uninstall" ? uninstallCommand : command === "script" ? scriptCommand : command === "test" ? (f: Record<string, string>) => testCommand(f, rest[0]) : command === "doctor" ? doctorCommand : command === "hook" ? (f: Record<string, string>) => hook(flags(rest.slice(1)), rest[0]) : undefined;
if (!run) {
  console.log(HELP);
  process.exit(command && command !== "help" && command !== "--help" ? 1 : 0);
}
run!(flags(rest)).catch((e) => {
  console.error(String(e instanceof Error ? e.message : e));
  process.exit(1);
});
