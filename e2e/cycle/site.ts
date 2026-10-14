// Does one thing on the hub's site as a person of the cycle: starts their local server (`node hub/cli.js serve`) in
// their clone of product-specs, posts the action the page's button posts, and waits until the save merged.
//   node --experimental-transform-types --no-warnings e2e/cycle/site.ts <user> <action> '<json body>'
// For example: site.ts maksym.d signoff '{"slug":"order-notes","step":"epic","decision":"pass"}'

import { spawn } from "node:child_process";
import { join } from "node:path";
import { clone, envOf, home, wait } from "./lib.ts";

const [user, action, json] = process.argv.slice(2);
if (!user || !action) throw new Error("site.ts <user> <action> '<json body>'");
const dir = clone(user, "product-specs");
const port = 4300 + Math.floor(Math.random() * 500);
// Claude Code is the setup's stand-in here too: the site never needs it.
const server = spawn("node", ["hub/cli.js", "serve", "--port", String(port)], { cwd: dir, env: { ...envOf(user), PATH: `${join(home(user), "bin")}:${process.env["PATH"]}` }, stdio: ["ignore", "pipe", "inherit"] });
await new Promise<void>((ok) => server.stdout.on("data", (b: Buffer) => String(b).includes("Serving") && ok()));
const base = `http://127.0.0.1:${port}`;
try {
  const cookie = (await fetch(`${base}/`)).headers.get("set-cookie")!.split(";")[0]!;
  const headers = { cookie, origin: base, "content-type": "application/json" };
  const r = await fetch(`${base}/api/actions/${action}`, { method: "POST", headers, body: json ?? "{}" });
  const out = (await r.json()) as { save?: { branch: string; state: string; mr?: { iid: number } }; error?: string; findings?: { path: string; reason: string }[] };
  if (!out.save) {
    console.log(`${user} · ${action}: refused: ${out.error}${(out.findings ?? []).map((f) => `\n- ${f.path}: ${f.reason}`).join("")}`);
    process.exitCode = 1;
  } else {
    // The page looks at its saves until the merge request merged, or was refused.
    let state = out.save.state;
    for (let i = 0; i < 72 && (state === "pending" || state === "queued"); i++) {
      await wait(5000);
      const saves = (await fetch(`${base}/api/saves`, { headers }).then((x) => x.json())) as { saves: { branch: string; state: string }[] };
      state = saves.saves.find((x) => x.branch === out.save!.branch)?.state ?? state;
    }
    console.log(`${user} · ${action}: ${out.save.mr ? `merge request !${out.save.mr.iid}` : out.save.branch} ${state}`);
    if (state !== "merged") process.exitCode = 1;
  }
} finally {
  server.kill();
}
