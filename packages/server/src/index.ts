// The local server: bound to 127.0.0.1, it checks Host and Origin on every request, gives the page an HttpOnly
// session cookie, and serves a REST API, server-sent events and the web app. It changes nothing itself: a POST goes
// to the setup handler or, for saves, to the action handler, which pushes a branch whose merge request merges itself.
// See the specification, "Architecture" and "Security".

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { costOf, decryptWith, DEFAULT_PRICES, PRICES_AS_OF, usageRecordSchema, type TotalRow, type Tokens } from "@sdlc-hub/usage";
import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { extname, resolve, sep } from "node:path";
import { awaitsSignoff, CONTRACT_LEAD_RULES, guardSettings, parseSignoffs, platformsOf, releaseView, verificationMatrix, parsePersonState, personStatePath, scriptName, setupScript, type FileSource, DEFAULT_ROLE_RULES, detectFeature, LEAD_RULES, listDocuments, listFeatures, parseFeature, type FeatureState, type Issue, type Project, type ProjectView } from "@sdlc-hub/core";

export interface OpenedProject {
  root: string;
  view: ProjectView;
  project?: Project;
  issues: Issue[];
}

/** What an action may look at: the project and the detected state of a feature, and a way to tell the pages. */
export interface ActionContext {
  project: Project;
  /** product-specs as this machine has it. */
  specs: FileSource;
  state: (slug: string) => FeatureState | undefined;
  emit: (event: string, data?: unknown) => void;
}

/** Saves from the site: POST /api/actions/<name> and GET /api/saves. */
export interface ActionHandler {
  handle(method: "GET" | "POST", path: string, user: string, body: unknown, ctx: ActionContext): Promise<{ status: number; body: unknown }>;
}

/** The first-install site's API. */
export interface SetupHandler {
  handle(method: string, path: string, body: unknown, emit: (event: string, data: unknown) => void): Promise<{ status: number; body: unknown }>;
}

