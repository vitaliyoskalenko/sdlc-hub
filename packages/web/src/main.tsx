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
import { TaskPage } from "./task.tsx";
import "./styles.css";
import { ASSISTANTS } from "./text.ts";
import { App, href, roleLabel, type AppState } from "./ui.tsx";

type Route =
  | { page: "home" }
  | { page: "features" }
  | { page: "feature"; slug: string; tab: string }
  | { page: "guide" }
  | { page: "people" }
  | { page: "settings" }
  | { page: "script"; user: string }
  | { page: "missing" };

function route(path: string): Route {
  if (path === "/" || path === "") return { page: "home" };
  if (path === "/features") return { page: "features" };
  if (path === "/guide") return { page: "guide" };
  if (path === "/people") return { page: "people" };
  if (path === "/settings") return { page: "settings" };
  const sc = /^\/people\/([A-Za-z0-9][A-Za-z0-9._-]*)\/script\/?$/.exec(path);
  if (sc) return { page: "script", user: sc[1]! };
  const m = /^\/features\/([a-z0-9][a-z0-9-]*)(?:\/(documents|tasks|qa|release|costs))?\/?$/.exec(path);
  if (m) return { page: "feature", slug: m[1]!, tab: m[2] ?? "flow" };
  return { page: "missing" };
}

const TITLE: Record<Route["page"], string> = { home: "Home", features: "Features", feature: "Feature", guide: "Your guide", people: "People and roles", settings: "Settings", script: "Setup script", missing: "Not found" };

function Root() {
  const [loc, setLoc] = useState(location.pathname + location.search);
  const [version, setVersion] = useState(0);
  const [live, setLive] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [features, setFeatures] = useState<Summary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [help, setHelp] = useState<string | null>(null);
  const [task, setTask] = useState<Action | null>(null);
  const [saves, setSaves] = useState<{ list: Save[]; enabled: boolean }>({ list: [], enabled: false });
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
    const load = () => api.saves(session?.demo ? viewer : undefined).then((x) => live && setSaves({ list: x.saves, enabled: x.enabled }), () => undefined);
    void load();
    const timer = setInterval(() => saves.list.some((x) => x.state === "pending") && void load(), 8000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [viewer, version, saves.list.some((x) => x.state === "pending")]);

  const r = route(loc.split("?")[0]!);
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
  const state: AppState = {
    session,
    me,
    project,
    features,
    assistant,
    version,
    go,
    help: openHelp,
    openTask,
    saves: saves.list,
    savesEnabled: saves.enabled,
    addSave: (x: Save) => setSaves((v) => ({ ...v, list: [x, ...v.list] })),
  };
  const actions = actionsFor(me, project, features).length;
  const nav: [string, string, number | null][] = [
    ["/", "Home", actions],
    ["/features", "Features", features.length],
  ];
  const current = r.page === "feature" || r.page === "features" ? "/features" : r.page === "home" ? "/" : "";
  const host = project.project.provider === "github" ? "GitHub" : "GitLab";

  return (
    <App.Provider value={state}>
      <div class="app" inert={help !== null || task !== null}>
        <header class="top">
          <div class="brand">
            <b>SDLC Hub</b>
            {session.demo && <span class="proto">Demo · fixture repository</span>}
            <span class="proj">
              {project.project.name} · <code>{`${project.project.namespace}/${project.project.repo}`}</code> <span class="tag">{host}</span>
            </span>
          </div>
          <div class="ctl">
            <span class="live" title={live ? "The site updates when the files change" : "Not connected to the local server"}>
              <i class={`dot${live ? "" : " off"}`} />
              {live ? "live: main and hub-state" : "reconnecting"}
            </span>
            <button type="button" class="btn sm guide" id="guidebtn" aria-current={r.page === "guide" ? "page" : undefined} onClick={() => go("/guide")}>
              <span class="q" aria-hidden="true">
                ?
              </span>{" "}
              Your guide
            </button>
            {session.demo && (
              <span class="protoctl">
                <span class="pk">Demo</span>
                <PersonPicker session={session} current={me.user} pick={(u) => setParam("as", u)} />
                <label for="asst">
                  assistant{" "}
                  <select id="asst" value={assistant} onChange={(e) => setParam("asst", e.currentTarget.value)}>
                    {ASSISTANTS.map(([a, n]) => (
                      <option key={a} value={a}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              </span>
            )}
          </div>
        </header>
        <div class="shell">
          <nav class="side" id="nav" aria-label="Screens">
            {nav.map(([path, label, n]) => (
              <a key={path} class="nb" data-page={path === "/" ? "home" : "features"} href={href(path)} aria-current={current === path ? "page" : undefined} onClick={(e) => (e.preventDefault(), go(path))}>
                <span>{label}</span>
                {n !== null && <span class="cnt">{n}</span>}
              </a>
            ))}
            <div class="grp">Admin{me.roles.includes("admin") ? "" : " · read only"}</div>
            <a class="nb" data-page="people" href={href("/people")} aria-current={r.page === "people" || r.page === "script" ? "page" : undefined} onClick={(e) => (e.preventDefault(), go("/people"))}>
              <span>People and roles</span>
            </a>
            <a class="nb" data-page="settings" href={href("/settings")} aria-current={r.page === "settings" ? "page" : undefined} onClick={(e) => (e.preventDefault(), go("/settings"))}>
              <span>Settings</span>
            </a>
          </nav>
          <main id="main">
            {r.page === "home" && <Home />}
            {r.page === "features" && <Features params={params} />}
            {r.page === "feature" && <Feature slug={r.slug} tab={r.tab} params={params} />}
            {r.page === "guide" && <Guide />}
            {r.page === "people" && <People />}
            {r.page === "settings" && <Settings />}
            {r.page === "script" && <SetupScript user={r.user} params={params} />}
            {r.page === "missing" && (
              <div class="lockbox">
                There is no page here. <a href={href("/")}>Go to Home</a>
              </div>
            )}
          </main>
        </div>
        <p class="muted">
          Signed in as {me.name} · {roleLabel(me)}. {saves.enabled ? "Your saves reach main through merge requests that merge by themselves when hub-guard passes." : "Read only: this checkout has no remote to save to."}
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
    <label for="persona">
      view as{" "}
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
