import { request } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtures, materialize } from "@sdlc-hub/fixtures";
import { openProject } from "@sdlc-hub/git";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer, type ActionHandler, type RunningServer } from "../src/index.ts";

const dir = mkdtempSync(join(tmpdir(), "hub-actions-"));
const { root } = materialize(fixtures["demo"]!, dir);
const calls: { method: string; path: string; user: string; body: unknown; current?: string }[] = [];
const handler: ActionHandler = {
  async handle(method, path, user, body, ctx) {
    calls.push({ method, path, user, body, current: ctx.state("tasks-issues")?.current });
    ctx.emit("saves");
    return { status: method === "POST" ? 202 : 200, body: { ok: true } };
  },
};

function server(demo: boolean) {
  return startServer({ open: () => openProject(root), user: "olena.k", demo, actions: handler, port: 0 });
}
function call(s: RunningServer, cookie: string, method: string, path: string, opts: { body?: string; headers?: Record<string, string> } = {}): Promise<{ status: number; body: string; headers: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port: s.port, path, method, headers: { host: `127.0.0.1:${s.port}`, cookie, ...opts.headers } }, (res) => {
      let b = "";
      res.on("data", (c) => (b += c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: b, headers: res.headers }));
    });
    req.on("error", reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}
const json = (body: unknown, headers: Record<string, string> = {}) => ({ body: JSON.stringify(body), headers: { "content-type": "application/json", ...headers } });

let live: RunningServer;
let demo: RunningServer;
let c1 = "";
let c2 = "";
beforeAll(async () => {
  live = await server(false);
  demo = await server(true);
  c1 = ((await call(live, "", "GET", "/")).headers["set-cookie"] as string[])[0]!.split(";")[0]!;
  c2 = ((await call(demo, "", "GET", "/")).headers["set-cookie"] as string[])[0]!.split(";")[0]!;
});
afterAll(async () => {
  await live.close();
  await demo.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("actions that save", () => {
  it("pass a JSON POST with the session to the handler, as the person of this site, with the feature states", async () => {
    const r = await call(live, c1, "POST", "/api/actions/signoff?as=nazar.t", json({ slug: "tasks-issues", step: "clarify" }));
    expect(r.status).toBe(202);
    expect(calls.at(-1)).toMatchObject({ method: "POST", path: "/signoff", user: "olena.k", body: { slug: "tasks-issues", step: "clarify" } });
    expect(calls.at(-1)!.current).toBeTruthy();
  });
  it("let the demo act as the person it views as", async () => {
    await call(demo, c2, "POST", "/api/actions/signoff?as=maksym.d", json({}));
    expect(calls.at(-1)!.user).toBe("maksym.d");
  });
  it("list my saves", async () => {
    expect((await call(live, c1, "GET", "/api/saves")).status).toBe(200);
    expect(calls.at(-1)).toMatchObject({ method: "GET", path: "/saves", user: "olena.k" });
  });
  it("refuse a POST without the session, without JSON or from another site, and any other POST", async () => {
    expect((await call(live, "", "POST", "/api/actions/signoff", json({}))).status).toBe(401);
    expect((await call(live, c1, "POST", "/api/actions/signoff", { body: "a=1", headers: { "content-type": "application/x-www-form-urlencoded" } })).status).toBe(415);
    expect((await call(live, c1, "POST", "/api/actions/signoff", json({}, { origin: "https://evil.example" }))).status).toBe(403);
    expect((await call(live, c1, "POST", "/api/features", json({}))).status).toBe(405);
  });
});
