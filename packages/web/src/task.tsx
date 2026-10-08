// The task page: an action from Home, opened over the current screen. It shows the feature and its step, the
// detail the action needs, the command to copy and the button to the place on the site (prototype: taskHTML).

import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { api, type FeatureDetail, type TestRun } from "./api.ts";
import { collectTasks, StepPanel, stepCommand, TASK_LABEL, waitsOf } from "./feature.tsx";
import type { Action } from "./home.tsx";
import { hubCmd } from "./text.ts";
import { Cmd, names, Pill, Progress, RoleChip, roleLabel, StatusPill, taskLabel, teamName, useApp, WaitMark } from "./ui.tsx";

const SEVERITY: Record<string, string> = { critical: "bad", high: "bad", medium: "warn", low: "mute" };
const BUG_STATUS: Record<string, string> = { open: "bad", fixing: "warn", retest: "info", closed: "ok", rejected: "mute" };

const SITE_HINT: Record<Action["kind"], string> = {
  step: "The step, its gate and its files are on the feature's Flow screen.",
  waits: "Tasks and what they wait for are on the feature's Tasks screen.",
  qa: "The verdicts, the bugs, the test runs and the final decision are on the feature's QA screen.",
};

export function TaskPage({ action, close }: { action: Action; close: () => void }) {
  const { me, project, assistant, go, version } = useApp();
  const [d, setD] = useState<FeatureDetail | null>(null);
  const ref = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => ref.current?.focus(), [action]);
  useEffect(() => {
    let live = true;
    api.feature(action.slug).then((x) => live && setD(x));
    return () => {
      live = false;
    };
  }, [action.slug, version]);

  const f = d?.summary;
  const steps = project.flow.steps;
  const i = f ? steps.findIndex((s) => s.id === f.current) : -1;
  const step = steps.find((s) => s.id === action.step);
  const state = d?.state.steps.find((s) => s.id === action.step);
  const cmd = !d || !step || !state ? null : action.kind === "waits" ? (me.roles.includes("pm") ? hubCmd(assistant, "status", action.slug) : hubCmd(assistant, "next", action.slug)) : stepCommand(assistant, step, state, d.state.current, action.slug);
  const target =
    action.kind === "waits"
      ? { path: `/features/${action.slug}/tasks`, label: "Open tasks", params: {} }
      : action.kind === "qa"
        ? { path: `/features/${action.slug}/qa`, label: "Open QA", params: {} }
        : { path: `/features/${action.slug}`, label: "Open the step", params: { step: action.step } };
  const leave = (path: string, params: Record<string, string | undefined> = {}) => {
    close();
    go(path, params);
  };

  return (
    <div id="sheet" onClick={(e) => e.target === e.currentTarget && close()}>
      <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-h">
        <div class="sheet-top">
          <span class="k">
            Task for {me.name} · {roleLabel(me)}
          </span>
          <button type="button" class="btn sm" id="sheet-x" ref={ref} onClick={close}>
            Close ✕
          </button>
        </div>
        <div class="fhead">
          <div class="row">
            <span class={`pill plain ${action.bad ? "bad" : "info"}`}>{action.tag}</span>
            <code>{action.slug}</code>
          </div>
          <h1 id="sheet-h">{action.title}</h1>
          <p>{action.text}</p>
        </div>
        {!d || !f ? (
          <p class="muted">Loading {action.slug}…</p>
        ) : (
          <>
            <div class="card">
              <span class="k">Feature</span>
              <div class="kv">
                <span class="k">Name</span>
                <span>
                  <b>{f.title}</b> · size {f.size ?? "not set"} · route {f.route}
                </span>
                <span class="k">Now at</span>
                <span class="row">
                  {f.released || i < 0 ? (
                    <Pill kind="ok">Released</Pill>
                  ) : (
                    <>
                      <RoleChip role={f.role ?? steps[i]!.role} />
                      <span>
                        step {i + 1} of {steps.length} · {f.current}
                      </span>
                      <StatusPill status={f.status} />
                      <WaitMark project={project} f={f} />
                    </>
                  )}
                </span>
                <span class="k">Progress</span>
                <Progress value={f.progress} />
                {f.waitingOn.length > 0 && (
                  <>
                    <span class="k">Waiting on</span>
                    <span>{names(project, f.waitingOn)}</span>
                  </>
                )}
                {d.feature?.links?.jira && (
                  <>
                    <span class="k">Jira</span>
                    <span>
                      <a class="btn sm" href={d.feature.links.jira} target="_blank" rel="noopener noreferrer">
                        {d.feature.links.jira.split("/").pop()} ↗
                      </a>
                    </span>
                  </>
                )}
              </div>
            </div>
            <Detail action={action} detail={d} />
            <div class={cmd ? "grid2" : ""}>
              {cmd && (
                <div class="card">
                  <span class="k">In your assistant</span>
                  <Cmd text={cmd} />
                  <p class="muted">The hub checks that the step is yours and open, then runs it. The result shows up here after the next sync. The hub plugin arrives in phase 2.</p>
                </div>
              )}
              <div class="card">
                <span class="k">On this site</span>
                <p>{SITE_HINT[action.kind]}</p>
                <div class="row">
                  <button type="button" class="btn pri" data-go={target.path} onClick={() => leave(target.path, target.params)}>
                    {target.label}
                  </button>
                  <button type="button" class="btn" onClick={() => leave(`/features/${action.slug}`)}>
                    Open the feature
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** passed or failed, with the counts when the run has them. */
export function RunResult({ run }: { run: TestRun }) {
  const n = run.result === "failed" ? run.failed : run.passed;
  return <Pill kind={run.result === "failed" ? "bad" : "ok"}>{n !== undefined ? `${n} ${run.result}` : run.result}</Pill>;
}

/** The detail the action needs. */
function Detail({ action, detail }: { action: Action; detail: FeatureDetail }) {
  const { me, project } = useApp();
  const dev = me.roles.includes("dev") && !!me.team;

  if (action.kind === "waits") {
    const all = collectTasks(detail.state);
    const mine = dev ? all.filter((x) => x.team === me.team) : [];
    // A lead whose task is waited for sees the waiting tasks; a waiting lead sees their team's tasks; the PM sees what is not done.
    const waitedFor = dev ? all.filter((x) => waitsOf(x, all).some((k) => k.startsWith(`${me.team}:`))) : [];
    const rows = waitedFor.length ? waitedFor : dev ? mine : all.filter((x) => x.status !== "done");
    const heading = waitedFor.length ? "Tasks of other teams that wait for yours" : dev ? "Your team's tasks" : "Tasks not finished yet";
    return (
      <div class="card">
        <span class="k">{heading}</span>
        <div class="scroll">
          <table>
            <thead>
              <tr>
                <th>Team</th>
                <th>Task</th>
                <th>Waits for</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((x) => {
                const w = waitsOf(x, all);
                return (
                  <tr key={x.key}>
                    <td class="nw">{teamName(project, x.team)}</td>
                    <td class="wide">
                      <code>{x.id}</code> {x.title}
                    </td>
                    <td class="nw">{w.length ? w.map((k) => taskLabel(project, k)).join(", ") : <span class="muted">nothing</span>}</td>
                    <td class="nw">
                      <Pill kind={w.length && x.status !== "done" ? "bad" : (TASK_LABEL[x.status]?.[0] ?? "mute")}>{w.length && x.status !== "done" ? "waiting" : (TASK_LABEL[x.status]?.[1] ?? x.status)}</Pill>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (action.kind === "qa") {
    const open = detail.state.bugs.filter((b) => b.status !== "closed" && b.status !== "rejected" && (!dev || b.team === me.team));
    const runs = [...detail.state.testRuns].filter((r) => !dev || r.team === me.team).sort((a, b) => (a.at < b.at ? 1 : -1));
    return (
      <div class="card">
        <span class="k">{dev ? "Open bugs on your team" : "Open bugs"}</span>
        {open.length ? (
          <div class="scroll">
            <table>
              <thead>
                <tr>
                  <th>Bug</th>
                  <th>Title</th>
                  <th>Criterion</th>
                  <th>Team</th>
                  <th>Severity</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {open.map((b) => (
                  <tr key={b.id}>
                    <td class="nw">
                      <code>{b.id}</code>
                    </td>
                    <td class="wide">{b.title}</td>
                    <td class="nw">{b.ac ?? "—"}</td>
                    <td class="nw">{teamName(project, b.team)}</td>
                    <td class="nw">
                      <Pill kind={SEVERITY[b.severity] ?? "mute"}>{b.severity}</Pill>
                    </td>
                    <td class="nw">
                      <Pill kind={BUG_STATUS[b.status] ?? "mute"}>{b.status}</Pill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p class="muted">None.</p>
        )}
        <span class="k">Latest test runs</span>
        {runs.length ? (
          <div class="scroll">
            <table>
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Team</th>
                  <th>Run</th>
                  <th>Result</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r, k) => (
                  <tr key={k}>
                    <td class="nw">{r.source === "ci" ? "CI" : "local"}</td>
                    <td class="nw">{teamName(project, r.team)}</td>
                    <td>{r.ref ?? ""}</td>
                    <td class="nw">
                      <RunResult run={r} />
                    </td>
                    <td class="nw muted">{r.at.replace("T", " ").slice(0, 16)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p class="muted">No test runs yet.</p>
        )}
        <p class="muted">Only CI runs count for the autotest gate; local runs are shown with the label local.</p>
      </div>
    );
  }

  return (
    <div class="card">
      <StepPanel detail={detail} id={action.step} />
    </div>
  );
}
