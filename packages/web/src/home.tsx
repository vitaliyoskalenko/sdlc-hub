// Home: project statistics, your next actions, your numbers and the features in progress.

import type { Person, ProjectInfo, Summary } from "./api.ts";
import { YourSaves } from "./saves.tsx";
import { roleOf, STEP } from "./text.ts";
import { Kpi, Link, listOf, names, personName, Pill, Progress, RoleChip, roleLabel, StatusPill, taskLabel, teamName, useApp, waitingTeams, waitText } from "./ui.tsx";

export interface Action {
  slug: string;
  step: string;
  /** What the task page shows: the step, the tasks that wait, or the bugs and test runs. */
  kind: "step" | "waits" | "qa";
  tag: string;
  bad?: boolean;
  title: string;
  text: string;
}

/** What waits for this person, derived from the detected state of every feature. */
export function actionsFor(me: Person, project: ProjectInfo, features: Summary[]): Action[] {
  const out: Action[] = [];
  for (const f of features) {
    if (f.released) continue;
    // Waits between teams come first: they are the cost the hub exists to make visible.
    for (const w of f.crossWaits) {
      const [onTeam, onTask] = w.on.split(":") as [string, string];
      const text = `In ${f.slug}: ${waitText(project, w)}. The tasks before it run on the mock.`;
      if (me.roles.includes("dev") && me.team === onTeam)
        out.push({ slug: f.slug, step: f.current, kind: "waits", tag: "Others wait for you", bad: true, title: `${listOf(w.teams.map((t) => teamName(project, t)))} wait for your ${onTask}`, text });
      else if (me.roles.includes("dev") && me.team && w.teams.includes(me.team))
        for (const t of w.tasks.filter((x) => x.team === me.team))
          out.push({ slug: f.slug, step: f.current, kind: "waits", tag: "Waiting", bad: true, title: `Your ${t.task} waits for ${taskLabel(project, w.on)}`, text: `In ${f.slug}. Keep building the tasks before it on the mock.` });
      else if (me.roles.includes("pm"))
        out.push({ slug: f.slug, step: f.current, kind: "waits", tag: "Teams waiting", bad: true, title: `${waitText(project, w)} in ${f.slug}`, text: "You confirm the order between teams at the sprint step. The waits come from the trackers." });
    }
    const step = STEP[f.current];
    const kind: Action["kind"] = ["verify", "autotests", "qa-final"].includes(f.current) ? "qa" : "step";
    const mine = f.waitingOn.includes(me.user);
    const roleHasIt = f.role !== null && me.roles.includes(f.role);
    if (mine && f.status === "signoff")
      out.push({ slug: f.slug, step: f.current, kind, tag: "Sign-off", title: `Sign off ${f.current} for ${f.slug}`, text: `${step?.title ?? f.current}: the evidence is there and the gate waits for you.` });
    else if (mine && f.status === "ready")
      out.push({ slug: f.slug, step: f.current, kind, tag: "Your step", title: `${f.current} is ready for you`, text: `${step?.title ?? f.current}. The steps before it are done.` });
    else if (mine && f.status === "returned")
      out.push({ slug: f.slug, step: f.current, kind, tag: "Returned", bad: true, title: `${f.current} came back to you`, text: f.reason ?? "The gate owner sent the step back." });
    else if (roleHasIt && (f.status === "blocked" || f.status === "missed"))
      out.push({ slug: f.slug, step: f.current, kind, tag: f.status === "blocked" ? "Blocked" : "Missed", bad: true, title: `${f.current} is ${f.status} in ${f.slug}`, text: f.reason ?? "" });
    else if (roleHasIt && f.status === "running")
      out.push({ slug: f.slug, step: f.current, kind, tag: "In progress", title: `${f.current} is running in ${f.slug}`, text: f.by ? `Started by ${names(project, [f.by]).replace(/\.$/, "")}.` : "Work is in progress." });
  }
  return [...out.filter((a) => a.bad), ...out.filter((a) => !a.bad)];
}

