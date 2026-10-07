// The local server: bound to 127.0.0.1, it checks Host and Origin on every request, gives the page an HttpOnly
// session cookie, and serves a read-only REST API, server-sent events and the web app.
// See the specification, "Architecture" and "Security".

import { randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { extname, resolve, sep } from "node:path";
import { detectFeature, listDocuments, listFeatures, parseFeature, type FeatureState, type Issue, type Project, type ProjectView } from "@sdlc-hub/core";

export interface OpenedProject {
  root: string;
  view: ProjectView;
  project?: Project;
  issues: Issue[];
}

export interface ServerOptions {
  /** Opens the project; called again after every change. */
  open: () => OpenedProject;
  /** The roles.yaml user this site is for. */
  user: string;
  /** Demo mode: the page may view as any person with ?as=<user>. */
  demo?: boolean;
  /** The built web app. */
  webRoot?: string;
  /** 0 picks a free port. */
  port?: number;
}

export interface RunningServer {
  port: number;
  address: string;
  /** Re-reads the files and tells every open page. */
  notify(): void;
  close(): Promise<void>;
}

const HOST = "127.0.0.1";
const COOKIE = "hub_session";
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
};
const SECURITY = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "x-frame-options": "DENY",
  "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
};

export function startServer(opts: ServerOptions): Promise<RunningServer> {
  const token = randomBytes(32).toString("hex");
  const clients = new Set<ServerResponse>();
  let port = 0;
  let cache: { opened: OpenedProject; states: Map<string, FeatureState> } | undefined;

  const data = () => {
    if (!cache) cache = { opened: opts.open(), states: new Map() };
    return cache;
  };
  const state = (slug: string): FeatureState | undefined => {
    const d = data();
    if (!d.opened.project) return undefined;
    if (!d.states.has(slug)) d.states.set(slug, detectFeature(d.opened.project, d.opened.view, slug));
    return d.states.get(slug);
  };

  const server: Server = createServer((req, res) => {
    try {
      handle(req, res);
    } catch (e) {
      send(res, 500, { error: "The server failed to answer", detail: String(e) });
    }
  });

  function handle(req: IncomingMessage, res: ServerResponse) {
    // Another site in the browser must not reach this server: check Host (DNS rebinding) and Origin.
    const own = [`${HOST}:${port}`, `localhost:${port}`];
    if (!own.includes(req.headers.host ?? "")) return send(res, 403, { error: "Wrong host" });
    const origin = req.headers.origin;
    if (origin !== undefined && !own.map((h) => `http://${h}`).includes(origin)) return send(res, 403, { error: "Wrong origin" });
    if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, { error: "This site is read only" }, { allow: "GET, HEAD" });

    const url = new URL(req.url ?? "/", `http://${HOST}:${port}`);
    if (url.pathname.startsWith("/api/")) {
      if (!hasSession(req)) return send(res, 401, { error: "Open the site first: the session cookie is missing" });
      return api(url, res);
    }
    return page(url, res);
  }

  function hasSession(req: IncomingMessage): boolean {
    const m = new RegExp(`(?:^|;\\s*)${COOKIE}=([0-9a-f]{64})`).exec(req.headers.cookie ?? "");
    return !!m && timingSafeEqual(Buffer.from(m[1]!), Buffer.from(token));
  }

  function page(url: URL, res: ServerResponse) {
    const cookie = `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/`;
    if (!opts.webRoot) {
      res.writeHead(200, { "content-type": "text/plain; charset=utf-8", "set-cookie": cookie, ...SECURITY });
      return res.end("SDLC Hub: the web app is not built. Run npm run build -w @sdlc-hub/web.");
    }
    const root = resolve(opts.webRoot);
    let path: string;
    try {
      path = decodeURIComponent(url.pathname);
    } catch {
      return send(res, 404, { error: "Not found" });
    }
    const file = resolve(root, "." + path);
    if (file !== root && !file.startsWith(root + sep)) return send(res, 404, { error: "Not found" });
    const isFile = existsSync(file) && statSync(file).isFile();
    if (!isFile && extname(path)) return send(res, 404, { error: "Not found" });
    const target = isFile ? file : resolve(root, "index.html"); // the app's own routes
    const type = TYPES[extname(target)] ?? "application/octet-stream";
    const headers: Record<string, string> = { "content-type": type, ...SECURITY };
    if (type.startsWith("text/html")) Object.assign(headers, { "set-cookie": cookie, "cache-control": "no-store" });
    res.writeHead(200, headers);
    res.end(readFileSync(target));
  }

  function api(url: URL, res: ServerResponse) {
    const parts = url.pathname.split("/").filter(Boolean).slice(1); // after "api"
    const { opened } = data();
    const project = opened.project;

    if (parts[0] === "events" && parts.length === 1) return events(res);

    if (parts[0] === "session" && parts.length === 1) {
      const asked = opts.demo ? url.searchParams.get("as") : null;
      const user = asked ?? opts.user;
      const p = project?.roles.people.find((x) => x.user === user);
      const people = project?.roles.people.map(({ user: u, name, roles, team, lead }) => ({ user: u, name, roles, team: team ?? null, lead: !!lead })) ?? [];
      return send(res, 200, {
        me: p ? { user: p.user, name: p.name, roles: p.roles, team: p.team ?? null, lead: !!p.lead, assistant: p.assistant ?? "claude" } : null,
        demo: !!opts.demo,
        people: opts.demo ? people : [],
        ...(p ? {} : { problem: `${user} is not in roles.yaml. Ask the admin to add you on People and roles.` }),
      });
    }

    if (!project) return send(res, 503, { error: "The project in .hub/ does not load", issues: opened.issues });

    if (parts[0] === "project" && parts.length === 1) {
      const { config, flow, engine, roles } = project;
      return send(res, 200, {
        project: { name: config.project.name, provider: config.git.provider, host: config.git.host, namespace: config.git.namespace, repo: config.git.repo },
        flow: { lanes: flow.lanes, watchDays: flow.release.watch_days, steps: flow.steps.map((s) => ({ id: s.id, role: s.role, kind: s.kind, llm: s.llm !== false, gate: s.gate ?? null, stages: engine.steps[s.id]?.stages ?? [] })) },
        teams: config.teams,
        people: roles.people.map(({ user, name, roles: r, team, lead, assistant }) => ({ user, name, roles: r, team: team ?? null, lead: !!lead, assistant: assistant ?? "claude" })),
        engine: { id: engine.id, source: engine.source, version: engine.version, invoke: engine.invoke },
        tracker: config.tracker,
        headless: config.headless.enabled,
        issues: opened.issues,
      });
    }

    if (parts[0] === "features" && parts.length === 1) {
      const features = listFeatures(opened.view.specs).map((slug) => summary(slug, state(slug)!, opened));
      return send(res, 200, { features, now: opened.view.now });
    }

    const slug = parts[1];
    if (parts[0] === "features" && slug && /^[a-z0-9][a-z0-9-]*$/.test(slug) && listFeatures(opened.view.specs).includes(slug)) {
      const dir = `docs/features/${slug}`;
      if (parts.length === 2) {
        const feature = parseFeature(opened.view.specs.read(`${dir}/hub/feature.yaml`) ?? "", "feature.yaml").value ?? null;
        return send(res, 200, { feature, state: state(slug), summary: summary(slug, state(slug)!, opened), documents: listDocuments(opened.view.specs, slug) });
      }
      if (parts.length === 3 && parts[2] === "file") {
        const path = url.searchParams.get("path") ?? "";
        if (!path || path.startsWith("/") || path.includes("\\") || path.includes("\0") || path.split("/").some((x) => x === ".." || x === "." || x === ""))
          return send(res, 400, { error: "Give a path inside the feature folder" });
        const text = opened.view.specs.read(`${dir}/${path}`);
        if (text === undefined) return send(res, 404, { error: "No such file in this feature" });
        res.writeHead(200, { "content-type": "text/plain; charset=utf-8", ...SECURITY });
        return res.end(text);
      }
    }
    return send(res, 404, { error: "Not found" });
  }

  function events(res: ServerResponse) {
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive", ...SECURITY });
    res.write(": connected\n\n");
    clients.add(res);
    res.on("close", () => clients.delete(res));
  }

  const heartbeat = setInterval(() => clients.forEach((c) => c.write(": ping\n\n")), 25_000);
  heartbeat.unref();

  return new Promise((resolveStart, reject) => {
    server.once("error", reject);
    server.listen(opts.port ?? 4173, HOST, () => {
      const addr = server.address();
      port = typeof addr === "object" && addr ? addr.port : 0;
      resolveStart({
        port,
        address: typeof addr === "object" && addr ? addr.address : "",
        notify() {
          cache = undefined;
          clients.forEach((c) => c.write("event: changed\ndata: {}\n\n"));
        },
        close: () =>
          new Promise<void>((done) => {
            clearInterval(heartbeat);
            clients.forEach((c) => c.end());
            server.close(() => done());
            server.closeAllConnections();
          }),
      });
    });
  });
}

