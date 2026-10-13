// Builds the static sample of the site: docs/sample/index.html, one file that opens from disk with no server.
// It is the real web app, with the demo project's answers recorded once and nothing to save. Run with
// `npm run sample`; the demo that `./start.sh` serves is not changed.

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { request } from "@playwright/test";
import preact from "@preact/preset-vite";
import { build } from "vite";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 4179;
const base = `http://127.0.0.1:${PORT}`;
const out = join(root, "docs/sample/index.html");

// 1. The demo project, served by the bundled CLI.
const demo = spawn("node", [join(root, "packages/cli/dist/cli.mjs"), "demo", "--port", String(PORT)], { stdio: ["ignore", "pipe", "inherit"] });
await new Promise((ok, fail) => {
  demo.stdout.on("data", (b) => String(b).includes(`127.0.0.1:${PORT}`) && ok());
  demo.on("exit", (c) => fail(new Error(`the demo stopped (${c})`)));
});

const api = {};
try {
  const http = await request.newContext({ baseURL: base });
  await http.get("/"); // the session cookie
  const record = async (path, as = "json") => {
    const r = await http.get(path);
    if (r.ok()) api[path] = as === "text" ? await r.text() : await r.json();
    return r.ok() ? api[path] : null;
  };
  const project = await record("/api/project");
  const people = project.people.map((p) => p.user);
  const q = (u) => `?as=${encodeURIComponent(u)}`;
  await record("/api/session");
  await record("/api/features");
  await record("/api/releases");
  await record("/api/people");
  for (const u of people) {
    await record(`/api/session${q(u)}`);
    await record(`/api/checklist${q(u)}`);
    await record(`/api/members${q(u)}`);
  }
  const { features } = api["/api/features"];
  for (const { slug } of features) {
    const s = encodeURIComponent(slug);
    const detail = await record(`/api/features/${s}`);
    for (const d of detail.documents) await record(`/api/features/${s}/file?path=${encodeURIComponent(d.path)}`, "text");
    await record(`/api/features/${s}/costs`);
    for (const u of people) await record(`/api/features/${s}/costs${q(u)}`);
  }
  for (const viewer of people)
    for (const u of people) for (const shell of ["bash", "powershell"]) await record(`/api/script?user=${encodeURIComponent(u)}&shell=${shell}&as=${encodeURIComponent(viewer)}`);
  await http.dispose();
} finally {
  demo.kill("SIGTERM");
}

// 2. The web app as one script and one style sheet, with no other file to load.
const web = join(root, "packages/web");
const result = await build({
  configFile: false,
  root: web,
  logLevel: "warn",
  plugins: [preact()],
  build: { write: false, cssCodeSplit: false, assetsInlineLimit: 100_000_000, modulePreload: false, rollupOptions: { input: join(web, "index.html"), output: { codeSplitting: false } } },
});
const files = (Array.isArray(result) ? result[0] : result).output;
const js = files.filter((f) => f.type === "chunk").map((f) => f.code).join("\n");
const css = files.filter((f) => f.type === "asset" && f.fileName.endsWith(".css")).map((f) => f.source).join("\n");

// 3. One page: the recorded answers first, then the app. "</" is escaped so no text can close a script early.
const safe = (s) => s.replace(/<\/(script|style)/gi, "<\\/$1");
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>SDLC Hub · sample</title>
<style>${safe(css)}</style>
</head>
<body>
<div id="root"></div>
<script>window.HUB_SAMPLE = ${safe(JSON.stringify({ api }))};</script>
<script type="module">${safe(js)}</script>
</body>
</html>
`;
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`Wrote ${out.replace(root + "/", "")}: ${Object.keys(api).length} recorded answers, ${Math.round(html.length / 1024)} KB`);