function reposOf(me: Person, project: ProjectInfo): string[] {
  const specs = project.project.repo;
  const all = [specs, ...project.teams.map((t) => t.repo.split("/").pop()!)];
  if (me.roles.some((r) => r === "ops" || r === "admin")) return all;
  if (me.roles.includes("qa")) return all;
  if (me.roles.includes("dev")) {
    const own = project.teams.find((t) => t.id === me.team)?.repo.split("/").pop();
    return [...(own ? [own] : []), ...(me.lead ? [specs] : [])];
  }
  return [specs];
}

export function RepoLabels({ me }: { me: Person }) {
  const { project } = useApp();
  return (
    <div class="row">
      <span class="k">Repos</span>
      {reposOf(me, project).map((r) => (
        <span class="rl" key={r}>
          {r}
        </span>
      ))}
    </div>
  );
}

/** Numbers for the role, beyond the project statistics and the action list above. */
function numbersFor(role: string, features: Summary[]): [string, string, string?][] {
  const open = features.filter((f) => !f.released);
  const at = (ids: string[]) => open.filter((f) => ids.includes(f.current)).length;
  const waits = open.reduce((n, f) => n + f.waits, 0);
  switch (role) {
    case "po":
      return [[String(at(["specify", "clarify"])), "At specify or clarify"], [String(at(["accept"])), "In acceptance"]];
    case "pm":
      return [[String(at(["epic", "sprint"])), "At epic or sprint"], [String(waits), "Tasks waiting for another team", waits ? "warn" : "ok"]];
    case "designer":
      return [[String(at(["ux-flows", "screens"])), "At flows or screens"]];
    case "dev":
      return [[String(open.filter((f) => f.role === "dev").length), "At an Engineering step"], [String(waits), "Tasks waiting for another team", waits ? "warn" : "ok"]];
    case "qa":
      return [[String(at(["plan-tests", "verify", "autotests", "qa-final"])), "At a QA step"], [String(open.filter((f) => f.cycle > 1).length), "In a second QA cycle"]];
    case "ops":
      return [[String(at(["staging"])), "At staging"], [String(at(["release"])), "In release"]];
    default:
      return [[String(features.reduce((n, f) => n + f.warnings, 0)), "Warnings from detection", "warn"]];
  }
}

/** What the current step waits for, and from whom: each person with their role, then any wait on another team. */
function NextMove({ f }: { f: Summary }) {
  const { project } = useApp();
  const doing: Partial<Record<string, string>> = { signoff: "to sign off", returned: "to rework it", ready: "to start it", running: "working on it", blocked: "blocked", missed: "missed" };
  const people = f.waitingOn.length ? f.waitingOn : f.status === "running" && f.by ? [f.by] : [];
  return (
    <div class="nextmove">
      {people.length ? (
        people.map((u) => {
          const p = project.people.find((x) => x.user === u);
          return (
            <span class="who" key={u}>
              <b>{personName(project, u)}</b>
              {p && <RoleChip role={p.roles[0]!} />}
              <span class="muted">{doing[f.status] ?? ""}</span>
            </span>
          );
        })
      ) : (
        <span class="muted">{f.reason ?? (f.status === "running" && f.role ? `${roleOf(f.role).n} working on it` : "nobody yet")}</span>
      )}
      {f.reason && people.length > 0 && <span class="muted">{f.reason}</span>}
      {f.crossWaits.map((w) => (
        <span key={w.on} class="waitline">
          {waitText(project, w)}
        </span>
      ))}
    </div>
  );
}

