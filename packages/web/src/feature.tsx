// One feature: the Now strip and the Flow, Documents and Tasks tabs.

import { Fragment } from "preact";
import { useEffect, useState } from "preact/hooks";
import { api, type FeatureDetail, type FlowStep, type StepState, type Summary } from "./api.ts";
import { layout, Loop } from "./features.tsx";
import { engineCmd, hubCmd, LEGEND, roleOf, STATUS, STEP } from "./text.ts";
import { Costs } from "./costs.tsx";
import { frontMatter, renderMarkdown } from "./markdown.ts";
import { QA } from "./qa.tsx";
import { ValidateCard } from "./validate.tsx";
import { Release } from "./release.tsx";
import { PendingList, SignoffBox, useAction, usePending } from "./saves.tsx";
import { Cmd, CopyButton, jiraKey, Link, names, Pill, personName, RoleChip, StatusPill, teamName, useApp, waitText } from "./ui.tsx";


/** Steps recorded on the QA or Release screen. */
const SCREEN: Record<string, [string, string]> = {
  staging: ["release", "Open Release"],
  verify: ["qa", "Open QA"],
  autotests: ["qa", "Open QA"],
  "qa-final": ["qa", "Open QA"],
  accept: ["release", "Open Release"],
  release: ["release", "Open Release"],
};

const TABS: [string, string][] = [
  ["flow", "Flow"],
  ["documents", "Documents"],
  ["tasks", "Tasks"],
  ["qa", "QA"],
  ["release", "Release"],
  ["costs", "Costs"],
];

const SOURCE: Record<string, string> = { specs: "main of product-specs", "hub-state": "the hub-state branch", "local-clone": "your local copy of the team repository" };

const GATE_BY: Record<string, string> = {
  role: "",
  "team-leads": "each team lead",
  "other-team-leads": "the lead of every other team",
  "contract-lead": "the contract team's lead",
};

