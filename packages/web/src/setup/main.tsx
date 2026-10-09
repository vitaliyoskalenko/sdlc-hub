// The first-install site: a start page, five screens and the install, after the setup prototype
// (prototypes/setup). Nothing is written before Install. GitHub stops on screen 1 in version 1.

import { Fragment, render } from "preact";
import { useEffect, useState } from "preact/hooks";
import "./setup.css";

type Kind = "backend" | "web" | "android" | "ios" | "desktop" | "other";
interface Answers {
  host: "gitlab" | "github";
  address: string;
  namespace: string;
  repoMode: "existing" | "new";
  repo: string;
  teams: { name: string; repo: string; kind: Kind }[];
  contract: number;
  project: string;
  tracker: { type: "none" | "jira"; url: string; key: string; mirror: boolean };
  links: { confluence: string; figma: string };
  assistants: { claude: true; codex: boolean; cursor: boolean };
  engine: "sdd" | "plain" | "custom";
  headless: boolean;
}
interface SignedIn {
  host: "gitlab" | "github";
  user: string;
  name: string;
  address: string;
  version: string | null;
  stored: boolean;
}
interface Check {
  id: string;
  ok: boolean;
  blocking: boolean;
  text: string;
}
interface Step {
  id: string;
  state: "running" | "ok" | "skip" | "man" | "fail";
  text: string;
  link?: string;
}
interface Result {
  ok: boolean;
  steps: Step[];
  left: string[];
}

const KINDS: [Kind, string][] = [["backend", "Backend / API"], ["web", "Web"], ["android", "Android"], ["ios", "iOS"], ["desktop", "Desktop"], ["other", "Other"]];
const PRESETS: [string, [string, string, Kind][], number][] = [
  ["Backend, Web, Android, iOS", [["Backend", "backend", "backend"], ["Web", "web-admin", "web"], ["Android", "android-app", "android"], ["iOS", "ios-app", "ios"]], 0],
  ["Backend and Web", [["Backend", "backend", "backend"], ["Web", "web-admin", "web"]], 0],
  ["One repository", [["Product", "app", "other"]], -1],
];
const SCREENS = ["Git host", "Repositories", "Project and tracker", "Assistants and engine", "Review and install"];
const HOSTS = {
  gitlab: { n: "GitLab", ns: "Group", nsl: "group", cr: "merge request", crs: "merge requests" },
  github: { n: "GitHub", ns: "Organization", nsl: "organization", cr: "pull request", crs: "pull requests" },
};

const DEFAULTS: Answers = {
  host: "gitlab",
  address: "gitlab.example.com",
  namespace: "shop",
  repoMode: "existing",
  repo: "product-specs",
  teams: PRESETS[0]![1].map(([name, repo, kind]) => ({ name, repo, kind })),
  contract: 0,
  project: "Marketplace",
  tracker: { type: "none", url: "", key: "", mirror: false },
  links: { confluence: "", figma: "" },
  assistants: { claude: true, codex: true, cursor: false },
  engine: "sdd",
  headless: false,
};