export function FeatureTable({ list }: { list: Summary[] }) {
  const { project, go } = useApp();
  const total = project.flow.steps.length;
  return (
    <div class="scroll">
      <table class="ftbl">
        <thead>
          <tr>
            <th>Feature</th>
            <th>Size</th>
            <th>Current step</th>
            <th>Progress</th>
            <th>Who is next</th>
          </tr>
        </thead>
        <tbody>
          {list.map((f) => {
            const step = project.flow.steps.find((s) => s.id === f.current);
            return (
              <tr class="click" key={f.slug} onClick={() => go(`/features/${f.slug}`)}>
                <td>
                  <Link class="linkbtn" to={`/features/${f.slug}`}>
                    <b>{f.title}</b>
                  </Link>
                  <br />
                  <code>{f.slug}</code>
                </td>
                <td class="nw">
                  {f.size ?? "?"} · {f.route}
                </td>
                <td>
                  {f.released || !step ? (
                    <Pill kind="ok">Released</Pill>
                  ) : (
                    <div class="stepcell">
                      <b>{STEP[f.current]?.title ?? f.current}</b>
                      <span class="muted">
                        Step {f.index} of {total} · <code>{f.current}</code>
                      </span>
                      <span class="row">
                        <StatusPill status={f.status} />
                      </span>
                    </div>
                  )}
                </td>
                <td>
                  <Progress value={f.progress} />
                </td>
                <td>{f.released ? null : <NextMove f={f} />}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function Home() {
  const { me, project, features, go, openTask, role } = useApp();
  const acts = actionsFor(me, project, features);
  const open = features.filter((f) => !f.released);
  const avg = open.length ? Math.round(open.reduce((n, f) => n + f.progress, 0) / open.length) : 100;
  const sign = open.filter((f) => f.status === "signoff").length;
  const stuck = open.filter((f) => f.status === "blocked" || f.status === "missed").length;
  const bugs = open.reduce((n, f) => n + f.blockingBugs.length, 0);
  // Teams that wait for another team, counted once per feature: the step stays running, the wait is still a cost.
  const waiting = open.reduce((n, f) => n + waitingTeams(f).length, 0);
  const urgent = acts.filter((a) => a.bad).length;
  return (
    <>
      <div class="ph">
        <div>
          <h1>Home</h1>
          <p class="sub">
            {me.name} · {roleLabel(me)} · {acts.length ? `${acts.length} action${acts.length === 1 ? "" : "s"} waiting for you${urgent ? `, ${urgent} urgent` : ""}` : "nothing is waiting for you"}
          </p>
        </div>
      </div>
      <YourSaves />
      <section>
        <h2>Project statistics</h2>
        <div class="statgroups">
          <div class="card statgroup" id="stats-where">
            <h3>Where features are</h3>
            <div class="kpis two">
              <Kpi value={String(open.length)} label="In progress" onClick={() => go("/features", { filter: "progress" })} />
              <Kpi value={String(features.length - open.length)} label="Released" onClick={() => go("/features", { filter: "released" })} />
            </div>
            <div class="avgbar">
              <span class="muted">Average progress of the features in progress</span>
              <Progress value={avg} />
            </div>
          </div>
          <div class="card statgroup" id="stats-attention">
            <h3>What needs attention</h3>
            <div class="kpis two">
              <Kpi value={String(sign)} label="Waiting for a sign-off" tone={sign ? "warn" : "ok"} />
              <Kpi value={String(stuck)} label="Blocked or missed" tone={stuck ? "bad" : "ok"} />
              <Kpi value={String(waiting)} label="Blocked by another team" tone={waiting ? "bad" : "ok"} onClick={() => go("/features", { filter: "waiting" })} />
              <Kpi value={String(bugs)} label="Blocking bugs" tone={bugs ? "bad" : "ok"} />
            </div>
          </div>
        </div>
      </section>
      <div class="homegrid">
        <section>
          <h2>Your next actions</h2>
          {acts.length ? (
            <div class="alist">
              {acts.map((a, i) => (
                <button type="button" class={`arow${a.bad ? " bad" : ""}`} data-task={i} key={i} onClick={() => openTask(a)}>
                  <span class="a-top">
                    <span class={`pill plain ${a.bad ? "bad" : "info"}`}>{a.tag}</span>
                    <code>{a.slug}</code>
                  </span>
                  <b>{a.title}</b>
                  <span class="muted">{a.text}</span>
                  <span class="chev" aria-hidden="true">
                    ›
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div class="lockbox">Nothing is waiting for you. New actions appear here when a step reaches your role.</div>
          )}
        </section>
        <section>
          <h2>Your numbers</h2>
          <div class="kpis two">
            {numbersFor(role, features).map(([v, l, t]) => (
              <Kpi key={l} value={v} label={l} tone={t} />
            ))}
          </div>
        </section>
      </div>
      <section>
        <h2>Features in progress</h2>
        {open.length ? <FeatureTable list={open} /> : <div class="lockbox">No feature is in progress.</div>}
      </section>
    </>
  );
}
