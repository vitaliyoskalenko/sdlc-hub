// The app shell: top bar, side menu, routes, live updates and the demo controls.

import { render } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { api, onChanges, type Assistant, type ProjectInfo, type Save, type Session, type Summary } from "./api.ts";
import { Feature } from "./feature.tsx";
import { Features } from "./features.tsx";
import { Guide } from "./guide.tsx";
import { CommandHelp } from "./help.tsx";
import { actionsFor, Home, type Action } from "./home.tsx";
import { People, SetupScript } from "./people.tsx";
import { Settings } from "./settings.tsx";
import { Releases } from "./releases.tsx";
import { GuideDoc, Help } from "./guides.tsx";
import { TaskPage } from "./task.tsx";
import "./styles.css";
import { ASSISTANTS, roleOf } from "./text.ts";
import { App, href, roleLabel, type AppState } from "./ui.tsx";

type Route =
  | { page: "home" }
  | { page: "features" }
  | { page: "feature"; slug: string; tab: string }
  | { page: "guide" }
  | { page: "people" }
  | { page: "settings" }
  | { page: "releases" }
  | { page: "help" }
  | { page: "guide-doc"; name: string }
  | { page: "script"; user: string }
  | { page: "missing" };

function route(path: string): Route {
  if (path === "/" || path === "") return { page: "home" };
  if (path === "/features") return { page: "features" };
  if (path === "/guide") return { page: "guide" };
  if (path === "/people") return { page: "people" };
  if (path === "/settings") return { page: "settings" };
  if (path === "/releases") return { page: "releases" };
  if (path === "/help") return { page: "help" };
  const gd = /^\/guides\/([a-z]+)\/?$/.exec(path);
  if (gd) return { page: "guide-doc", name: gd[1]! };
  const sc = /^\/people\/([A-Za-z0-9][A-Za-z0-9._-]*)\/script\/?$/.exec(path);
  if (sc) return { page: "script", user: sc[1]! };
  const m = /^\/features\/([a-z0-9][a-z0-9-]*)(?:\/(documents|tasks|qa|release|costs))?\/?$/.exec(path);
  if (m) return { page: "feature", slug: m[1]!, tab: m[2] ?? "flow" };
  return { page: "missing" };
}

const TITLE: Record<Route["page"], string> = { home: "Home", features: "Features", feature: "Feature", guide: "Your guide", people: "Team", settings: "Settings", releases: "Releases", help: "Help", "guide-doc": "Help", script: "Setup script", missing: "Not found" };

