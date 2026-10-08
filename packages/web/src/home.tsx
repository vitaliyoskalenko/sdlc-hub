// Home: project statistics, your next actions, your numbers and the features in progress.

import type { Person, ProjectInfo, Summary } from "./api.ts";
import { STEP } from "./text.ts";
import { Kpi, Link, listOf, names, Pill, Progress, RoleChip, roleLabel, StatusPill, taskLabel, teamName, useApp, WaitMark, waitingTeams, waitText } from "./ui.tsx";

interface Action {
  slug: string;
  step: string;
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
        out.push({ slug: f.slug, step: f.current, tag: "Others wait for you", bad: true, title: `${listOf(w.teams.map((t) => teamName(project, t)))} wait for your ${onTask}`, text });
      else if (me.roles.includes("dev") && me.team && w.teams.includes(me.team))
        for (const t of w.tasks.filter((x) => x.team === me.team))
          out.push({ slug: f.slug, step: f.current, tag: "Waiting", bad: true, title: `Your ${t.task} waits for ${taskLabel(project, w.on)}`, text: `In ${f.slug}. Keep building the tasks before it on the mock.` });
      else if (me.roles.includes("pm"))
        out.push({ slug: f.slug, step: f.current, tag: "Teams waiting", bad: true, title: `${waitText(project, w)} in ${f.slug}`, text: "You confirm the order between teams at the sprint step. The waits come from the trackers." });
    }
    const step = STEP[f.current];
    const mine = f.waitingOn.includes(me.user);
    const roleHasIt = f.role !== null && me.roles.includes(f.role);
    if (mine && f.status === "signoff")
      out.push({ slug: f.slug, step: f.current, tag: "Sign-off", title: `Sign off ${f.current} for ${f.slug}`, text: `${step?.title ?? f.current}: the evidence is there and the gate waits for you.` });
    else if (mine && f.status === "ready")
      out.push({ slug: f.slug, step: f.current, tag: "Your step", title: `${f.current} is ready for you`, text: `${step?.title ?? f.current}. The steps before it are done.` });
    else if (mine && f.status === "returned")
      out.push({ slug: f.slug, step: f.current, tag: "Returned", bad: true, title: `${f.current} came back to you`, text: f.reason ?? "The gate owner sent the step back." });
    else if (roleHasIt && (f.status === "blocked" || f.status === "missed"))
      out.push({ slug: f.slug, step: f.current, tag: f.status === "blocked" ? "Blocked" : "Missed", bad: true, title: `${f.current} is ${f.status} in ${f.slug}`, text: f.reason ?? "" });
    else if (roleHasIt && f.status === "running")
      out.push({ slug: f.slug, step: f.current, tag: "In progress", title: `${f.current} is running in ${f.slug}`, text: f.by ? `Started by ${names(project, [f.by]).replace(/\.$/, "")}.` : "Work is in progress." });
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

