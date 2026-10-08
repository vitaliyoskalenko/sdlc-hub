import { request } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startServer, type RunningServer, type SetupHandler } from "../src/index.ts";

let s: RunningServer;
let cookie = "";
const calls: { method: string; path: string; body: unknown }[] = [];
const handler: SetupHandler = {
  async handle(method, path, body, emit) {
    calls.push({ method, path, body });
    if (path === "/install") emit("step", { id: "files", state: "ok" });
    return { status: 200, body: { ok: true, path } };
  },
};

function call(method: string, path: string, opts: { body?: string; headers?: Record<string, string> } = {}): Promise<{ status: number; body: string; headers: Record<string, unknown> }> {
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
const post = (path: string, body: unknown, headers: Record<string, string> = {}) => call("POST", path, { body: JSON.stringify(body), headers: { "content-type": "application/json", ...headers } });

beforeAll(async () => {
  s = await startServer({ open: () => ({ root: "", view: null as never, issues: [] }), user: "", setup: handler, port: 0 });
  cookie = ((await call("GET", "/setup")).headers["set-cookie"] as string[])[0]!.split(";")[0]!;
});
afterAll(() => s.close());

describe("setup mode", () => {
  it("passes a JSON POST with the session to the handler", async () => {
    const r = await post("/api/setup/signin", { token: "x" });
    expect(r.status).toBe(200);
    expect(calls.at(-1)).toEqual({ method: "POST", path: "/signin", body: { token: "x" } });
  });
  it("refuses a POST without the session cookie, without JSON, or from another site", async () => {
    expect((await post("/api/setup/signin", {}, { cookie: "" })).status).toBe(401);
    expect((await call("POST", "/api/setup/signin", { body: "token=x", headers: { "content-type": "application/x-www-form-urlencoded" } })).status).toBe(415);
    expect((await post("/api/setup/signin", {}, { origin: "https://evil.example" })).status).toBe(403);
    expect((await post("/api/setup/signin", {}, { host: "evil.example" })).status).toBe(403);
  });
  it("accepts POST only under /api/setup/", async () => {
    expect((await post("/api/features", {})).status).toBe(405);
  });
  it("sends install progress to the page as events", async () => {
    const got = await new Promise<string>((resolve) => {
      const req = request({ host: "127.0.0.1", port: s.port, path: "/api/setup/events", headers: { host: `127.0.0.1:${s.port}`, cookie } }, (res) => {
        let buf = "";
        res.on("data", (c) => {
          buf += c;
          if (buf.includes("event: step")) {
            req.destroy();
            resolve(buf);
          }
        });
        setTimeout(() => void post("/api/setup/install", {}), 50);
      });
      req.on("error", () => undefined);
      req.end();
    });
    expect(got).toMatch(/event: step\ndata: \{"id":"files","state":"ok"\}/);
  });
});

describe("outside setup mode", () => {
  it("refuses every POST", async () => {
    const other = await startServer({ open: () => ({ root: "", view: null as never, issues: [] }), user: "", port: 0 });
    try {
      const r = await new Promise<number>((resolve) => {
        const req = request({ host: "127.0.0.1", port: other.port, path: "/api/setup/signin", method: "POST", headers: { host: `127.0.0.1:${other.port}`, "content-type": "application/json" } }, (res) => resolve(res.statusCode ?? 0));
        req.end("{}");
      });
      expect(r).toBe(405);
    } finally {
      await other.close();
    }
  });
});