/** One row of the Features list. */
function summary(slug: string, s: FeatureState, opened: OpenedProject) {
  const flow = opened.project!.flow;
  const released = s.current === "released";
  const cur = s.steps.find((x) => x.id === s.current);
  const counted = s.steps.filter((x) => x.status !== "skipped");
  const done = counted.filter((x) => x.status === "done").length;
  const step = flow.steps.find((x) => x.id === s.current);
  const ballRole = !cur || !step ? null : cur.status === "signoff" && step.gate && step.gate.role !== "auto" ? step.gate.role : step.role;
  return {
    slug,
    title: s.title ?? slug,
    size: s.size ?? null,
    route: s.route,
    routeDefaulted: s.routeDefaulted,
    current: s.current,
    index: released ? flow.steps.length : flow.steps.findIndex((x) => x.id === s.current) + 1,
    status: released ? "done" : (cur?.status ?? "todo"),
    role: ballRole,
    waitingOn: cur?.waitingOn ?? [],
    by: cur?.by ?? null,
    reason: cur?.reason ?? null,
    released,
    progress: released ? 100 : Math.round((done / Math.max(1, counted.length)) * 100),
    waits: s.waits.filter((w) => !w.done).length,
    blockingBugs: s.blockingBugs,
    cycle: s.cycle,
    warnings: s.warnings.length,
  };
}

function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...SECURITY, ...headers });
  res.end(JSON.stringify(body));
}