function numbersFor(me: Person, features: Summary[]): [string, string, string?][] {
  const open = features.filter((f) => !f.released);
  const waitingMe = open.filter((f) => f.waitingOn.includes(me.user));
  const at = (ids: string[]) => open.filter((f) => ids.includes(f.current)).length;
  const bugs = open.reduce((n, f) => n + f.blockingBugs.length, 0);
  const waits = open.reduce((n, f) => n + f.waits, 0);
  const r = me.roles[0];
  switch (r) {
    case "po":
      return [[String(waitingMe.filter((f) => f.status === "signoff" || f.status === "ready").length), "Waiting for you", waitingMe.length ? "warn" : "ok"], [String(waitingMe.filter((f) => f.status === "returned").length), "Returned to you"], [String(at(["accept"])), "In acceptance"], [String(open.length), "Features in progress"]];
    case "pm":
      return [[String(open.length), "Features in progress"], [String(open.filter((f) => f.status === "blocked" || f.status === "missed").length), "Blocked or missed", "bad"], [String(waits), "Tasks waiting for another team", waits ? "warn" : "ok"], [String(waitingMe.length), "Waiting for you"]];
    case "designer":
      return [[String(at(["ux-flows", "screens"])), "Features at flows or screens"], [String(waitingMe.length), "Waiting for you", waitingMe.length ? "warn" : "ok"]];
    case "dev":
      return [[String(open.filter((f) => f.role === "dev").length), "Features at an Engineering step"], [String(waitingMe.length), "Waiting for you", waitingMe.length ? "warn" : "ok"], [String(waits), "Tasks waiting for another team", waits ? "warn" : "ok"], [String(bugs), "Blocking bugs", bugs ? "bad" : "ok"]];
    case "qa":
      return [[String(bugs), "Blocking bugs", bugs ? "bad" : "ok"], [String(at(["plan-tests", "verify", "autotests", "qa-final"])), "Features at a QA step"], [String(waitingMe.length), "Waiting for you", waitingMe.length ? "warn" : "ok"], [String(open.filter((f) => f.cycle > 1).length), "Features in a second cycle"]];
    case "ops":
      return [[String(at(["staging"])), "Features at staging"], [String(at(["release"])), "Features in release"], [String(features.filter((f) => f.released).length), "Released"]];
    default:
      return [[String(features.length), "Features"], [String(open.length), "In progress"], [String(features.reduce((n, f) => n + f.warnings, 0)), "Warnings from detection", "warn"]];
  }
}

export function FeatureTable({ list }: { list: Summary[] }) {
  const { project, go } = useApp();
  return (
    <div class="scroll">
      <table class="ftbl">
        <thead>
          <tr>
            <th>Feature</th>
            <th>Size</th>
            <th>Current step</th>
            <th>Progress</th>
            <th>Waiting on</th>
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
                <td class="nw">
                  {f.released || !step ? (
                    <Pill kind="ok">Released</Pill>
                  ) : (
                    <>
                      <RoleChip role={step.role} /> {f.index} · {f.current}{" "}
                      {["blocked", "signoff", "returned", "missed"].includes(f.status) && <StatusPill status={f.status} />} <WaitMark project={project} f={f} />
                    </>
                  )}
                </td>
                <td>
                  <Progress value={f.progress} />
                </td>
                <td>
                  {f.released ? "" : f.waitingOn.length ? names(project, f.waitingOn) : (f.reason ?? (f.by ? `with ${names(project, [f.by])}` : ""))}
                  {f.crossWaits.map((w) => (
                    <div key={w.on} class="waitline">
                      {waitText(project, w)}
                    </div>
                  ))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function Home() {
  const { me, project, features, go } = useApp();
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
        <RepoLabels me={me} />
      </div>
      <section>
        <h2>Project statistics</h2>
        <div class="kpis four">
          <Kpi value={String(open.length)} label="Features in progress" onClick={() => go("/features", { filter: "progress" })} />
          <Kpi value={`${avg}%`} label="Average progress" />
          <Kpi value={String(sign)} label="Waiting for a sign-off" tone={sign ? "warn" : ""} />
          <Kpi value={String(stuck)} label="Blocked or missed" tone={stuck ? "bad" : "ok"} />
          <Kpi value={String(bugs)} label="Blocking bugs" tone={bugs ? "bad" : "ok"} />
          <Kpi value={String(waiting)} label="Blocked by another team" tone={waiting ? "bad" : "ok"} onClick={() => go("/features", { filter: "waiting" })} />
          <Kpi value={String(features.length - open.length)} label="Released" onClick={() => go("/features", { filter: "released" })} />
          <Kpi value={String(features.length)} label="Features" onClick={() => go("/features")} />
        </div>
      </section>
      <div class="homegrid">
        <section>
          <h2>Your next actions</h2>
          {acts.length ? (
            <div class="alist">
              {acts.map((a, i) => (
                <button type="button" class={`arow${a.bad ? " bad" : ""}`} data-task={i} key={i} onClick={() => go(`/features/${a.slug}`, { step: a.step })}>
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
            {numbersFor(me, features).map(([v, l, t]) => (
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
