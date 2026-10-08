import { request as httpRequest, type IncomingHttpHeaders } from "node:http";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadProject, memorySource, type ProjectView } from "@sdlc-hub/core";
import { fixtures, type Fixture } from "@sdlc-hub/fixtures";
import { startServer, type RunningServer } from "../src/index.ts";

function memoryProject(f: Fixture) {
  const authors = (prefix: string) =>
    Object.fromEntries(Object.entries(f.authors ?? {}).flatMap(([k, v]) => (k.startsWith(prefix) ? [[k.slice(prefix.length), v]] : [])));
  const view: ProjectView = {
    specs: memorySource(f.main, authors("main/")),
    hubState: f.hubState ? memorySource(f.hubState, authors("hub-state/")) : null,
    teamClone: (t) => (f.teams?.[t] ? memorySource(f.teams[t]) : null),
    now: f.now,
  };
  const loaded = loadProject(view.specs);
  return { root: "/demo", view, project: loaded.value!, issues: loaded.issues };
}

interface Res {
  status: number;
  headers: IncomingHttpHeaders;
  body: string;
}

let s: RunningServer;
let cookie = "";
const web = mkdtempSync(join(tmpdir(), "hub-web-"));

function get(path: string, headers: Record<string, string> = {}, method = "GET"): Promise<Res> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { host: "127.0.0.1", port: s.port, path, method, headers: { host: `127.0.0.1:${s.port}`, cookie, ...headers } },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (body += c));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
      },
    );
    req.on("error", reject);
    req.end();
  });
}
const json = async (path: string, headers: Record<string, string> = {}) => {
  const r = await get(path, headers);
  expect(r.status, `${path}: ${r.body}`).toBe(200);
  return JSON.parse(r.body);
};

beforeAll(async () => {
  mkdirSync(join(web, "assets"));
  writeFileSync(join(web, "index.html"), "<!doctype html><title>SDLC Hub</title>");
  writeFileSync(join(web, "assets", "app.js"), "console.log(1)");
  const demo = memoryProject(fixtures["demo"]!);
  s = await startServer({ open: () => demo, user: "iryna.s", demo: true, webRoot: web, port: 0 });
  const r = await get("/");
  cookie = (r.headers["set-cookie"]?.[0] ?? "").split(";")[0]!;
});
afterAll(async () => {
  await s.close();
  rmSync(web, { recursive: true, force: true });
});

describe("the boundary", () => {
  it("listens on the loopback address only", () => {
    expect(s.address).toBe("127.0.0.1");
  });
  it("gives the page an HttpOnly, SameSite=Strict session cookie", async () => {
    const r = await get("/", { cookie: "" });
    expect(r.status).toBe(200);
    expect(r.headers["content-type"]).toMatch(/text\/html/);
    expect(r.headers["set-cookie"]?.[0]).toMatch(/^hub_session=[0-9a-f]{64}; .*HttpOnly.*SameSite=Strict/);
  });
  it("refuses the API without the session cookie", async () => {
    expect((await get("/api/features", { cookie: "" })).status).toBe(401);
    expect((await get("/api/features", { cookie: "hub_session=" + "0".repeat(64) })).status).toBe(401);
  });
  it("refuses a request whose Host is not its own", async () => {
    expect((await get("/api/features", { host: "evil.example" })).status).toBe(403);
    expect((await get("/", { host: `attacker.test:${s.port}` })).status).toBe(403);
    expect((await get("/api/features", { host: `localhost:${s.port}` })).status).toBe(200);
  });
  it("refuses a request from another origin", async () => {
    expect((await get("/api/features", { origin: "https://evil.example" })).status).toBe(403);
    expect((await get("/api/features", { origin: `http://127.0.0.1:${s.port}` })).status).toBe(200);
  });
  it("is read only", async () => {
    expect((await get("/api/features", {}, "POST")).status).toBe(405);
    expect((await get("/api/features", {}, "DELETE")).status).toBe(405);
  });
  it("serves the web app and never a file outside it", async () => {
    expect((await get("/assets/app.js")).headers["content-type"]).toMatch(/javascript/);
    expect((await get("/features/tasks-issues")).body).toMatch(/SDLC Hub/); // the app's own routes
    expect((await get("/../package.json")).body).not.toMatch(/"name"/);
    expect((await get("/assets/%2e%2e/%2e%2e/package.json")).status).toBe(404);
  });
  it("sends security headers", async () => {
    const r = await get("/");
    expect(r.headers["x-content-type-options"]).toBe("nosniff");
    expect(r.headers["content-security-policy"]).toMatch(/default-src 'self'/);
  });
});

