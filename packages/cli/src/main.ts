// The hub command line. Phase 1a: `serve` on a product-specs checkout, and `demo` on a fixture repository.

import { existsSync, mkdtempSync, readdirSync, rmSync, statSync, watch } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile, execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { gitIdentity, openProject, personOf, topLevel } from "@sdlc-hub/git";
import { startServer, type RunningServer, type ServerOptions } from "@sdlc-hub/server";
import { GitLab } from "@sdlc-hub/host";
import { isSaveBranch } from "@sdlc-hub/core";
import { baseTime, formatFindings, guardRepo, mergeRequestPeople, recordRefusal } from "./guard.ts";
import { actionHandler } from "./actions.ts";
import { addDemoRemote, demoHost } from "./demo-host.ts";
import { localTests } from "@sdlc-hub/save";
import { doctor, personSetup, print } from "./person.ts";
import { report, reportTests } from "./report.ts";
import { createHubMcp, sessionContext, type ToolContext } from "@sdlc-hub/plugin";
import { createSaver } from "@sdlc-hub/save";
import { gitCredentials, setupHandler } from "./setup.ts";
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

  hub hook session-start
      Run by the assistant when a session starts: tells it who you are and what waits for you.

  hub mcp [--assistant claude|codex|cursor]
      The MCP server the hub skills call, over stdio. The assistant starts it; you do not.

  hub setup --user <username> --roles <role ...> [--assistant claude|codex|cursor] [--release <hash>]
      Run by your setup script: confirms your roles on main and sets up this checkout and your assistant.

  hub test <slug> [--team <id>]
      Runs your team's autotests (teams[].test in .hub/config.yaml) in your clone and records a local run.

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
  const actions = hasRemote ? actionHandler({ root, identity: () => gitIdentity(root) }) : undefined;
  const server = await listen(() => openProject(root), user, Number(f["port"] ?? 4173), false, actions ? { actions } : {});
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
  });
  server = await listen(() => openProject(root, { now: clock().toISOString() }), user, Number(f["port"] ?? 4173), true, { actions });
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
      recordRefusal({ url: `${server.replace(/\/+$/, "")}/${env["CI_PROJECT_PATH"]}.git`, token: stateToken, branch, mr: Number(env["CI_MERGE_REQUEST_IID"]), author, sha, at, findings: r.findings });
      console.log(`hub-guard: recorded the refusal in hub-state and deleted ${branch}, which closes the merge request`);
    } catch (e) {
      console.log(`hub-guard: could not record the refusal: ${(e as Error).message}`);
    }
  }
  process.exit(1);
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
    saver: () => createSaver({ root, identity: gitIdentity(root) }),
    now: () => new Date(),
  };
}

async function mcp(f: Record<string, string>) {
  const { StdioServerTransport } = await import("@modelcontextprotocol/server/stdio");
  await createHubMcp(pluginContext(f)).connect(new StdioServerTransport());
}

/** A hook of the assistant. session-start prints what the new session should know; it never fails the session. */
async function hook(_f: Record<string, string>, event: string | undefined) {
  if (event !== "session-start") return;
  try {
    console.log(sessionContext(pluginContext({})));
  } catch (e) {
    console.log(`SDLC Hub: ${(e as Error).message}`);
  }
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
const run = command === "serve" ? serve : command === "demo" ? demo : command === "init" ? init : command === "report" ? reportCommand : command === "guard" ? guardCommand : command === "mcp" ? mcp : command === "setup" ? setupCommand : command === "test" ? (f: Record<string, string>) => testCommand(f, rest[0]) : command === "doctor" ? doctorCommand : command === "hook" ? (f: Record<string, string>) => hook(f, rest[0]) : undefined;
if (!run) {
  console.log(HELP);
  process.exit(command && command !== "help" && command !== "--help" ? 1 : 0);
}
run!(flags(rest)).catch((e) => {
  console.error(String(e instanceof Error ? e.message : e));
  process.exit(1);
});
