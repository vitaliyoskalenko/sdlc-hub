// The hub command line. Phase 1a: `serve` on a product-specs checkout, and `demo` on a fixture repository.

import { watch, mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gitIdentity, openProject, topLevel, userFor } from "@sdlc-hub/git";
import { startServer, type RunningServer } from "@sdlc-hub/server";

const HELP = `SDLC Hub

  hub serve [--port <n>] [--as <user>]
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

async function listen(open: Parameters<typeof startServer>[0]["open"], user: string, port: number, demo: boolean, now?: string): Promise<RunningServer> {
  const opts = { open, user, demo, webRoot: webRoot(), port };
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
  const user = f["as"] ?? userFor(first.project.roles, gitIdentity(root));
  if (!user) throw new Error("Your git identity matches nobody in .hub/roles.yaml. Ask the admin to add you, or pass --as <user>.");
  const server = await listen(() => openProject(root), user, Number(f["port"] ?? 4173), false);
  watchFiles([root], server);
  console.log(`SDLC Hub · ${first.project.config.project.name} · ${user}\nServing http://127.0.0.1:${server.port} (this machine only)\nCtrl+C stops the server.`);
}

async function demo(f: Record<string, string>) {
  const { fixtures, materialize } = await import("@sdlc-hub/fixtures");
  const name = f["fixture"] ?? "demo";
  const fixture = fixtures[name];
  if (!fixture) throw new Error(`No fixture "${name}". Choose one of: ${Object.keys(fixtures).join(", ")}`);
  const dir = mkdtempSync(join(tmpdir(), "sdlc-hub-demo-"));
  const { root } = materialize(fixture, dir);
  const user = f["as"] ?? "iryna.s";
  const opened = openProject(root, { now: fixture.now });
  if (!opened.project?.roles.people.some((p) => p.user === user))
    console.log(`Note: ${user} is not in roles.yaml of this fixture; the site will ask who you are.`);
  const server = await listen(() => openProject(root, { now: fixture.now }), user, Number(f["port"] ?? 4173), true);
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
}

const [command, ...rest] = process.argv.slice(2);
const run = command === "serve" ? serve : command === "demo" ? demo : undefined;
if (!run) {
  console.log(HELP);
  process.exit(command && command !== "help" && command !== "--help" ? 1 : 0);
}
run!(flags(rest)).catch((e) => {
  console.error(String(e instanceof Error ? e.message : e));
  process.exit(1);
});