describe("the API", () => {
  it("says who I am, and in the demo lets me be someone else", async () => {
    expect((await json("/api/session")).me).toMatchObject({ user: "iryna.s", roles: ["qa"] });
    expect((await json("/api/session?as=olena.k")).me).toMatchObject({ user: "olena.k", roles: ["po"] });
    expect((await json("/api/session")).demo).toBe(true);
  });
  it("describes the project: flow, teams, people and engine", async () => {
    const p = await json("/api/project");
    expect(p.flow.steps).toHaveLength(20);
    expect(p.teams.map((t: { id: string }) => t.id)).toEqual(["backend", "web", "android", "ios"]);
    expect(p.people).toHaveLength(10);
    expect(p.engine.invoke.codex).toBe("$sdd-{stage} {slug}");
    expect(p.project).toMatchObject({ name: "Marketplace", provider: "gitlab" });
    expect(p.rules.roles.qa).toContain("docs/features/*/spec.md#Test plan");
    expect(p.rules.contractLead).toContain("docs/features/*/contracts/**");
  });
  it("lists the features with their current step and who it waits on", async () => {
    const list = await json("/api/features");
    const by = Object.fromEntries(list.features.map((f: { slug: string }) => [f.slug, f]));
    expect(Object.keys(by).sort()).toEqual(["bulk-order-export", "order-notes-fix", "order-webhooks", "returns-portal", "staff-permissions", "tasks-issues"]);
    expect(by["returns-portal"]).toMatchObject({ current: "clarify", status: "ready", waitingOn: ["olena.k"], title: "Returns portal for customers" });
    expect(by["staff-permissions"]).toMatchObject({ current: "released", released: true, progress: 100 });
    expect(by["tasks-issues"]).toMatchObject({ current: "verify", status: "returned", cycle: 2, blockingBugs: ["BUG-0012"] });
    expect(by["bulk-order-export"].waits).toBe(3);
    expect(by["bulk-order-export"].crossWaits).toEqual([
      { on: "backend:T2", teams: ["web", "android", "ios"], tasks: [{ team: "web", task: "T3" }, { team: "android", task: "T3" }, { team: "ios", task: "T3" }] },
    ]);
    expect(by["returns-portal"].crossWaits).toEqual([]);
    expect(by["returns-portal"].statuses.slice(0, 3)).toEqual(["done", "ready", "todo"]);
  });
  it("returns one feature with its steps, teams and documents", async () => {
    const f = await json("/api/features/bulk-order-export");
    expect(f.state.steps).toHaveLength(20);
    expect(f.state.teams.map((t: { id: string; source: string }) => [t.id, t.source])).toEqual([["backend", "hub-state"], ["web", "hub-state"], ["android", "local-clone"], ["ios", "hub-state"]]);
    expect(f.feature.links.jira).toMatch(/jira/);
    expect(f.documents.map((d: { path: string }) => d.path)).toContain("spec.md");
    expect((await get("/api/features/no-such-feature")).status).toBe(404);
    const ti = await json("/api/features/tasks-issues");
    expect(ti.state.bugs.map((b: { id: string; status: string }) => [b.id, b.status])).toEqual([["BUG-0012", "retest"], ["BUG-0013", "closed"], ["BUG-0014", "fixing"]]);
    expect(ti.state.testRuns.find((r: { ref?: string }) => r.ref === "pipeline #4127")).toMatchObject({ team: "android", failed: 1 });
  });
  it("returns a document of the feature and nothing outside the feature folder", async () => {
    const r = await get("/api/features/tasks-issues/file?path=spec.md");
    expect(r.status).toBe(200);
    expect(r.body).toMatch(/AC-04/);
    expect((await get("/api/features/tasks-issues/file?path=../../../.hub/config.yaml")).status).toBe(400);
    expect((await get("/api/features/tasks-issues/file?path=/etc/passwd")).status).toBe(400);
    expect((await get("/api/features/tasks-issues/file?path=nothing.md")).status).toBe(404);
  });
});

describe("server-sent events", () => {
  it("tell the page when the files changed", async () => {
    const got = await new Promise<string>((resolve, reject) => {
      const req = httpRequest({ host: "127.0.0.1", port: s.port, path: "/api/events", headers: { host: `127.0.0.1:${s.port}`, cookie } }, (res) => {
        expect(res.headers["content-type"]).toMatch(/text\/event-stream/);
        let buf = "";
        res.setEncoding("utf8");
        res.on("data", (c) => {
          buf += c;
          if (buf.includes("event: changed")) {
            req.destroy();
            resolve(buf);
          }
        });
        setTimeout(() => s.notify(), 50);
      });
      req.on("error", (e) => (String(e).includes("socket hang up") ? undefined : reject(e)));
      req.end();
    });
    expect(got).toMatch(/event: changed/);
  });
});

describe("outside the demo", () => {
  it("ignores ?as= and refuses a person who is not in roles.yaml", async () => {
    const demo = memoryProject(fixtures["demo"]!);
    const other = await startServer({ open: () => demo, user: "stranger", port: 0 });
    try {
      const page = await new Promise<string>((resolve) => {
        httpRequest({ host: "127.0.0.1", port: other.port, path: "/", headers: { host: `127.0.0.1:${other.port}` } }, (res) => resolve((res.headers["set-cookie"]?.[0] ?? "").split(";")[0]!)).end();
      });
      const session = await new Promise<{ status: number; body: string }>((resolve) => {
        httpRequest({ host: "127.0.0.1", port: other.port, path: "/api/session?as=olena.k", headers: { host: `127.0.0.1:${other.port}`, cookie: page } }, (res) => {
          let b = "";
          res.on("data", (c) => (b += c));
          res.on("end", () => resolve({ status: res.statusCode ?? 0, body: b }));
        }).end();
      });
      expect(session.status).toBe(200);
      expect(JSON.parse(session.body)).toMatchObject({ me: null, demo: false, problem: expect.stringMatching(/stranger is not in roles.yaml/) });
    } finally {
      await other.close();
    }
  });
});