export interface ServerOptions {
  /** Opens the project; called again after every change. Not used in setup mode. */
  open: () => OpenedProject;
  /** Setup mode: serve the setup site at /setup and its API. */
  setup?: SetupHandler;
  /** This machine's private usage key, for the per-person costs the admin and the PM may see. */
  usageKey?: () => string | undefined;
  /** Saves from the site. Without it the site is read only. */
  actions?: ActionHandler;
  /** The roles.yaml user this site is for. */
  user: string;
  /** Demo mode: the page may view as any person with ?as=<user>. */
  demo?: boolean;
  /** The built web app, as a folder. */
  webRoot?: string;
  /** The built web app, as path → base64, when it is bundled into the CLI. */
  assets?: Record<string, string> | null;
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
    const url = new URL(req.url ?? "/", `http://${HOST}:${port}`);
    if (opts.setup && url.pathname.startsWith("/api/setup/") && req.method === "POST") {
      if (!hasSession(req)) return send(res, 401, { error: "Open the setup page first: the session cookie is missing" });
      // A form on another site cannot send JSON without a preflight; together with the Origin check this stops CSRF.
      if (!/^application\/json\b/.test(req.headers["content-type"] ?? "")) return send(res, 415, { error: "Send JSON" });
      return readJson(req, res, (body) => setupCall("POST", url.pathname.slice("/api/setup".length), body, res));
    }
    if (opts.actions && !opts.setup && url.pathname.startsWith("/api/actions/") && req.method === "POST") {
      if (!hasSession(req)) return send(res, 401, { error: "Open the site first: the session cookie is missing" });
      if (!/^application\/json\b/.test(req.headers["content-type"] ?? "")) return send(res, 415, { error: "Send JSON" });
      return readJson(req, res, (body) => action("POST", url.pathname.slice("/api/actions".length), body, url, res));
    }
    if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, { error: "This site saves through actions only" }, { allow: "GET, HEAD" });

    if (url.pathname.startsWith("/api/")) {
      if (!hasSession(req)) return send(res, 401, { error: "Open the site first: the session cookie is missing" });
      if (opts.setup && url.pathname === "/api/setup/events") return events(res, setupClients);
      if (opts.setup && url.pathname.startsWith("/api/setup/")) return setupCall("GET", url.pathname.slice("/api/setup".length), null, res);
      if (opts.setup) return send(res, 404, { error: "Setup mode serves the setup API only" });
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
    if (!opts.webRoot && opts.assets) {
      let path: string;
      try {
        path = decodeURIComponent(url.pathname).replace(/^\/+/, "");
      } catch {
        return send(res, 404, { error: "Not found" });
      }
      const known = Object.hasOwn(opts.assets, path) ? path : undefined;
      if (!known && extname(path)) return send(res, 404, { error: "Not found" });
      const name = known ?? (opts.setup ? "setup.html" : "index.html");
      const type = TYPES[extname(name)] ?? "application/octet-stream";
      const headers: Record<string, string> = { "content-type": type, ...SECURITY };
      if (type.startsWith("text/html")) Object.assign(headers, { "set-cookie": cookie, "cache-control": "no-store" });
      res.writeHead(200, headers);
      return res.end(Buffer.from(opts.assets[name] ?? "", "base64"));
    }
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
    const target = isFile ? file : resolve(root, opts.setup ? "setup.html" : "index.html"); // the app's own routes
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
        // What Settings shows and the admin changes.
        settings: { assistants: config.assistants, links: config.links ?? {}, guard: guardSettings(config), autoMerge: config.git.auto_merge !== false, engine: config.engine, prices: { asOf: PRICES_AS_OF, defaults: DEFAULT_PRICES, overrides: config.prices ?? {} } },
        // What each role may write, for Your guide: the same rules the guard applies.
        rules: { roles: { ...DEFAULT_ROLE_RULES, ...Object.fromEntries(Object.entries(roles.roles ?? {}).map(([r, v]) => [r, v.write])) }, lead: LEAD_RULES, contractLead: CONTRACT_LEAD_RULES },
        issues: opened.issues,
      });
    }

    if (parts[0] === "members" && parts.length === 1) {
      if (!opts.actions) return send(res, 200, { error: "This site does not check membership" });
      return action("GET", "/members", null, url, res);
    }

    if (parts[0] === "saves" && parts.length === 1) {
      if (!opts.actions) return send(res, 200, { saves: [], enabled: false });
      return action("GET", "/saves", null, url, res);
    }

    if (parts[0] === "people" && parts.length === 1) {
      // Each person with what hub setup reported from their machine, for People and roles.
      const people = project.roles.people.map((p) => {
        const text = opened.view.hubState?.read(personStatePath(p.user));
        return { user: p.user, name: p.name, roles: p.roles, team: p.team ?? null, lead: !!p.lead, os: p.os ?? null, assistant: p.assistant ?? "claude", setup: text ? (parsePersonState(text, personStatePath(p.user)).value ?? null) : null };
      });
      return send(res, 200, { people, release: release(opened) });
    }

    if (parts[0] === "script" && parts.length === 1) {
      const person = project.roles.people.find((p) => p.user === url.searchParams.get("user"));
      const shell = url.searchParams.get("shell") === "powershell" ? "powershell" : "bash";
      if (!person) return send(res, 404, { error: "No such person in roles.yaml" });
      try {
        const text = setupScript({ config: project.config, person, shell, release: release(opened), date: opened.view.now.slice(0, 10), by: actor(url) });
        return send(res, 200, { name: scriptName(person.user, shell), text, release: release(opened) });
      } catch (e) {
        return send(res, 422, { error: (e as Error).message });
      }
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
        const st = state(slug)!;
        // The gates that wait for a sign-off now: the site offers Sign off and Return there.
        const awaiting = project.flow.steps.filter((x) => awaitsSignoff(project, st, x.id)).map((x) => x.id);
        // The QA and Release screens: the verdict matrix, the final decisions so far, and the release as it stands.
        const platforms = platformsOf(project.config, st);
        const signoffs = parseSignoffs(opened.view.specs.read(`${dir}/hub/signoffs.yaml`) ?? "[]", "signoffs.yaml").value ?? [];
        const rel = releaseView(opened.view.specs, project.flow, slug);
        const watchEnds = rel.watch ? new Date(Date.parse(rel.watch.started) + rel.watch.days * 86_400_000).toISOString().replace(/\.\d+Z$/, "Z") : null;
        return send(res, 200, {
          feature,
          state: st,
          summary: summary(slug, st, opened),
          documents: listDocuments(opened.view.specs, slug),
          awaiting,
          qa: { matrix: verificationMatrix(opened.view.specs, slug, platforms), decisions: signoffs.filter((e) => e.step === "qa-final" || e.step === "verify") },
          release: { ...rel, watchEnds, now: opened.view.now },
        });
      }
      if (parts.length === 3 && parts[2] === "costs") {
        const viewer = project.roles.people.find((p) => p.user === actor(url));
        const mayPerPerson = !!viewer && (viewer.roles.includes("admin") || viewer.roles.includes("pm"));
        costsOf(slug, opened, project, mayPerPerson ? opts.usageKey?.() : undefined).then(
          (c) => send(res, 200, { ...c, perPerson: mayPerPerson }),
          (e) => send(res, 500, { error: String(e) }),
        );
        return;
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

  function events(res: ServerResponse, to: Set<ServerResponse> = clients) {
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive", ...SECURITY });
    res.write(": connected\n\n");
    to.add(res);
    res.on("close", () => to.delete(res));
  }

  /** The person acting: the site's own, or in the demo the person it views as. */
  const actor = (url: URL) => (opts.demo ? url.searchParams.get("as") : null) ?? opts.user;
  function action(method: "GET" | "POST", path: string, body: unknown, url: URL, res: ServerResponse) {
    const project = data().opened.project;
    if (!project) return send(res, 503, { error: "The project in .hub/ does not load" });
    const emit = (event: string, d?: unknown) => clients.forEach((c) => c.write(`event: ${event}\ndata: ${JSON.stringify(d ?? null)}\n\n`));
    opts.actions!.handle(method, path, actor(url), body, { project, specs: data().opened.view.specs, state, emit }).then(
      (r) => send(res, r.status, r.body),
      (e) => send(res, 500, { error: String(e instanceof Error ? e.message : e) }),
    );
  }

  const setupClients = new Set<ServerResponse>();
  function setupCall(method: string, path: string, body: unknown, res: ServerResponse) {
    const emit = (event: string, data: unknown) => setupClients.forEach((c) => c.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
    opts.setup!.handle(method, path, body, emit).then(
      (r) => send(res, r.status, r.body),
      (e) => send(res, 500, { error: String(e instanceof Error ? e.message : e) }),
    );
  }

  function readJson(req: IncomingMessage, res: ServerResponse, then: (body: unknown) => void) {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > 1_000_000) {
        send(res, 413, { error: "Too large" });
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => {
      if (res.headersSent) return;
      try {
        then(JSON.parse(Buffer.concat(chunks).toString("utf8") || "null"));
      } catch {
        send(res, 400, { error: "Not valid JSON" });
      }
    });
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
            setupClients.forEach((c) => c.end());
            server.close(() => done());
            server.closeAllConnections();
          }),
      });
    });
  });
}