export function Feature({ slug, tab, params }: { slug: string; tab: string; params: URLSearchParams }) {
  const { version, features, go, project, me, seen } = useApp();
  const [editing, setEditing] = useState(false);
  // Opening a feature takes what changed in it as seen.
  const changed = seen.changed(slug);
  useEffect(() => {
    if (changed) seen.mark(slug);
  }, [slug, changed]);
  // Hooks before the early returns below.
  const detailsPending = usePending(slug, "details");
  const [d, setD] = useState<FeatureDetail | null | "missing">(null);
  useEffect(() => {
    let live = true;
    api.feature(slug).then((x) => live && setD(x), () => live && setD("missing"));
    return () => {
      live = false;
    };
  }, [slug, version]);

  if (d === "missing")
    return (
      <div class="lockbox">
        There is no feature <code>{slug}</code>. <Link to="/features">See all features</Link>
      </div>
    );
  if (!d) return <p class="muted">Loading {slug}…</p>;

  const { state, summary: f, feature } = d;
  const links = feature?.links ?? {};
  const waiting = state.waits.filter((w) => !w.done).length;
  const stale = d.documents.filter((x) => x.signoff === "stale").length;
  const notes = [...state.warnings, ...state.issues.map((i) => `${i.file}${i.line ? `:${i.line}` : ""}: ${i.message}`)];
  return (
    <>
      <div class="fhead">
        <nav class="crumb" aria-label="Breadcrumb">
          <Link to="/features">Features</Link>
          <span aria-hidden="true">›</span>
          <select id="featsel" aria-label="Feature" value={slug} onChange={(e) => go(`/features/${e.currentTarget.value}${tab === "flow" ? "" : `/${tab}`}`)}>
            {features.map((x) => (
              <option key={x.slug} value={x.slug}>
                {x.title}
              </option>
            ))}
          </select>
        </nav>
        <div class="ph">
          <div>
            <h1>{f.title}</h1>
            <p class="sub">
              <code>{slug}</code> · size {f.size ?? "not set"} · route {f.route}
              {f.routeDefaulted ? " (no .route: counts as standard)" : ""} · owner {feature ? personName(project, feature.owner) : "unknown"} · {f.progress}% done
              {feature?.ui === false ? " · no user interface" : ""}
            </p>
          </div>
          <div class="row">
            {(
              [
                [links.jira ? (jiraKey(links.jira) ?? "Jira") : "Jira", links.jira],
                ["Confluence", links.confluence],
                ["Figma", links.figma],
                ["Staging", links.staging],
              ] as const
            ).map(([label, url]) =>
              url ? (
                <a key={label} class="btn sm" href={url} title={url} target="_blank" rel="noopener noreferrer">
                  {label} ↗
                </a>
              ) : null,
            )}
            {(me.roles.includes("pm") || me.roles.includes("admin")) && !editing && (
              <button type="button" class="btn sm" id="edit-details" onClick={() => setEditing(true)}>
                Edit details
              </button>
            )}
          </div>
        </div>
        {editing && <DetailsForm slug={slug} title={f.title} links={links} teams={feature?.teams ?? {}} ui={feature?.ui !== false} jira={project.tracker.type === "jira" ? project.tracker : undefined} close={() => setEditing(false)} />}
        <PendingList saves={detailsPending} />
        <NowStrip f={f} detail={d} tab={tab} />
        {notes.length > 0 && (
          <details class="more notes">
            <summary>
              {notes.length} note{notes.length === 1 ? "" : "s"} from detection
            </summary>
            <div>
              {notes.map((n, i) => (
                <p class="note warn" key={i}>
                  {n}
                </p>
              ))}
            </div>
          </details>
        )}
        <div class="tabs" role="tablist">
          {TABS.map(([id, label]) => (
            <button key={id} type="button" class="tab" role="tab" data-ftab={id} aria-selected={tab === id} onClick={() => go(`/features/${slug}${id === "flow" ? "" : `/${id}`}`)}>
              {label}
              {id === "tasks" && waiting > 0 && (
                <span class="cnt" title={`${waiting} tasks waiting for another team`}>
                  {waiting}
                </span>
              )}
              {id === "documents" && stale > 0 && (
                <span class="cnt" title={`${stale} documents changed since sign-off`}>
                  {stale}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
      {tab === "documents" ? (
        <Documents slug={slug} detail={d} params={params} />
      ) : tab === "tasks" ? (
        <Tasks detail={d} params={params} />
      ) : tab === "qa" ? (
        <QA detail={d} />
      ) : tab === "release" ? (
        <Release detail={d} />
      ) : tab === "costs" ? (
        <Costs detail={d} />
      ) : (
        <Flow detail={d} params={params} />
      )}
    </>
  );
}

function NowStrip({ f, detail, tab }: { f: Summary; detail: FeatureDetail; tab: string }) {
  const { me, project, go } = useApp();
  if (f.released)
    return (
      <div class="now">
        <div class="now-m">
          <span class="k">Now</span>
          <span class="row">
            <Pill kind="ok">Released</Pill>
            <span>Nothing is waiting.</span>
          </span>
        </div>
      </div>
    );
  if (f.watchUntil)
    return (
      <div class="now" id="now-watch">
        <div class="now-m">
          <span class="k">Now</span>
          <span class="row">
            <Pill kind="info">Watching</Pill>
            <span>Rolled out to everyone. Ops watches it until {f.watchUntil}; then it counts as released.</span>
          </span>
        </div>
        <span class="muted">Nothing for you to do here now</span>
      </div>
    );
  const steps = project.flow.steps;
  const i = steps.findIndex((s) => s.id === f.current);
  const next = steps.slice(i + 1).find((s, k) => detail.state.steps[i + 1 + k]?.status !== "skipped");
  const role = f.role ?? steps[i]?.role ?? "";
  const mine = f.waitingOn.includes(me.user) || me.roles.includes(role);
  const lead = f.status === "signoff" ? "Waiting for the sign-off of " : f.status === "returned" ? "Returned to " : "With ";
  const who = f.waitingOn.length ? names(project, f.waitingOn) : f.by ? names(project, [f.by]) : "";
  return (
    <div class={`now${mine ? " mine" : ""}`}>
      <div class="now-m">
        <span class="k">Now</span>
        <span class="row">
          <RoleChip role={role} />
          <b>
            step {i + 1} of {steps.length} · {f.current}
          </b>
          <StatusPill status={f.status} />
        </span>
        <span class="muted">
          {lead}
          {roleOf(role).n}
          {who ? ` (${who})` : ""}
          {f.reason ? ` · ${f.reason}` : ""}
          {next ? ` · then step ${steps.indexOf(next) + 1}, ${next.id}` : ""}
        </span>
        {f.crossWaits.map((w) => (
          <span key={w.on} class="waitline">
            {waitText(project, w)}
          </span>
        ))}
      </div>
      <div class="row">
        {mine ? (
          <>
            <b>Your move</b>
            {tab !== "flow" && (
              <button type="button" class="btn pri sm" onClick={() => go(`/features/${f.slug}`, { step: f.current })}>
                Open the step
              </button>
            )}
          </>
        ) : (
          <span class="muted">Nothing for you to do here now</span>
        )}
      </div>
    </div>
  );
}

// --- Flow

function FlowMap({ detail, selected, pick }: { detail: FeatureDetail; selected: string; pick: (id: string) => void }) {
  const { project } = useApp();
  const steps = project.flow.steps;
  const lanes = project.flow.lanes;
  const W = 540, rowH = 30, top = 26, numW = 20;
  const laneW = (W - numW - 6) / lanes.length;
  const H = top + steps.length * rowH + 8;
  const P = layout(steps, lanes, numW, laneW, top, rowH);
  const status = (id: string) => detail.state.steps.find((s) => s.id === id)?.status ?? "todo";
  const flowed = ["done", "running", "signoff", "blocked", "ready", "returned"];
  return (
    <svg class="flow" viewBox={`0 0 ${W} ${H}`} role="group" aria-label={`Flow of ${detail.state.slug}: ${steps.length} steps in ${lanes.length} role lanes`}>
      <defs>
        <marker id="fa" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto" markerUnits="userSpaceOnUse">
          <path d="M0 1L7.5 4L0 7Z" fill="var(--wire)" />
        </marker>
        <marker id="fb" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto" markerUnits="userSpaceOnUse">
          <path d="M0 1L7.5 4L0 7Z" fill="var(--bad)" />
        </marker>
      </defs>
      {lanes.map((r, i) => (
        <g key={r}>
          <rect class={`band role-${roleOf(r).css}`} x={numW + i * laneW + 2} y="18" width={laneW - 4} height={H - 20} rx="7" />
          <text class={`lanehead role-${roleOf(r).css}`} x={numW + (i + 0.5) * laneW} y="12" text-anchor="middle">
            {roleOf(r).s}
          </text>
        </g>
      ))}
      {steps.map((s, i) => (
        <text key={`n${s.id}`} class="rownum" x={numW / 2} y={P[s.id]!.cy + 3} text-anchor="middle">
          {i + 1}
        </text>
      ))}
      {steps.slice(0, -1).map((s, i) => {
        const nx = steps[i + 1]!;
        const a = P[s.id]!, b = P[nx.id]!, y1 = a.cy + 11, y2 = b.cy - 12, my = (y1 + y2) / 2;
        const done = status(s.id) === "done" && flowed.includes(status(nx.id));
        return <path key={`w${s.id}`} class={`wire${done ? " done" : ""}`} d={Math.abs(a.cx - b.cx) < 1 ? `M${a.cx} ${y1}V${y2}` : `M${a.cx} ${y1}V${my}H${b.cx}V${y2}`} marker-end="url(#fa)" />;
      })}
      {P["fix"] && P["verify"] && <Loop v={P["verify"]} fx={P["fix"]} marker="fb" />}
      {steps.map((s, i) => {
        const p = P[s.id]!;
        const st = status(s.id);
        return (
          <g
            key={s.id}
            class={`node st-${st} role-${roleOf(s.role).css}`}
            data-step={s.id}
            tabIndex={0}
            role="button"
            aria-label={`Step ${i + 1}, ${STEP[s.id]?.title ?? s.id}, ${STATUS[st][1]}`}
            onClick={() => pick(s.id)}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), pick(s.id))}
          >
            {selected === s.id && <rect class="sel" x={p.cx - p.w / 2 - 3.5} y={p.cy - 14.5} width={p.w + 7} height="29" rx="9" />}
            <rect class="b" x={p.cx - p.w / 2} y={p.cy - 11} width={p.w} height="22" rx={s.kind === "engine" ? 6 : 11} />
            <text x={p.cx} y={p.cy + 3.8} text-anchor="middle">
              {s.id}
            </text>
          </g>
        );
      })}
      {P["fix"] && (
        <g class="node st-todo role-dev">
          <rect class="b" x={P["fix"].cx - 20} y={P["fix"].cy - 11} width="40" height="22" rx="6" />
          <text x={P["fix"].cx} y={P["fix"].cy + 3.8} text-anchor="middle">
            fix
          </text>
        </g>
      )}
    </svg>
  );
}

/** The command for a step, by its kind and state (revision 52: decide is the QA final check; return sends a step back). */
export function stepCommand(a: Parameters<typeof hubCmd>[0], s: FlowStep, st: StepState, current: string, slug: string): string {
  if (s.id === "qa-final") return hubCmd(a, "decide", slug);
  if (st.status === "signoff" || (s.kind === "hub" && !s.llm && s.id !== "autotests")) return hubCmd(a, "signoff", `${s.id} ${slug}`);
  if (s.id === "autotests") return hubCmd(a, "test", slug);
  if (s.id === "verify") return hubCmd(a, "verify", slug);
  if (s.id === "release") return hubCmd(a, "release", slug);
  if (s.kind === "engine" && s.id === current && st.status !== "returned") return hubCmd(a, "next", slug);
  return hubCmd(a, "run", `${s.id} ${slug}`);
}

export function StepPanel({ detail, id }: { detail: FeatureDetail; id: string }) {
  const { project, me, assistant, go } = useApp();
  const steps = project.flow.steps;
  const s = steps.find((x) => x.id === id)!;
  const st = detail.state.steps.find((x) => x.id === id) ?? { id, role: s.role, status: "todo" as const };
  const text = STEP[id];
  const slug = detail.state.slug;
  const n = steps.indexOf(s) + 1;
  const docPaths = new Set(detail.documents.map((x) => x.path));
  const cmd = stepCommand(assistant, s, st, detail.state.current, slug);
  const engine = s.stages.map((stage) => engineCmd(project.engine.invoke[assistant], stage, slug));
  const prompt = s.llm ? [...engine, ...(text?.hint ? ["", text.hint] : []), "", `Feature: ${detail.summary.title} (${slug}).${detail.feature?.links?.jira ? ` Jira: ${detail.feature.links.jira}.` : ""}`].join("\n").trim() : "";
  const gateOwner = s.gate && s.gate.role !== "auto" && (st.waitingOn ?? []).includes(me.user);
  const time = detail.state.times.find((t) => t.step === id);
  return (
    <>
      <div class={`sd role-${roleOf(s.role).css}`}>
        <div class="row">
          <RoleChip role={s.role} text={roleOf(s.role).n} />
          <span class="muted">
            Step {n} of {steps.length}
          </span>
          <span class="tag">{s.kind === "engine" ? "engine stage" : "hub step"}</span>
          {!s.llm && <span class="tag">no LLM</span>}
          <StatusPill status={st.status} />
        </div>
        <h3 id="steph">{text?.title ?? id}</h3>
        <p>{text?.what ?? ""}</p>
        {text && (
          <div class="row">
            <span class="k">Runs in</span>
            <span class="rl">{text.where}</span>
          </div>
        )}
      </div>
      <div class="kv">
        {time && (
          <>
            <span class="k">Time</span>
            <span data-time={id}>
              {duration(time.hours)}
              {time.finished ? `, ${day(time.started)} to ${day(time.finished)}` : `, started ${day(time.started)}`}
            </span>
          </>
        )}
        {st.by && (
          <>
            <span class="k">{st.status === "running" ? "Running" : st.status === "returned" ? "Returned by" : "Done by"}</span>
            <span>{personName(project, st.by)}</span>
          </>
        )}
        {st.waitingOn && st.waitingOn.length > 0 && (
          <>
            <span class="k">Waiting on</span>
            <span>{names(project, st.waitingOn)}</span>
          </>
        )}
        {st.reason && (
          <>
            <span class="k">{st.status === "returned" ? "Reason" : "Why"}</span>
            <span>{st.reason}</span>
          </>
        )}
        {st.source && (
          <>
            <span class="k">Evidence from</span>
            <span>{SOURCE[st.source]}</span>
          </>
        )}
        {s.gate && (
          <>
            <span class="k">Sign-off</span>
            <span>
              <b>{s.gate.role === "auto" ? "Automatic gate" : roleOf(s.gate.role).n}</b>
              {GATE_BY[s.gate.by] ? ` (${GATE_BY[s.gate.by]})` : ""} · {s.gate.text}
              {st.status === "done" && s.gate.role !== "auto" ? " · recorded" : ""}
              {st.stale ? " · the file changed since its sign-off" : ""}
            </span>
          </>
        )}
        {text && (
          <>
            <span class="k">Files</span>
            <span class="chips">
              {text.files.map((x) =>
                docPaths.has(x) ? (
                  <button type="button" key={x} class="filechip" onClick={() => go(`/features/${slug}/documents`, { doc: x })}>
                    {x}
                  </button>
                ) : (
                  <code key={x}>{x}</code>
                ),
              )}
            </span>
          </>
        )}
      </div>
      {detail.awaiting.includes(id) && gateOwner && <SignoffBox slug={slug} step={id} />}
      {SCREEN[id] && (
        <div class="row">
          <button type="button" class="btn" data-screen={SCREEN[id]![0]} onClick={() => go(`/features/${slug}/${SCREEN[id]![0]}`)}>
            {SCREEN[id]![1]}
          </button>
          <span class="muted">This step is recorded there.</span>
        </div>
      )}
      {/* The command is for the people who run or sign the step; the others see whose it is. */}
      {me.roles.includes(s.role) || gateOwner || (s.gate && s.gate.role !== "auto" && me.roles.includes(s.gate.role)) ? (
        <div class="card">
          <span class="k">In your assistant</span>
          <Cmd text={cmd} />
          {st.status === "signoff" && s.gate && s.gate.role !== "auto" && <Cmd text={hubCmd(assistant, "return", `${id} ${slug} "<reason>"`)} />}
          <p class="muted">
            {st.status === "signoff"
              ? "The evidence is there and the gate waits for the sign-off. The first command records it, the second sends the step back with a reason. No LLM is involved."
              : !s.llm
                ? "This command records a result. It does not call the LLM."
                : engine.length
                  ? `The hub checks the gate, then passes the stage to ${engine.join(" and ")} with the prompt below.`
                  : "A hub step: the hub runs it with the prompt below."}
          </p>
          {prompt && (
            <details class="more">
              <summary>Prompt the hub passes</summary>
              <div>
                <pre class="wrap">{prompt}</pre>
                <div>
                  <CopyButton text={prompt} label="copy prompt" />
                </div>
              </div>
            </details>
          )}
        </div>
      ) : (
        <p class="muted" id="not-your-step">
          {roleOf(s.role).n} runs this step in their assistant. The command for each step is in <Link to="/help#help-commands">Help</Link>.
        </p>
      )}
    </>
  );
}

/** The steps as a list, for a phone, where the role-lane map does not fit. */
function FlowList({ detail, selected }: { detail: FeatureDetail; selected: string }) {
  const { go, project } = useApp();
  const pick = (x: string) => {
    go(`/features/${detail.state.slug}`, { step: x });
    setTimeout(() => document.getElementById("steppanel")?.scrollIntoView({ block: "start" }), 60);
  };
  return (
    <ol class="flowlist" aria-label={`Steps of ${detail.state.slug}`}>
      {project.flow.steps.map((s, i) => {
        const st = detail.state.steps.find((x) => x.id === s.id)?.status ?? "todo";
        return (
          <li key={s.id}>
            <button type="button" data-flow-item={s.id} aria-current={s.id === selected ? "step" : undefined} class={`st-${st}`} onClick={() => pick(s.id)}>
              <span class="num">{i + 1}</span>
              <span class="nm">
                <b>{STEP[s.id]?.title ?? s.id}</b>
                <code>{s.id}</code>
              </span>
              <RoleChip role={s.role} />
              {st !== "todo" && <StatusPill status={st} />}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function Flow({ detail, params }: { detail: FeatureDetail; params: URLSearchParams }) {
  const { go, project } = useApp();
  const ids = project.flow.steps.map((s) => s.id);
  const asked = params.get("step");
  const id = asked && ids.includes(asked) ? asked : detail.state.current === "released" ? ids[ids.length - 1]! : detail.state.current;
  return (
    <div class="flowgrid">
      <div class="card">
        <div class="mapwrap">
          <FlowMap detail={detail} selected={id} pick={(x) => go(`/features/${detail.state.slug}`, { step: x })} />
        </div>
        <FlowList detail={detail} selected={id} />
        <div class="legend">
          {LEGEND.map(([s, l]) => (
            <span key={s}>
              <i class={`lg ${s}`} />
              {l}
            </span>
          ))}
        </div>
        <LeadTime detail={detail} />
      </div>
      <div class="card" id="steppanel">
        <StepPanel detail={detail} id={id} />
      </div>
    </div>
  );
}

const LINKS = [
  ["jira", "Jira"],
  ["confluence", "Confluence"],
  ["figma", "Figma"],
  ["staging", "Staging"],
] as const;

/** The PM's light edits: the title and the links, saved to feature.yaml through a merge request. */
function DetailsForm({ slug, title, links, teams, ui, jira, close }: { slug: string; title: string; links: Partial<Record<(typeof LINKS)[number][0], string>>; teams: Record<string, { lead: string }>; ui: boolean; jira: { url?: string; project_key?: string } | undefined; close: () => void }) {
  const { run, busy, problem } = useAction();
  const { project } = useApp();
  // The engineers of each team; its lead first.
  const crew = (team: string) => project.people.filter((p) => p.roles.includes("dev") && p.team === team).sort((a, b) => Number(b.lead) - Number(a.lead));
  const [tm, setTm] = useState<Record<string, string>>(Object.fromEntries(Object.entries(teams).map(([id, t]) => [id, t.lead])));
  const [hasUi, setHasUi] = useState(ui);
  const teamsChanged = JSON.stringify(Object.entries(tm).sort()) !== JSON.stringify(Object.entries(teams).map(([id, t]) => [id, t.lead]).sort());
  const [t, setT] = useState(title);
  const [l, setL] = useState<Record<string, string>>(Object.fromEntries(LINKS.map(([k]) => [k, links[k] ?? ""])));
  const key = jira?.url ? `${jira.project_key ?? "SHOP"}-123` : undefined;
  const changedLinks = Object.fromEntries(LINKS.filter(([k]) => l[k]!.trim() !== (links[k] ?? "")).map(([k]) => [k, l[k]!.trim()]));
  const edit = {
    ...(t.trim() !== title ? { title: t.trim() } : {}),
    ...(Object.keys(changedLinks).length ? { links: changedLinks } : {}),
    ...(teamsChanged ? { teams: Object.fromEntries(Object.entries(tm).map(([id, lead]) => [id, { lead }])) } : {}),
    ...(hasUi !== ui ? { ui: hasUi } : {}),
  };
  const changed = Object.keys(edit).length > 0;
  return (
    <div class="card" id="details-form">
      <div class="form">
        <label class="fld full">
          <span>Title</span>
          <input type="text" id="df-title" value={t} onInput={(e) => setT((e.target as HTMLInputElement).value)} />
        </label>
        {LINKS.map(([k, label]) => (
          <label class="fld" key={k}>
            <span>{label}</span>
            <input type="text" inputMode="url" id={`df-${k}`} value={l[k]} placeholder={k === "jira" && key ? `${key} or https://` : "https://"} onInput={(e) => setL({ ...l, [k]: (e.target as HTMLInputElement).value })} />
          </label>
        ))}
      </div>
      <fieldset class="fld" id="df-teams">
        <span>Teams and leads</span>
        {project.teams.map((team) => {
          const people = crew(team.id);
          const on = team.id in tm;
          return (
            <div class="row" key={team.id}>
              <label class="check-inline">
                <input type="checkbox" data-team={team.id} checked={on} disabled={!people.length} onChange={(e) => {
                  const next = { ...tm };
                  if ((e.target as HTMLInputElement).checked) next[team.id] = people[0]!.user;
                  else delete next[team.id];
                  setTm(next);
                }} />{" "}
                {team.name}
              </label>
              {on && (
                <select aria-label={`Lead of ${team.name}`} data-lead={team.id} value={tm[team.id]} onChange={(e) => setTm({ ...tm, [team.id]: e.currentTarget.value })}>
                  {people.map((p) => (
                    <option key={p.user} value={p.user}>
                      {p.name}
                      {p.lead ? " · team lead" : ""}
                    </option>
                  ))}
                </select>
              )}
              {!people.length && <span class="reason">No engineer in {team.name} yet: add one on the Team page.</span>}
            </div>
          );
        })}
        <label class="check-inline">
          <input type="checkbox" id="df-ui" checked={hasUi} onChange={(e) => setHasUi((e.target as HTMLInputElement).checked)} /> It has a user interface (without one, ux-flows and screens are skipped)
        </label>
      </fieldset>
      <p class="note">
        The PM names the teams and their leads, and whether there is a user interface, at the epic step. Each link opens this feature's own page: its Jira issue, its Confluence page, its Figma file, its staging address.
        {key && (
          <>
            {" "}
            For Jira, the issue key is enough (<code>{key}</code>): the hub makes it a link on <code>{jira!.url}</code>, and a link to another Jira is refused.
          </>
        )}
      </p>
      <div class="row">
        <button type="button" class="btn pri" id="df-save" disabled={!changed || !t.trim() || busy} onClick={() => void run("details", { slug, edit }).then((ok) => ok && close())}>
          {busy ? "Saving…" : "Save"}
        </button>
        <button type="button" class="btn" onClick={close}>
          Cancel
        </button>
        {!changed && <span class="reason">Change something first.</span>}
      </div>
      {problem}
    </div>
  );
}

/** How long the feature and each step took, from the stage events the plugin records. */
function LeadTime({ detail }: { detail: FeatureDetail }) {
  const { project } = useApp();
  const { leadTime, times } = detail.state;
  const waited =
    detail.state.waited.length > 0 && detail.state.contractTeam ? (
      <p id="waited">
        <span class="k">Waited for {teamName(project, detail.state.contractTeam)}</span>{" "}
        {detail.state.waited.map((w) => `${teamName(project, w.team)} ${w.days} day${w.days === 1 ? "" : "s"}${w.waiting ? ", still waiting" : ""}`).join(" · ")}
      </p>
    ) : null;
  if (!leadTime)
    return (
      <div id="leadtime">
        <p class="muted">No stage events yet: the time per step appears once someone runs a stage with the hub's plugin.</p>
        {waited}
      </div>
    );
  return (
    <div id="leadtime">
      <p>
        <span class="k">Lead time</span> <b>{leadTime.days} days</b> {leadTime.finished ? `from ${day(leadTime.started)} to the release` : `since ${day(leadTime.started)}`}
      </p>
      <p class="muted">{times.map((t) => `${t.step} ${duration(t.hours)}${t.finished ? "" : " so far"}`).join(" · ")}</p>
      {waited}
    </div>
  );
}

const day = (iso: string) => iso.slice(0, 10);
/** Hours under two days, days above. */
const duration = (hours: number) => (hours < 1 ? `${Math.max(1, Math.round(hours * 60))} min` : hours < 48 ? `${Math.round(hours * 10) / 10} h` : `${Math.round((hours / 24) * 10) / 10} days`);

// --- Documents

const SIGNOFF: Record<string, [string, string]> = { current: ["ok", "signed off"], stale: ["warn", "changed since sign-off"], none: ["mute", "no sign-off"] };

/** A markdown document, with its front matter as a short list above the text. */
function MarkdownDoc({ text }: { text: string }) {
  const { front, body } = frontMatter(text);
  return (
    <>
      {front.length > 0 && (
        <div class="kv front" id="front-matter">
          {front.map(([k, v]) => (
            <Fragment key={k}>
              <span class="k">{k.replace(/_/g, " ")}</span>
              <span>{v}</span>
            </Fragment>
          ))}
        </div>
      )}
      <div class="md" dangerouslySetInnerHTML={{ __html: renderMarkdown(body) }} />
    </>
  );
}

function Documents({ slug, detail, params }: { slug: string; detail: FeatureDetail; params: URLSearchParams }) {
  const { go, version } = useApp();
  const docs = detail.documents;
  const sel = docs.find((x) => x.path === params.get("doc")) ?? docs[0];
  const [text, setText] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (!sel) return;
    let live = true;
    setText(undefined);
    api.file(slug, sel.path).then((t) => live && setText(t));
    return () => {
      live = false;
    };
  }, [slug, sel?.path, version]);
  if (!sel) return <div class="lockbox">No documents yet. The spec appears here after step 1.</div>;
  const isMd = sel.path.endsWith(".md");
  return (
    <>
    <ValidateCard slug={slug} />
    <div class="docgrid">
      <div class="doclist">
        {docs.map((x) => (
          <button type="button" key={x.path} class="docbtn" data-doc={x.path} aria-pressed={x.path === sel.path} onClick={() => go(`/features/${slug}/documents`, { doc: x.path })}>
            <span class="fn">{x.path}</span>
            <span class="row">
              <RoleChip role={x.owner} />
              {x.signoff !== "none" && <Pill kind={SIGNOFF[x.signoff]![0]}>{SIGNOFF[x.signoff]![1]}</Pill>}
            </span>
          </button>
        ))}
      </div>
      <div class="card">
        <div class="row sp">
          <span class="mono">
            <b>
              docs/features/{slug}/{sel.path}
            </b>
          </span>
          <RoleChip role={sel.owner} text={`owner: ${roleOf(sel.owner).n}`} />
        </div>
        {text === undefined ? (
          <p class="muted">Loading…</p>
        ) : text === null ? (
          <p class="muted">The file could not be read.</p>
        ) : isMd ? (
          <MarkdownDoc text={text} />
        ) : (
          <pre>{text}</pre>
        )}
        <p class="reason">To change this document, run its owner's stage in the assistant.</p>
      </div>
    </div>
    </>
  );
}

// --- Tasks

export interface TaskNode {
  team: string;
  id: string;
  key: string;
  title: string;
  layer: string;
  acs: string[];
  status: string;
  deps: string[];
  d: number;
  row: number;
}

export const TASK_LABEL: Record<string, [string, string]> = {
  done: ["ok", "done"],
  in_progress: ["info", "in progress"],
  review: ["info", "in review"],
  blocked: ["bad", "blocked"],
  todo: ["mute", "to do"],
};

/** Every task of every team of a feature, joined from tasks.json and the tracker, with team-qualified dependencies. */
export function collectTasks(st: FeatureDetail["state"]): TaskNode[] {
  const all: TaskNode[] = [];
  for (const t of st.teams) {
    const snap = t.snapshot;
    if (!snap) continue;
    const rows = new Map((snap.tracker ?? []).map((r) => [r.id, r]));
    const ids = snap.tasks?.map((x) => x.id) ?? [...rows.keys()];
    for (const id of ids) {
      const task = snap.tasks?.find((x) => x.id === id);
      const row = rows.get(id);
      const deps = [...new Set([...(task?.deps ?? []), ...(row?.blocked_by ?? [])])].map((x) => (x.includes(":") ? x : `${t.id}:${x}`));
      all.push({ team: t.id, id, key: `${t.id}:${id}`, title: task?.title ?? row?.title ?? id, layer: task?.layer ?? "", acs: task?.acs ?? [], status: row?.status ?? "todo", deps, d: 0, row: 0 });
    }
  }
  return all;
}

/** The tasks of other teams a task waits for and that are not done. */
export function waitsOf(x: TaskNode, all: TaskNode[]): string[] {
  return x.deps.filter((k) => k.split(":")[0] !== x.team && all.find((y) => y.key === k)?.status !== "done");
}

function Tasks({ detail, params }: { detail: FeatureDetail; params: URLSearchParams }) {
  const { project, go } = useApp();
  const st = detail.state;
  const teamName = (id: string) => project.teams.find((t) => t.id === id)?.name ?? id;
  const all = collectTasks(st);
  if (!all.length)
    return (
      <div class="lockbox">
        {st.current === "released" ? "This feature is released. No task lists were published for it." : "No tasks yet. Tasks appear after step 9, when each team runs the tasks stage in its own repository."}
        <SourceNote detail={detail} />
      </div>
    );
  const pick = params.get("team");
  const teamIds = st.teams.filter((t) => t.snapshot).map((t) => t.id);
  const shown = all.filter((x) => !pick || x.team === pick);
  const by = new Map(all.map((x) => [x.key, x]));
  const seen = new Set<string>();
  const depth = (x: TaskNode): number => {
    if (seen.has(x.key)) return x.d;
    seen.add(x.key);
    x.d = x.deps.length ? Math.max(...x.deps.map((k) => (by.has(k) ? depth(by.get(k)!) + 1 : 0))) : 0;
    return x.d;
  };
  all.forEach(depth);
  const teams = pick ? [pick] : teamIds;
  const cols = Math.max(...shown.map((x) => x.d)) + 1;
  const cw = 196, nw = 170, nh = 44, left = 78;
  const laneH: Record<string, number> = {}, laneY: Record<string, number> = {};
  let y = 8;
  for (const t of teams) {
    const per: Record<number, number> = {};
    for (const x of shown.filter((z) => z.team === t)) {
      per[x.d] = (per[x.d] ?? 0) + 1;
      x.row = per[x.d]! - 1;
    }
    laneH[t] = Math.max(1, ...Object.values(per)) * (nh + 10) + 14;
    laneY[t] = y;
    y += laneH[t]! + 6;
  }
  const W = left + cols * cw + 8, H = y + 4;
  const pos = (x: TaskNode) => ({ x: left + x.d * cw, y: laneY[x.team]! + 10 + x.row * (nh + 10) });
  const waitsOn = (x: TaskNode) => x.deps.filter((k) => k.split(":")[0] !== x.team && by.get(k)?.status !== "done");
  const label = (x: TaskNode) => (x.status !== "done" && waitsOn(x).length ? `waiting for ${waitsOn(x).map((k) => k.split(":")[0]).join(", ")}` : TASK_LABEL[x.status]?.[1] ?? x.status);
  const unknown = st.waits.filter((w) => !w.known);
  const waiting = shown.filter((x) => x.status !== "done" && waitsOn(x).length).length;
  return (
    <>
      <div class="row sp">
        <div class="fpick">
          {["", ...teamIds].map((t) => (
            <button type="button" key={t || "all"} class="chipbtn" data-team={t || "all"} aria-pressed={(pick ?? "") === t} onClick={() => go(`/features/${st.slug}/tasks`, { team: t || undefined })}>
              {t ? teamName(t) : "All teams"}
            </button>
          ))}
        </div>
        <div class="legend">
          <span>
            <svg width="26" height="8" aria-hidden="true">
              <path d="M0 4H26" stroke="var(--wire)" stroke-width="1.3" />
            </svg>
            depends on
          </span>
          <span>
            <svg width="26" height="8" aria-hidden="true">
              <path d="M0 4H26" stroke="var(--bad)" stroke-width="1.6" stroke-dasharray="5 3" />
            </svg>
            waits for another team
          </span>
        </div>
      </div>
      {waiting > 0 && <p class="note bad">{waiting} tasks wait for another team. The order between teams comes from these references; the PM confirms it at the sprint step.</p>}
      {unknown.map((w) => (
        <p class="note warn" key={`${w.team}${w.task}`}>
          {teamName(w.team)} {w.task} waits for <code>{w.on}</code>, which is not a known task. Check the Blocked by column of that team's tracker.
        </p>
      ))}
      <div class="scroll" style={{ padding: "8px" }}>
        <svg class="dag" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={`Task dependency graph of ${st.slug}`}>
          <defs>
            <marker id="ta" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M0 1L7.5 4L0 7Z" fill="var(--wire)" />
            </marker>
            <marker id="tb" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M0 1L7.5 4L0 7Z" fill="var(--bad)" />
            </marker>
          </defs>
          {teams.map((t) => (
            <g key={t}>
              <rect class="laneband" x="0" y={laneY[t]} width={W} height={laneH[t]} rx="8" />
              <text class="lanelab" x="10" y={laneY[t]! + 18}>
                {teamName(t).toUpperCase()}
              </text>
            </g>
          ))}
          {shown.flatMap((x) =>
            x.deps.map((k) => {
              const dx = by.get(k);
              if (!dx || !teams.includes(dx.team)) return null;
              const a = pos(dx), b = pos(x), cross = dx.team !== x.team;
              const x1 = a.x + nw, y1 = a.y + nh / 2, x2 = b.x - 2, y2 = b.y + nh / 2, mx = (x1 + x2) / 2;
              return <path key={`${k}>${x.key}`} class={`edge${cross ? " x" : ""}`} d={`M${x1} ${y1}C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`} marker-end={`url(#${cross ? "tb" : "ta"})`} />;
            }),
          )}
          {shown.map((x) => {
            const b = pos(x);
            const t = x.title.length > 25 ? `${x.title.slice(0, 24)}…` : x.title;
            return (
              <g key={x.key} class={`tnode s-${x.status}`}>
                <title>{`${x.id} · ${x.title} · ${label(x)}`}</title>
                <rect x={b.x} y={b.y} width={nw} height={nh} rx="8" />
                <text class="id" x={b.x + 10} y={b.y + 17}>
                  {x.id}
                </text>
                <text class="st" x={b.x + nw - 10} y={b.y + 17} text-anchor="end">
                  {label(x).length > 18 ? TASK_LABEL[x.status]?.[1] : label(x)}
                </text>
                <text x={b.x + 10} y={b.y + 34}>
                  {t}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <div class="scroll">
        <table>
          <thead>
            <tr>
              <th>Team</th>
              <th>Task</th>
              <th>Layer</th>
              <th>Criteria</th>
              <th>Depends on</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((x) => (
              <tr key={x.key}>
                <td class="nw">
                  <span class="rl">{project.teams.find((t) => t.id === x.team)?.repo.split("/").pop() ?? x.team}</span>
                </td>
                <td class="wide">
                  <code>{x.id}</code> {x.title}
                </td>
                <td class="nw">{x.layer || "—"}</td>
                <td class="nw">{x.acs.join(", ") || "—"}</td>
                <td class="nw">{x.deps.map((k) => (k.startsWith(`${x.team}:`) ? k.split(":")[1] : k)).join(", ") || "—"}</td>
                <td class="nw">
                  <Pill kind={x.status !== "done" && waitsOn(x).length ? "bad" : (TASK_LABEL[x.status]?.[0] ?? "mute")}>{label(x)}</Pill>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <SourceNote detail={detail} />
    </>
  );
}

function SourceNote({ detail }: { detail: FeatureDetail }) {
  const { project } = useApp();
  const from = { "hub-state": "From hub-state", "local-clone": "From your local copy", none: "No data yet" } as const;
  const groups = (["hub-state", "local-clone", "none"] as const).map((s) => [s, detail.state.teams.filter((t) => t.source === s).map((t) => project.teams.find((x) => x.id === t.id)?.name ?? t.id)] as const).filter(([, n]) => n.length);
  return (
    <p class="muted srcnote" title="Each team's tasks.json and tasks/tracker.md. hub-report publishes them to hub-state; a local copy of the team repository is the fallback.">
      {groups.map(([s, n]) => `${from[s]}: ${n.join(", ")}.`).join(" ")}
    </p>
  );
}