function Root() {
  const [loc, setLoc] = useState(location.pathname + location.search);
  const [version, setVersion] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [features, setFeatures] = useState<Summary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [help, setHelp] = useState<string | null>(null);
  const [task, setTask] = useState<Action | null>(null);
  const [saves, setSaves] = useState<{ list: Save[]; enabled: boolean; why?: string }>({ list: [], enabled: false });
  // The latest open layers, for the Escape handler registered once.
  const layers = useRef({ help: false, task: false });
  layers.current = { help: help !== null, task: task !== null };
  const taskOpener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (task === null && taskOpener.current) {
      taskOpener.current.focus();
      taskOpener.current = null;
    }
    document.documentElement.style.overflow = task ? "hidden" : "";
  }, [task]);
  const openTask = (a: Action) => {
    taskOpener.current = document.activeElement as HTMLElement | null;
    setTask(a);
  };
  // The control that opened the command help gets the focus back when it closes.
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (help === null && opener.current) {
      opener.current.focus();
      opener.current = null;
    }
  }, [help]);
  const openHelp = (text: string) => {
    opener.current = document.activeElement as HTMLElement | null;
    setHelp(text);
  };

  const params = useMemo(() => new URLSearchParams(loc.split("?")[1] ?? ""), [loc]);
  const as = params.get("as") ?? undefined;

  useEffect(() => {
    const onPop = () => setLoc(location.pathname + location.search);
    // Escape closes the command help wherever the focus is, so it is handled here, in the capture phase.
    // Escape closes the top layer: the command help first, then the task page.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (layers.current.help) setHelp(null);
      else if (layers.current.task) setTask(null);
    };
    addEventListener("popstate", onPop);
    addEventListener("keydown", onKey, true);
    const stop = onChanges(() => setVersion((v) => v + 1), setLive);
    return () => {
      removeEventListener("popstate", onPop);
      removeEventListener("keydown", onKey, true);
      stop();
    };
  }, []);

  useEffect(() => {
    api.session(as).then(setSession, (e) => setError(String(e)));
  }, [as, version]);
  useEffect(() => {
    Promise.all([api.project(), api.features()]).then(
      ([p, f]) => {
        setProject(p);
        setFeatures(f.features);
      },
      (e) => setError(String(e)),
    );
  }, [version]);

  // My saves: loaded with every change, and looked at again every few seconds while one waits to merge.
  const viewer = session?.me?.user;
  useEffect(() => {
    if (!viewer) return;
    let live = true;
    const load = () => api.saves(session?.demo ? viewer : undefined).then((x) => live && setSaves({ list: x.saves, enabled: x.enabled, ...(x.why ? { why: x.why } : {}) }), () => undefined);
    void load();
    const waiting = (x: Save) => x.state === "pending" || x.state === "queued";
    const timer = setInterval(() => saves.list.some(waiting) && void load(), 8000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [viewer, version, saves.list.some((x) => x.state === "pending" || x.state === "queued")]);

  // A #section part names a heading of the page, not a page.
  const r = route(loc.split("?")[0]!.split("#")[0]!);
  useEffect(() => {
    document.title = `SDLC Hub · ${r.page === "feature" ? r.slug : TITLE[r.page]}`;
  }, [loc]);

  const go = (path: string, p: Record<string, string | undefined> = {}) => {
    const url = href(path, p);
    history.pushState(null, "", url);
    setLoc(url);
    scrollTo(0, 0);
  };
  const setParam = (key: string, value: string) => {
    const q = new URLSearchParams(location.search);
    q.set(key, value);
    const url = `${location.pathname}?${q}`;
    history.pushState(null, "", url);
    setLoc(url);
  };

  if (error) return <Message title="The hub could not load">{error}</Message>;
  if (!session || !project || !features) return <Message title="Loading the hub…" />;
  if (!session.me)
    return (
      <Message title="Who are you?">
        <p>{session.problem}</p>
        {session.demo && <PersonPicker session={session} current={as ?? ""} pick={(u) => setParam("as", u)} />}
      </Message>
    );

  const me = session.me;
  const asst = params.get("asst");
  const assistant: Assistant = session.demo && (asst === "claude" || asst === "codex" || asst === "cursor") ? asst : me.assistant;
  // A person with several roles chooses the one to work in: it sets the focus of Home and Your guide. What they may
  // do on the site is still everything their roles allow. The choice is kept on this browser.
  const stored = (() => {
    try {
      return localStorage.getItem(`hub.role.${me.user}`);
    } catch {
      return null;
    }
  })();
  const role = [picked, stored].find((x): x is string => !!x && me.roles.includes(x)) ?? me.roles[0]!;
  const setRole = (x: string) => {
    setPicked(x);
    try {
      localStorage.setItem(`hub.role.${me.user}`, x);
    } catch {
      /* kept for this visit only */
    }
  };
  const state: AppState = {
    session,
    me,
    role,
    setRole,
    project,
    features,
    assistant,
    version,
    go,
    help: openHelp,
    openTask,
    saves: saves.list,
    savesEnabled: saves.enabled,
    ...(saves.why ? { savesWhy: saves.why } : {}),
    addSave: (x: Save) => setSaves((v) => ({ ...v, list: [x, ...v.list] })),
  };
  const actions = actionsFor(me, project, features).length;
  const nav: [string, string, number | null][] = [
    ["/", "Home", actions],
    ["/features", "Features", features.length],
    ["/releases", "Releases", null],
  ];
  const current = r.page === "feature" || r.page === "features" ? "/features" : r.page === "home" ? "/" : r.page === "releases" ? "/releases" : "";
  const host = project.project.provider === "github" ? "GitHub" : "GitLab";

  return (
    <App.Provider value={state}>
      <div class="app" inert={help !== null || task !== null}>
        <header class="top">
          <div class="brand">
            <span class="live" role="status" title={live ? "Live: the site updates when main or hub-state changes" : "Reconnecting to the local server"} aria-label={live ? "Live" : "Reconnecting"}>
              <i class={`dot${live ? "" : " off"}`} />
            </span>
            <b>SDLC Hub</b>
            <span class="proj" title={`${project.project.namespace}/${project.project.repo} on ${host}`}>
              {project.project.name}
            </span>
          </div>
          <div class="ctl">
            {session.demo && (
              <span class="protoctl" title="Demo: a sample project. Choose who you are and which assistant you use.">
                <span class="pk">Demo</span>
                <PersonPicker session={session} current={me.user} pick={(u) => setParam("as", u)} />
                <select id="asst" aria-label="Assistant" value={assistant} onChange={(e) => setParam("asst", e.currentTarget.value)}>
                  {ASSISTANTS.map(([a, n]) => (
                    <option key={a} value={a}>
                      {n}
                    </option>
                  ))}
                </select>
              </span>
            )}
            {me.roles.length > 1 && (
              <label class="workas">
                <span>Working as</span>
                <select id="workas" value={role} onChange={(e) => setRole(e.currentTarget.value)}>
                  {me.roles.map((x) => (
                    <option key={x} value={x}>
                      {roleOf(x).n}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button type="button" class="btn sm guide" id="guidebtn" aria-current={r.page === "guide" ? "page" : undefined} onClick={() => go("/guide")}>
              <span class="q" aria-hidden="true">
                ?
              </span>{" "}
              Your guide
            </button>
          </div>
        </header>
        <div class="shell">
          <nav class="side" id="nav" aria-label="Screens">
            {nav.map(([path, label, n]) => (
              <a key={path} class="nb" data-page={path === "/" ? "home" : path.slice(1)} href={href(path)} aria-current={current === path ? "page" : undefined} onClick={(e) => (e.preventDefault(), go(path))}>
                <span>{label}</span>
                {n !== null && <span class="cnt">{n}</span>}
              </a>
            ))}
            <div class="grp">Admin{me.roles.includes("admin") ? "" : " · read only"}</div>
            <a class="nb" data-page="people" href={href("/people")} aria-current={r.page === "people" || r.page === "script" ? "page" : undefined} onClick={(e) => (e.preventDefault(), go("/people"))}>
              <span>Team</span>
            </a>
            <a class="nb" data-page="settings" href={href("/settings")} aria-current={r.page === "settings" ? "page" : undefined} onClick={(e) => (e.preventDefault(), go("/settings"))}>
              <span>Settings</span>
            </a>
            <a class="nb after" data-page="help" href={href("/help")} aria-current={r.page === "help" || r.page === "guide-doc" ? "page" : undefined} onClick={(e) => (e.preventDefault(), go("/help"))}>
              <span>Help</span>
            </a>
          </nav>
          <main id="main">
            {saves.why && (
              <p class="note warn" id="hub-behind">
                {saves.why}
              </p>
            )}
            {r.page === "home" && <Home />}
            {r.page === "features" && <Features params={params} />}
            {r.page === "feature" && <Feature slug={r.slug} tab={r.tab} params={params} />}
            {r.page === "guide" && <Guide />}
            {r.page === "people" && <People />}
            {r.page === "settings" && <Settings />}
            {r.page === "releases" && <Releases />}
            {r.page === "help" && <Help />}
            {r.page === "guide-doc" && <GuideDoc name={r.name} />}
            {r.page === "script" && <SetupScript user={r.user} params={params} />}
            {r.page === "missing" && (
              <div class="lockbox">
                There is no page here. <a href={href("/")}>Go to Home</a>
              </div>
            )}
          </main>
        </div>
        <p class="muted">
          Signed in as {me.name} · {roleLabel(me)}. {saves.enabled ? "Your saves reach main through merge requests that merge by themselves when hub-guard passes." : saves.why ? "Read only until the site is started again with the newer hub." : "Read only: this checkout has no remote to save to."}
        </p>
      </div>
      {task !== null && (
        <div inert={help !== null}>
          <TaskPage action={task} close={() => setTask(null)} />
        </div>
      )}
      {help !== null && <CommandHelp text={help} close={() => setHelp(null)} />}
    </App.Provider>
  );
}

function PersonPicker({ session, current, pick }: { session: Session; current: string; pick: (user: string) => void }) {
  return (
    <label for="persona" class="persona">
      <span class="sr">View as</span>
      <select id="persona" value={current} onChange={(e) => pick(e.currentTarget.value)}>
        {!current && <option value="">Choose a person</option>}
        {session.people.map((p) => (
          <option key={p.user} value={p.user}>
            {p.name} · {roleLabel(p)}
          </option>
        ))}
      </select>
    </label>
  );
}

function Message({ title, children }: { title: string; children?: preact.ComponentChildren }) {
  return (
    <div class="app">
      <div class="card empty">
        <h1>{title}</h1>
        {children}
      </div>
    </div>
  );
}

render(<Root />, document.getElementById("root")!);