/**
 * The costs of one feature: the open totals by step for every month (groups of three people or more), the estimates,
 * and, decrypted with this machine's key for the admin and the PM, each person's usage.
 */
async function costsOf(slug: string, opened: OpenedProject, project: Project, key: string | undefined) {
  const state = opened.view.hubState;
  const months = [...new Set((state?.list("metrics") ?? []).map((p) => /^metrics\/(\d{4}-\d{2})\//.exec(p)?.[1]).filter((m): m is string => !!m))].sort().reverse();
  const totals = months.map((month) => {
    const rows = (state?.read(`metrics/${month}/usage.jsonl`) ?? "")
      .split("\n")
      .filter(Boolean)
      .flatMap((l) => {
        try {
          return [JSON.parse(l) as TotalRow];
        } catch {
          return [];
        }
      });
    return { month, feature: rows.find((r) => r.dimension === "feature" && r.key === slug) ?? null, steps: rows.filter((r) => r.dimension === "feature-step" && r.key.startsWith(`${slug}/`)).map((r) => ({ ...r, step: r.key.slice(slug.length + 1) })) };
  });
  const people: { month: string; user: string; step: string | null; model: string; messages: number; tokens: Tokens; cost: number | null }[] = [];
  if (key) {
    for (const p of state?.list("metrics") ?? []) {
      const m = /^metrics\/(\d{4}-\d{2})\/([^/]+)\/[^/]+\.jsonl\.age$/.exec(p);
      if (!m) continue;
      const text = await decryptWith(state!.read(p) ?? "", [key]);
      for (const line of (text ?? "").split("\n").filter(Boolean)) {
        const r = usageRecordSchema.safeParse(JSON.parse(line));
        if (!r.success || r.data.slug !== slug) continue;
        people.push({ month: m[1]!, user: m[2]!, step: r.data.step ?? null, model: r.data.model, messages: r.data.messages, tokens: r.data.tokens, cost: costOf(r.data.model, r.data.tokens, project.config.prices) ?? null });
      }
    }
  }
  const feature = parseFeature(opened.view.specs.read(`docs/features/${slug}/hub/feature.yaml`) ?? "", "feature.yaml").value;
  return {
    months,
    totals,
    people,
    estimate: { feature: feature?.estimate?.tokens_m ?? null, steps: Object.fromEntries(project.flow.steps.filter((s) => s.estimate_tokens_m).map((s) => [s.id, s.estimate_tokens_m!])) },
    pricesAsOf: PRICES_AS_OF,
  };
}

/** The hub release a setup script expects: a short hash of hub/cli.js on main, or "none" before it is vendored. */
function release(opened: OpenedProject): string {
  const text = opened.view.specs.read("hub/cli.js");
  return text === undefined ? "none" : createHash("sha256").update(text).digest("hex").slice(0, 12);
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
    /** The status of every step, in flow order, for the Features graph. */
    statuses: s.steps.map((x) => x.status),
    /** Unfinished waits between teams, grouped by the task waited for, so every screen can show them. */
    crossWaits: crossWaits(s),
  };
}

function crossWaits(s: FeatureState): { on: string; teams: string[]; tasks: { team: string; task: string }[] }[] {
  const by = new Map<string, { team: string; task: string }[]>();
  for (const w of s.waits.filter((x) => !x.done)) by.set(w.on, [...(by.get(w.on) ?? []), { team: w.team, task: w.task }]);
  return [...by].map(([on, tasks]) => ({ on, teams: [...new Set(tasks.map((t) => t.team))], tasks }));
}

function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...SECURITY, ...headers });
  res.end(JSON.stringify(body));
}