const hostUrl = (a: string) => (/^https?:\/\//.test(a) ? a.replace(/\/+$/, "") : `https://${a.replace(/\/+$/, "")}`);
const teamId = (n: string) => n.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "team";

async function api<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(`/api/setup${path}`, body === undefined ? { credentials: "same-origin" } : { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = (await r.json()) as T & { error?: string };
  if (!r.ok) throw new Error(data.error ?? `${r.status}`);
  return data;
}

/** What blocks a screen; the server checks the same before it writes anything. */
function problem(a: Answers, i: number, signed: SignedIn | null): string {
  const h = HOSTS[a.host];
  if (i === 0) {
    if (!a.address.trim()) return `Enter the ${h.n} address`;
    if (!signed) return "Sign in to continue";
  }
  if (i === 1) {
    if (!a.namespace.trim()) return `Enter the ${h.nsl}`;
    if (!a.repo.trim()) return "Name the specifications repository";
    if (!a.teams.length) return "Add at least one team repository";
    if (a.teams.some((t) => !t.name.trim() || !t.repo.trim())) return "Every team needs a name and a repository";
    const rs = a.teams.map((t) => t.repo.trim().toLowerCase());
    if (rs.includes(a.repo.trim().toLowerCase())) return "A team repository cannot be the specifications repository";
    if (new Set(rs).size < rs.length) return "Two rows use the same repository";
    if (new Set(a.teams.map((t) => teamId(t.name))).size < a.teams.length) return "Two teams have the same name";
  }
  if (i === 2) {
    if (!a.project.trim()) return "Enter the project name";
    if (a.tracker.type === "jira" && (!a.tracker.url.trim() || !a.tracker.key.trim())) return "Jira needs an address and a project key";
  }
  return "";
}

function summary(a: Answers, i: number, signed: SignedIn | null): string {
  if (i === 0) return signed ? `${HOSTS[a.host].n} · ${a.address}` : "";
  if (i === 1) return `${a.namespace}/${a.repo} + ${a.teams.length} team ${a.teams.length === 1 ? "repository" : "repositories"}`;
  if (i === 2) return `${a.project} · ${a.tracker.type === "jira" ? `Jira ${a.tracker.key}` : "no tracker"}`;
  if (i === 3) return ["Claude Code", ...(a.assistants.codex ? ["Codex"] : []), ...(a.assistants.cursor ? ["Cursor"] : [])].join(", ");
  return "";
}

function Field(props: { label: string; value: string; set: (v: string) => void; hint?: preact.ComponentChildren; placeholder?: string; id: string }) {
  return (
    <label class="fld">
      <span>{props.label}</span>
      <input type="text" id={props.id} value={props.value} placeholder={props.placeholder} autocomplete="off" spellcheck={false} onInput={(e) => props.set(e.currentTarget.value)} />
      {props.hint && <small>{props.hint}</small>}
    </label>
  );
}

function Choice<T extends string>(props: { group: string; value: T; current: T; title: string; sub: string; set: (v: T) => void }) {
  return (
    <button type="button" class="choice" id={`c-${props.group}-${props.value}`} aria-pressed={props.current === props.value} onClick={() => props.set(props.value)}>
      <b>{props.title}</b>
      <span>{props.sub}</span>
    </button>
  );
}

function Setup() {
  const [step, setStep] = useState(-1);
  const [max, setMax] = useState(0);
  const [a, setA] = useState<Answers>(DEFAULTS);
  const [signed, setSigned] = useState<SignedIn | null>(null);
  const [token, setToken] = useState("");
  const [signErr, setSignErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [checks, setChecks] = useState<{ checks: Check[]; ok: boolean } | null>(null);
  const [checkErr, setCheckErr] = useState("");
  const [files, setFiles] = useState<Record<string, string> | null>(null);
  const [log, setLog] = useState<Step[] | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [failure, setFailure] = useState("");
  const set = (patch: Partial<Answers>) => setA((x) => ({ ...x, ...patch }));
  const h = HOSTS[a.host];

  useEffect(() => {
    api<{ signedIn: SignedIn | null; result: Result | null; running: boolean }>("/state").then((s) => {
      if (s.signedIn) {
        setSigned(s.signedIn);
        set({ host: s.signedIn.host, address: s.signedIn.address });
      }
    }, () => undefined);
  }, []);

  // Install progress arrives as events.
  useEffect(() => {
    const es = new EventSource("/api/setup/events");
    es.addEventListener("step", (e) => {
      const s = JSON.parse((e as MessageEvent).data) as Step;
      setLog((l) => {
        const rest = (l ?? []).filter((x) => x.id !== s.id);
        return [...rest, s];
      });
    });
    es.addEventListener("done", (e) => setResult(JSON.parse((e as MessageEvent).data) as Result));
    es.addEventListener("failed", (e) => setFailure((JSON.parse((e as MessageEvent).data) as { error: string }).error));
    return () => es.close();
  }, []);

  // The review screen runs the real checks against the host and shows the files Install writes.
  useEffect(() => {
    if (step !== 4) return;
    setChecks(null);
    setCheckErr("");
    api<{ checks: Check[]; ok: boolean }>("/check", { answers: a }).then(setChecks, (e: Error) => setCheckErr(e.message));
    api<Record<string, string>>("/preview", { answers: a }).then(setFiles, () => setFiles(null));
  }, [step]);

  const go = (i: number) => {
    setStep(i);
    setMax((m) => Math.max(m, i));
    scrollTo(0, 0);
  };
  const firstBad = [0, 1, 2, 3].find((i) => problem(a, i, signed)) ?? -1;

  const signIn = async () => {
    setBusy(true);
    setSignErr("");
    try {
      setSigned(await api<SignedIn>("/signin", { host: a.host, address: a.address, token }));
      setToken("");
    } catch (e) {
      setSignErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const startInstall = async () => {
    setLog([]);
    setResult(null);
    setFailure("");
    try {
      await api("/install", { answers: a });
    } catch (e) {
      setFailure((e as Error).message);
    }
  };

  if (log !== null) return <Install a={a} log={log} result={result} failure={failure} again={() => (setLog(null), setResult(null), go(4))} />;
  if (step < 0) return <Start begin={() => go(0)} />;

  const pr = step < 4 ? problem(a, step, signed) : firstBad >= 0 ? `Screen ${firstBad + 1} is not complete: ${problem(a, firstBad, signed).toLowerCase()}` : !checks ? "Checking…" : !checks.ok ? "A check did not pass" : "";
  const tokenUrl =
    a.host === "github"
      ? `${hostUrl(a.address || "github.com")}/settings/personal-access-tokens/new`
      : `${hostUrl(a.address || "gitlab.example.com")}/-/user_settings/personal_access_tokens?name=SDLC%20Hub%20setup&scopes=api`;

  const screens = [
    // 1 · Git host
    <>
      <div>
        <span class="k">Screen 1 of 5</span>
        <h2>Where does your code live?</h2>
      </div>
      <div class="choices">
        <Choice group="host" value="gitlab" current={a.host} title="GitLab" sub="GitLab.com or your own server" set={(v) => set({ host: v, address: "gitlab.example.com" })} />
        <Choice group="host" value="github" current={a.host} title="GitHub" sub="GitHub.com or Enterprise Server" set={(v) => set({ host: v, address: "github.com" })} />
      </div>
      <Field id="f-address" label={`${h.n} address`} value={a.address} set={(v) => (set({ address: v }), setSigned(null))} hint={a.host === "github" ? "github.com, or the address of your GitHub Enterprise Server" : "gitlab.com, or the address of your own server, such as gitlab.example.com"} />
      <div class="sec">
        <h3>Sign in</h3>
        {signed ? (
          <div class="signed">
            <div class="row sp">
              <b>Signed in as {signed.user}</b>
              <button type="button" class="btn sm" onClick={() => void api("/signout", {}).then(() => setSigned(null))}>
                Sign out
              </button>
            </div>
            <div class="row">
              {signed.version && <span class="pill ok">GitLab {signed.version}</span>}
              <span class={`pill ${signed.stored ? "ok" : "warn"}`}>{signed.stored ? "token kept in your system keychain" : "token kept in memory only"}</span>
            </div>
            {a.host === "github" ? (
              <p class="muted">Rulesets, a required check and auto-merge do the work of the guard. With private repositories they need GitHub Team; the review screen checks your plan.</p>
            ) : (
              <p class="muted">The Free tier has no Code Owners or approval rules; the hub-guard job does that work instead.</p>
            )}
          </div>
        ) : (
          <div class="signin">
            {a.host === "github" ? (
              <>
                <p>
                  Setup needs a fine-grained personal access token of an owner of the organization. Set the resource owner to the organization and allow all repositories. It stays in your system keychain and in this setup's memory. It is never written to the repository or to anyone's setup script.
                </p>
                <ul class="perms" id="github-perms">
                  <li>
                    Repository: <code>Administration</code>, <code>Contents</code>, <code>Pull requests</code>, <code>Workflows</code> and <code>Secrets</code>, read and write
                  </li>
                  <li>
                    Organization: <code>Members</code> read; <code>Administration</code> read and write
                  </li>
                </ul>
              </>
            ) : (
              <p>
                Setup needs a personal access token of an Owner of the group, with the <code>api</code> scope. It stays in your system keychain and in this setup's memory. It is never written to the repository or to anyone's setup script.
              </p>
            )}
            <p>
              <a href={tokenUrl} target="_blank" rel="noopener noreferrer">
                Create a token on {a.address || h.n} ↗
              </a>{" "}
              <span class="muted">{a.host === "github" ? "(choose the permissions above)" : "(name and scope are filled in)"}</span>
            </p>
            <label class="fld">
              <span>Personal access token</span>
              <input type="password" id="f-token" value={token} autocomplete="off" onInput={(e) => setToken(e.currentTarget.value)} />
            </label>
            <div class="row">
              <button type="button" class="btn pri" id="b-signin" disabled={!a.address.trim() || !token.trim() || busy} onClick={() => void signIn()}>
                {busy ? "Signing in…" : "Sign in"}
              </button>
              {signErr && <span class="err">{signErr}</span>}
            </div>
          </div>
        )}
      </div>
    </>,
    // 2 · Repositories
    <>
      <div>
        <span class="k">Screen 2 of 5</span>
        <h2>Which repositories does the hub work with?</h2>
      </div>
      <div class="sec">
        <div class="g2">
          <Field id="f-ns" label={h.ns} value={a.namespace} set={(v) => set({ namespace: v })} />
          <div />
        </div>
      </div>
      <div class="sec">
        <h3>Repository for specifications and the hub</h3>
        <p class="muted">The hub is copied into this repository, so one clone has the documents, the rules and the site.</p>
        <div class="choices">
          <Choice group="repoMode" value="existing" current={a.repoMode} title="Use an existing repository" sub="Its files stay as they are" set={(v) => set({ repoMode: v })} />
          <Choice group="repoMode" value="new" current={a.repoMode} title="Create a new repository" sub="Private" set={(v) => set({ repoMode: v })} />
        </div>
        <label class="fld">
          <span>Repository name</span>
          <div class="pre">
            <i>{a.namespace.trim() || h.nsl}/</i>
            <input type="text" id="f-repo" value={a.repo} autocomplete="off" spellcheck={false} onInput={(e) => set({ repo: e.currentTarget.value })} />
          </div>
        </label>
      </div>
      <div class="sec">
        <div class="row sp">
          <h3>Team repositories</h3>
          <span class="muted">{a.teams.length} added</span>
        </div>
        <p class="muted">One row per team that writes code. The hub reads tasks, {h.crs}, CI results and test runs from each.</p>
        <div class="teams">
          <div class="trow head">
            <span class="k">Team</span>
            <span class="k">Repository</span>
            <span class="k">Kind</span>
            <span />
          </div>
          {a.teams.map((t, i) => {
            const upd = (patch: Partial<Answers["teams"][number]>) => set({ teams: a.teams.map((x, k) => (k === i ? { ...x, ...patch } : x)) });
            return (
              <div class="trow" key={i}>
                <label class="c-name">
                  <span class="tl">Team</span>
                  <input type="text" id={`f-t${i}-name`} value={t.name} placeholder="Team name" autocomplete="off" onInput={(e) => upd({ name: e.currentTarget.value })} />
                </label>
                <label class="c-repo">
                  <span class="tl">Repository</span>
                  <span class="pre">
                    <i>{a.namespace.trim() || h.nsl}/</i>
                    <input type="text" id={`f-t${i}-repo`} value={t.repo} placeholder="repository" autocomplete="off" spellcheck={false} onInput={(e) => upd({ repo: e.currentTarget.value })} />
                  </span>
                </label>
                <label class="c-kind">
                  <span class="tl">Kind</span>
                  <select id={`f-t${i}-kind`} value={t.kind} onChange={(e) => upd({ kind: e.currentTarget.value as Kind })}>
                    {KINDS.map(([k, n]) => (
                      <option key={k} value={k}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  class="x"
                  aria-label={`Remove ${t.name || "team"}`}
                  disabled={a.teams.length < 2}
                  onClick={() => set({ teams: a.teams.filter((_, k) => k !== i), contract: a.contract === i ? -1 : a.contract > i ? a.contract - 1 : a.contract })}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
        <div class="row">
          <button type="button" class="btn" onClick={() => set({ teams: [...a.teams, { name: "", repo: "", kind: "other" }] })}>
            + Add a repository
          </button>
          <span class="muted">or start from:</span>
          {PRESETS.map(([label, rows, contract], i) => (
            <button type="button" key={i} class="btn sm" onClick={() => set({ teams: rows.map(([name, repo, kind]) => ({ name, repo, kind })), contract })}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div class="sec">
        <label class="fld">
          <span>Team that publishes the API contract</span>
          <select id="f-contract" value={String(a.contract)} onChange={(e) => set({ contract: Number(e.currentTarget.value) })}>
            {a.teams.map((t, i) => (
              <option key={i} value={String(i)}>
                {t.name || `Team ${i + 1}`}
              </option>
            ))}
            <option value="-1">No shared contract</option>
          </select>
          <small>On a complex feature the other teams wait for this team's contract before they start. Choose "No shared contract" if no team depends on another.</small>
        </label>
      </div>
    </>,
    // 3 · Project and tracker
    <>
      <div>
        <span class="k">Screen 3 of 5</span>
        <h2>Project and issue tracker</h2>
      </div>
      <div class="sec">
        <div class="g2">
          <Field id="f-proj" label="Project name" value={a.project} set={(v) => set({ project: v })} hint="Shown at the top of the hub" />
          <div />
        </div>
      </div>
      <div class="sec">
        <h3>Issue tracker</h3>
        <p class="muted">The hub keeps tasks and bugs as files in the repository either way. A tracker only adds links.</p>
        <div class="choices">
          <Choice group="tracker" value="none" current={a.tracker.type} title="No tracker" sub="Tasks and bugs live in the repository only" set={(v) => set({ tracker: { ...a.tracker, type: v } })} />
          <Choice group="tracker" value="jira" current={a.tracker.type} title="Jira" sub="Features and bugs link to Jira issues" set={(v) => set({ tracker: { ...a.tracker, type: v } })} />
        </div>
        {a.tracker.type === "jira" ? (
          <>
            <div class="g2">
              <Field id="f-jira-url" label="Jira address" value={a.tracker.url} set={(v) => set({ tracker: { ...a.tracker, url: v } })} placeholder="https://jira.example.com" />
              <Field id="f-jira-key" label="Project key" value={a.tracker.key} set={(v) => set({ tracker: { ...a.tracker, key: v } })} hint={a.tracker.key.trim() ? `Issues look like ${a.tracker.key.trim()}-412` : ""} />
            </div>
            <label class="check">
              <input type="checkbox" id="f-mirror" checked={a.tracker.mirror} onChange={(e) => set({ tracker: { ...a.tracker, mirror: e.currentTarget.checked } })} />
              <div>
                <b>Copy new bugs to Jira</b>
                <span>One way, from the hub to Jira. The repository stays the source of truth.</span>
              </div>
            </label>
          </>
        ) : (
          <p class="hint">Nothing to connect. The hub then shows no tracker links. You can add Jira later in Settings.</p>
        )}
      </div>
      <div class="sec">
        <h3>
          Links <span class="muted">· optional</span>
        </h3>
        <p class="muted">Shown as buttons on every feature. The hub only opens these addresses.</p>
        <div class="g2">
          <Field id="f-conf" label="Confluence space" value={a.links.confluence} set={(v) => set({ links: { ...a.links, confluence: v } })} placeholder="https://confluence.example.com/display/SHOP" />
          <Field id="f-figma" label="Figma project" value={a.links.figma} set={(v) => set({ links: { ...a.links, figma: v } })} placeholder="https://www.figma.com/files/project/…" />
        </div>
      </div>
    </>,
    // 4 · Assistants and engine
    <>
      <div>
        <span class="k">Screen 4 of 5</span>
        <h2>Assistants and engine</h2>
      </div>
      <div class="sec">
        <h3>Assistants people may use</h3>
        <p class="muted">Every person picks one when you add them. The hub commands for each arrive with the plugin, in phase 2.</p>
        {(
          [
            ["claude", "Claude Code", "Always on. Writes the hub section of CLAUDE.md", true],
            ["codex", "Codex", "Writes the hub section of AGENTS.md", false],
            ["cursor", "Cursor", "Writes the hub section of AGENTS.md", false],
          ] as const
        ).map(([k, t, s, dis]) => (
          <label class="check" key={k}>
            <input type="checkbox" id={`f-a-${k}`} checked={a.assistants[k]} disabled={dis} onChange={(e) => set({ assistants: { ...a.assistants, [k]: e.currentTarget.checked } as Answers["assistants"] })} />
            <div>
              <b>{t}</b>
              <span>{s}</span>
            </div>
          </label>
        ))}
      </div>
      <div class="sec">
        <h3>Engine that runs the stages</h3>
        <div class="choices">
          <Choice group="engine" value="sdd" current={a.engine} title="genkovich/sdd" sub="Default. Version 2.3.x is pinned" set={(v) => set({ engine: v })} />
          <Choice group="engine" value="plain" current={a.engine} title="Plain" sub="Ships with the hub: one prompt file per stage, no engine plugin" set={(v) => set({ engine: v })} />
          <Choice group="engine" value="custom" current={a.engine} title="Custom adapter" sub="You map each hub step to your own command" set={(v) => set({ engine: v })} />
        </div>
        <p class="hint">
          {a.engine === "sdd" ? (
            <>
              The hub passes every stage to the engine through <code>.hub/engines/sdd.yaml</code>, so it can be swapped later.
            </>
          ) : a.engine === "plain" ? (
            <>
              Setup writes <code>.hub/engines/plain.yaml</code> and one prompt per stage in <code>.hub/engines/plain/</code>. The hub's own stage command runs them in any assistant.
            </>
          ) : (
            <>
              Setup writes a template to <code>.hub/engines/custom.yaml</code>. You fill in one command per stage before the first feature.
            </>
          )}
        </p>
      </div>
      <div class="sec">
        <h3>Starting the assistant from the site</h3>
        <label class="check">
          <input type="checkbox" id="f-headless" checked={a.headless} onChange={(e) => set({ headless: e.currentTarget.checked })} />
          <div>
            <b>Allow Run and Validate buttons</b>
            <span>Off by default: people copy the prompt into their assistant. When on, runs use each person's own seat.</span>
          </div>
        </label>
      </div>
    </>,
    // 5 · Review and install
    <>
      <div>
        <span class="k">Screen 5 of 5</span>
        <h2>Review and install</h2>
      </div>
      <p class="lead">Nothing has been written yet. Check the answers, then install.</p>
      <div class="kv">
        {(
          [
            ["Git host", `${h.n} · ${a.address}${signed ? ` · signed in as ${signed.user}` : ""}`, 0],
            ["Specifications", `${a.namespace}/${a.repo}${a.repoMode === "new" ? " · new" : ""}`, 1],
            ["Team repositories", a.teams.map((t, i) => `${t.name} (${t.repo})${a.contract === i ? " · API contract" : ""}`).join(", "), 1],
            ["Project", a.project, 2],
            ["Issue tracker", a.tracker.type === "jira" ? `Jira · ${a.tracker.key}${a.tracker.mirror ? " · bugs copied" : ""}` : "None", 2],
            ["Assistants", summary(a, 3, signed), 3],
            ["Engine", a.engine === "sdd" ? "genkovich/sdd" : "Custom adapter", 3],
            ["Run from the site", a.headless ? "Allowed" : "Off", 3],
            ["Admin", signed ? `${signed.user} (you)` : "", 0],
          ] as const
        ).map(([k, v, i]) => (
          <Fragment key={k}>
            <span class="k">{k}</span>
            <span>{v}</span>
            <button type="button" class="btn ghost sm" onClick={() => go(i)}>
              Edit
            </button>
          </Fragment>
        ))}
      </div>
      <div class="sec">
        <h3>Checks on {a.address}</h3>
        {checkErr ? (
          <p class="err">{checkErr}</p>
        ) : !checks ? (
          <p class="muted">Checking your rights, the repositories and the runners…</p>
        ) : (
          <ul class="checks" id="checks">
            {checks.checks.map((c) => (
              <li key={c.id} data-check={c.id}>
                <span class={`pill ${c.ok ? "ok" : c.blocking ? "bad" : "warn"}`}>{c.ok ? "ok" : c.blocking ? "blocks install" : "note"}</span>
                <span>{c.text}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div class="sec">
        <h3>What Install does</h3>
        <ul>
          <li>
            Writes <code>.hub/</code>, the hub (<code>hub/cli.js</code>), the hub plugin for Claude Code (<code>hub/plugin/</code>, enabled in <code>.claude/settings.json</code>) and the hub sections of <code>CLAUDE.md</code> to <code>{`${a.namespace}/${a.repo}`}</code> in one commit, and turns forking of it off.
          </li>
          <li>
            Creates the branch <code>hub-state</code> and stores a token for hub-report as the masked group variable <code>HUB_STATE_TOKEN</code>.
          </li>
          <li>
            Opens {a.teams.length === 1 ? `one ${h.cr} in the team repository` : `${a.teams.length} ${h.crs}, one in each team repository`} that adds the hub-report job. Nothing else changes there.
          </li>
          <li>
            Creates the project <code>{`${a.namespace}/hub-ci`}</code> with the hub-guard job and points the CI configuration of <code>{a.repo}</code> at it, so a {h.cr} cannot remove the guard. Stores a read-only token for it as <code>HUB_GUARD_TOKEN</code>.
          </li>
          <li>
            Turns on "Pipelines must succeed" and protects <code>main</code>: no one pushes to it, and every change arrives through a {h.cr} that merges itself when hub-guard passes. Run setup again later the same way.
          </li>
        </ul>
        {files && (
          <details class="more">
            <summary>The files it writes in .hub/</summary>
            <div>
              {Object.entries(files).map(([p, t]) => (
                <pre key={p}>{`# ${p}\n${t}`}</pre>
              ))}
            </div>
          </details>
        )}
      </div>
    </>,
  ];

  return (
    <Shell>
      <div class="wiz">
        <nav class="rail" aria-label="Setup screens">
          {SCREENS.map((s, k) => {
            const lock = k > max || (firstBad >= 0 && k > firstBad);
            const done = k < max && !problem(a, k, signed);
            return (
              <button type="button" key={k} class={`st${done ? " done" : ""}`} id={`rail-${k}`} aria-current={k === step ? "step" : undefined} disabled={lock} onClick={() => go(k)}>
                <span class="n">{done && k !== step ? "✓" : k + 1}</span>
                <span class="t">{s}</span>
                <span class="v">{k <= max && k !== 4 ? summary(a, k, signed) : ""}</span>
              </button>
            );
          })}
        </nav>
        <div class="pane">
          <div class="card">{screens[step]}</div>
          <div class="foot">
            <button type="button" class="btn" id="b-back" onClick={() => (step ? go(step - 1) : setStep(-1))}>
              {step ? "Back" : "Back to start"}
            </button>
            {step < 4 ? (
              <button type="button" class="btn pri" id="b-next" disabled={!!pr} onClick={() => go(step + 1)}>
                Next
              </button>
            ) : (
              <button type="button" class="btn pri" id="b-install" disabled={!!pr} onClick={() => void startInstall()}>
                Install
              </button>
            )}
            {pr && <span class="why">{pr}</span>}
          </div>
        </div>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: preact.ComponentChildren }) {
  return (
    <div class="app">
      <header class="top">
        <div class="brand">
          <b>SDLC Hub</b>
          <span>Setup</span>
        </div>
        <span class="addr">
          <i class="dot" />
          {location.origin}/setup
        </span>
      </header>
      <main id="main">{children}</main>
    </div>
  );
}

function Start({ begin }: { begin: () => void }) {
  return (
    <Shell>
      <div class="start">
        <div class="card">
          <div>
            <span class="k">First install · once per project</span>
            <h1>Set up SDLC Hub for your project</h1>
          </div>
          <p class="lead">Everything happens on this page, in five screens. The terminal asks nothing. Nothing is written until you press Install on the last one.</p>
          <ol class="how">
            <li>
              <h3>Git host and sign-in</h3>
              <p class="muted">GitLab, and a personal access token of an Owner of the group.</p>
            </li>
            <li>
              <h3>Repositories, project, assistants</h3>
              <p class="muted">The specifications repository, each team's repository, the tracker and the engine.</p>
            </li>
            <li>
              <h3>Review, checks and Install</h3>
              <p class="muted">Setup checks your rights, the repositories and the runners before it writes anything.</p>
            </li>
          </ol>
          <div class="row">
            <button type="button" class="btn pri" id="b-begin" onClick={begin}>
              Start setup
            </button>
            <span class="muted">About five minutes</span>
          </div>
        </div>
        <div class="card">
          <h3>Have this ready</h3>
          <ul>
            <li>Owner rights on the GitLab group, and a personal access token with the api scope.</li>
            <li>git and Node.js 22 or newer on your machine.</li>
            <li>The name of the repository for specifications, and of each team's repository.</li>
            <li>Optional: your Jira address and project key, and links to Confluence and Figma.</li>
          </ul>
          <div class="sec">
            <h3>Who you become</h3>
            <p class="muted">The person who runs setup is the hub's admin. After it you add people, give them roles and send each one a setup script.</p>
          </div>
        </div>
      </div>
    </Shell>
  );
}

function Install({ a, log, result, failure, again }: { a: Answers; log: Step[]; result: Result | null; failure: string; again: () => void }) {
  const total = 4 + a.teams.length + (a.repoMode === "new" ? 1 : 0);
  const done = log.filter((s) => s.state !== "running").length;
  const fin = !!result || !!failure;
  const ok = result?.ok && !failure;
  const mark = { ok: "✓", skip: "✓", man: "!", fail: "✗", running: "…" } as const;
  return (
    <Shell>
      <div class="card">
        <div class="row sp">
          <div>
            <span class="k">{fin ? "Finished" : "Installing"}</span>
            <h2>{ok ? `SDLC Hub is installed in ${a.namespace}/${a.repo}` : fin ? "Install stopped" : "Installing SDLC Hub"}</h2>
          </div>
          {fin ? <span class={`pill ${ok ? "ok" : "bad"}`}>{ok ? "installed" : "not finished"}</span> : <span class="muted" id="inst-n">{`${done} of ${total}`}</span>}
        </div>
        <div class="bar">
          <i style={{ width: `${Math.min(100, Math.round((done / total) * 100))}%` }} />
        </div>
        <div class="log" role="log" aria-live="polite" id="log">
          {log.map((s) => (
            <div class={`l ${s.state === "fail" ? "fail" : s.state === "running" ? "run" : "ok"}`} key={s.id}>
              <i>{mark[s.state]}</i>
              <span>
                {s.text}
                {s.state === "skip" ? " (already done)" : ""}
                {s.link && (
                  <>
                    {" · "}
                    <a href={s.link} target="_blank" rel="noopener noreferrer">
                      open ↗
                    </a>
                  </>
                )}
              </span>
            </div>
          ))}
        </div>
        {failure && <p class="err">{failure}</p>}
        {fin && (
          <>
            {result && result.left.length > 0 && (
              <div class="sec">
                <h3>Left for people</h3>
                <p class="muted">Setup could not or should not do {result.left.length === 1 ? "this" : "these"} itself.</p>
                <ul class="todo" id="left">
                  {result.left.map((x) => (
                    <li key={x}>
                      <span class="pill warn">to do</span>
                      <span>{x}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div class="sec">
              <h3>{ok ? "What you do next" : "What you can do"}</h3>
              {ok ? (
                <ol>
                  <li>
                    Clone <code>{`${a.namespace}/${a.repo}`}</code> and run <code>node hub/cli.js serve</code> in it. You are its admin.
                  </li>
                  <li>Add people with a role and a team in .hub/roles.yaml; People and roles on the site arrives in phase 2.</li>
                </ol>
              ) : (
                <p>Fix what the log names, then run setup again: it continues from the first step that did not finish.</p>
              )}
              <div class="row">
                <button type="button" class="btn" id="b-again" onClick={again}>
                  Run setup again
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </Shell>
  );
}

render(<Setup />, document.getElementById("root")!);
