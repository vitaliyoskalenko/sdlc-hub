// The QA screen of a feature: the verdict per criterion and platform, the bugs, the test runs and the final decision.
// QA records verdicts, files and edits bugs and decides; the team that owns a bug changes its status.

import { useState } from "preact/hooks";
import type { FeatureDetail, VerdictRecord } from "./api.ts";
import { SignoffBox, PendingList, useAction, usePending } from "./saves.tsx";
import { RunResult } from "./task.tsx";
import { Pill, StatusPill, teamName, useApp } from "./ui.tsx";

const SEVERITY: Record<string, string> = { critical: "bad", high: "bad", medium: "warn", low: "mute" };
const BUG_STATUS: Record<string, string> = { open: "bad", fixing: "warn", retest: "info", closed: "ok", rejected: "mute" };
const STATUSES = ["open", "fixing", "retest", "closed", "rejected"];
const VERDICT: Record<string, [string, string]> = { pass: ["ok", "pass"], fail: ["bad", "fail"], na: ["mute", "n/a"] };

function Cell({ v }: { v: VerdictRecord | null }) {
  if (!v) return <span class="muted">—</span>;
  const [kind, label] = VERDICT[v.verdict]!;
  return (
    <span title={`${v.user}, ${v.at.slice(0, 10)}`}>
      <Pill kind={kind}>{label}</Pill> {v.bugs?.join(", ")}
    </span>
  );
}

function stepOf(detail: FeatureDetail, id: string) {
  return detail.state.steps.find((s) => s.id === id);
}

export function QA({ detail }: { detail: FeatureDetail }) {
  const { me, project } = useApp();
  const slug = detail.state.slug;
  const qa = me.roles.includes("qa");
  const { matrix, decisions } = detail.qa;
  const steps = ["verify", "autotests", "qa-final"].map((id) => ({ id, st: stepOf(detail, id) }));
  const owner = (id: string) => detail.awaiting.includes(id) && (stepOf(detail, id)?.waitingOn ?? []).includes(me.user);
  const latestCi = detail.state.teams.map((t) => ({ team: t.id, run: [...detail.state.testRuns].filter((r) => r.team === t.id && r.source === "ci").sort((a, b) => (a.at < b.at ? -1 : 1)).at(-1) }));

  return (
    <div class="stack" id="qa">
      <div class="row">
        {steps.map(({ id, st }) => (
          <span class="row" key={id}>
            <code>{id}</code> {st && <StatusPill status={st.status} />}
          </span>
        ))}
        <span class="muted">cycle {detail.state.cycle}</span>
      </div>

      <section>
        <h2>Criteria by platform</h2>
        <div class="scroll">
          <table id="matrix">
            <thead>
              <tr>
                <th>Criterion</th>
                {matrix.platforms.map((p) => (
                  <th key={p}>{p}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.criteria.map((c) => (
                <tr key={c.id} data-ac={c.id}>
                  <td class="wide">
                    <code>{c.id}</code> {c.text}
                  </td>
                  {matrix.platforms.map((p) => (
                    <td class="nw" key={p} data-cell={`${c.id}|${p}`}>
                      <Cell v={c.cells[p] ?? null} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!matrix.criteria.length && <p class="muted">The spec has no acceptance criteria yet.</p>}
        <p class="muted">{matrix.complete ? "Every criterion passes or does not apply on every platform: QA can sign off verify." : `Still open: ${matrix.open.length} of ${matrix.criteria.length * matrix.platforms.length} cells.`} The newest verdict of a cell counts; earlier ones stay in hub/verification.yaml.</p>
        {qa ? <VerdictForm detail={detail} /> : <p class="reason">QA records the verdicts, with /hub:verify in the assistant or here.</p>}
        {owner("verify") && <SignoffBox slug={slug} step="verify" passWhy={matrix.complete ? undefined : `To sign off, every cell must be pass or n/a: ${matrix.open.length} ${matrix.open.length === 1 ? "is" : "are"} not yet.`} />}
      </section>

      <Bugs detail={detail} />

      <section>
        <h2>Test runs</h2>
        <div class="row">
          {latestCi.map(({ team, run }) => (
            <span class="row" key={team}>
              {teamName(project, team)} {run ? <RunResult run={run} /> : <Pill kind="mute">no CI run</Pill>}
            </span>
          ))}
        </div>
        <div class="scroll">
          <table id="runs">
            <thead>
              <tr>
                <th>Source</th>
                <th>Team</th>
                <th>Result</th>
                <th>Commit</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {[...detail.state.testRuns]
                .sort((a, b) => (a.at < b.at ? 1 : -1))
                .map((r, k) => (
                  <tr key={k} data-run={r.source}>
                    <td class="nw">{r.source === "ci" ? (r.url ? <a href={r.url} target="_blank" rel="noopener noreferrer">CI ↗</a> : "CI") : `local${r.user ? ` · ${r.user}` : ""}`}</td>
                    <td class="nw">{teamName(project, r.team)}</td>
                    <td class="nw">
                      <RunResult run={r} />
                    </td>
                    <td class="nw">
                      <code>{r.ref ?? ""}</code>
                    </td>
                    <td class="nw muted">{r.at.replace("T", " ").slice(0, 16)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <p class="muted">The autotests gate counts only the latest CI run of every team repository. Local runs (/hub:test) are shown with the label local.</p>
      </section>

      <section>
        <h2>Final check</h2>
        {decisions.filter((d) => d.step === "qa-final").length ? (
          <ul class="history">
            {decisions
              .filter((d) => d.step === "qa-final")
              .map((d, i) => (
                <li key={i}>
                  <Pill kind={d.decision === "pass" ? "ok" : "bad"}>{d.decision === "pass" ? "passed" : `returned, cycle ${d.cycle ?? ""}`}</Pill> {d.user}, {d.at.slice(0, 10)}
                  {d.reason ? ` · ${d.reason}` : ""}
                  {d.bugs?.length ? ` · ${d.bugs.join(", ")}` : ""}
                </li>
              ))}
          </ul>
        ) : (
          <p class="muted">No decision yet.</p>
        )}
        {detail.state.warnings
          .filter((w) => w.startsWith("The CI result of"))
          .map((w) => (
            <p class="note warn" key={w} data-ci-stale>
              {w}
            </p>
          ))}
        {owner("qa-final") ? <Decision detail={detail} /> : <p class="reason">{qa ? "The final check opens when autotests are green." : "QA records the final decision."}</p>}
      </section>
    </div>
  );
}

function VerdictForm({ detail }: { detail: FeatureDetail }) {
  const slug = detail.state.slug;
  const { matrix } = detail.qa;
  const openBugs = detail.state.bugs.filter((b) => b.status !== "closed" && b.status !== "rejected");
  const [ac, setAc] = useState(matrix.criteria[0]?.id ?? "");
  const [platform, setPlatform] = useState("all");
  const [verdict, setVerdict] = useState<"pass" | "fail" | "na">("pass");
  const [bug, setBug] = useState(openBugs[0]?.id ?? "");
  const { run, busy, problem } = useAction();
  const pending = usePending(slug, "verdicts");
  const platforms = platform === "all" ? matrix.platforms : [platform];
  const waiting = pending.some((p) => p.state === "pending");
  const reason = !ac ? "The spec has no criteria" : verdict === "fail" && !bug ? "A failed criterion needs its bug: file it below first" : waiting ? "Waiting for your last verdicts to merge" : "";
  return (
    <div class="card" id="verdict-form">
      <span class="k">Record a verdict</span>
      <div class="row">
        <select id="vf-ac" value={ac} onChange={(e) => setAc(e.currentTarget.value)} aria-label="Criterion">
          {matrix.criteria.map((c) => (
            <option key={c.id} value={c.id}>
              {c.id}
            </option>
          ))}
        </select>
        <select id="vf-platform" value={platform} onChange={(e) => setPlatform(e.currentTarget.value)} aria-label="Platform">
          <option value="all">every platform</option>
          {matrix.platforms.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <span class="fpick">
          {(["pass", "fail", "na"] as const).map((v) => (
            <button type="button" key={v} class="chipbtn" data-verdict={v} aria-pressed={verdict === v} onClick={() => setVerdict(v)}>
              {VERDICT[v]![1]}
            </button>
          ))}
        </span>
        {verdict === "fail" && (
          <select id="vf-bug" value={bug} onChange={(e) => setBug(e.currentTarget.value)} aria-label="Bug">
            {openBugs.map((b) => (
              <option key={b.id} value={b.id}>
                {b.id} {b.title}
              </option>
            ))}
          </select>
        )}
        <button type="button" class="btn pri" id="vf-save" disabled={!!reason || busy} onClick={() => void run("verdicts", { slug, verdicts: platforms.map((p) => ({ ac, platform: p, verdict, ...(verdict === "fail" ? { bugs: [bug] } : {}) })) })}>
          Save
        </button>
        {reason && <span class="reason">{reason}</span>}
      </div>
      {problem}
      <PendingList saves={pending} />
    </div>
  );
}

function Bugs({ detail }: { detail: FeatureDetail }) {
  const { me, project } = useApp();
  const slug = detail.state.slug;
  const qa = me.roles.includes("qa");
  const [adding, setAdding] = useState(false);
  const { run, busy, problem } = useAction();
  const pending = usePending(slug, "bug");
  const mayStatus = (team: string) => qa || (me.roles.includes("dev") && me.team === team);
  return (
    <section>
      <div class="row sp">
        <h2>Bugs</h2>
        {!adding && (
          <span class="row">
            <button type="button" class="btn" id="add-bug" disabled={!qa} onClick={() => setAdding(true)}>
              File a bug
            </button>
            {!qa && <span class="reason">QA files bugs.</span>}
          </span>
        )}
      </div>
      {adding && <BugForm detail={detail} close={() => setAdding(false)} />}
      {detail.state.bugs.length ? (
        <div class="scroll">
          <table id="bugs">
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
              {detail.state.bugs.map((b) => (
                <tr key={b.id} data-bug={b.id}>
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
                    {mayStatus(b.team) ? (
                      <select aria-label={`Status of ${b.id}`} data-bug-status={b.id} value={b.status} disabled={busy} onChange={(e) => void run("bug-edit", { slug, id: b.id, edit: { status: e.currentTarget.value } })}>
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <Pill kind={BUG_STATUS[b.status] ?? "mute"}>{b.status}</Pill>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p class="muted">No bugs.</p>
      )}
      {problem}
      <PendingList saves={pending} />
      <p class="muted">QA changes everything in a bug; the team that owns it changes its status. Each change is a merge request in your name.</p>
    </section>
  );
}

function BugForm({ detail, close }: { detail: FeatureDetail; close: () => void }) {
  const { project } = useApp();
  const slug = detail.state.slug;
  const { matrix } = detail.qa;
  const teams = detail.state.teams.map((t) => t.id);
  const [f, setF] = useState({ title: "", ac: matrix.criteria[0]?.id ?? "", team: teams[0] ?? project.teams[0]?.id ?? "", severity: "high", platforms: [] as string[], body: "" });
  const { run, busy, problem } = useAction();
  const missing = !f.title.trim() ? "Give the bug a title" : !f.team ? "Choose the team that owns it" : "";
  const save = async () => {
    if (await run("bug", { slug, bug: { title: f.title, team: f.team, severity: f.severity, ...(f.ac ? { ac: f.ac } : {}), ...(f.platforms.length ? { platforms: f.platforms } : {}), ...(f.body.trim() ? { body: f.body } : {}) } })) close();
  };
  return (
    <div class="card" id="bug-form">
      <div class="form">
        <label class="fld full">
          <span>Title</span>
          <input type="text" id="bf-title" value={f.title} onInput={(e) => setF({ ...f, title: e.currentTarget.value })} />
        </label>
        <label class="fld">
          <span>Criterion</span>
          <select id="bf-ac" value={f.ac} onChange={(e) => setF({ ...f, ac: e.currentTarget.value })}>
            <option value="">none</option>
            {matrix.criteria.map((c) => (
              <option key={c.id} value={c.id}>
                {c.id}
              </option>
            ))}
          </select>
        </label>
        <label class="fld">
          <span>Team that owns it</span>
          <select id="bf-team" value={f.team} onChange={(e) => setF({ ...f, team: e.currentTarget.value })}>
            {project.teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label class="fld">
          <span>Severity</span>
          <select id="bf-severity" value={f.severity} onChange={(e) => setF({ ...f, severity: e.currentTarget.value })}>
            {["critical", "high", "medium", "low"].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <fieldset class="fld">
          <span>Platforms</span>
          <div class="fpick">
            {matrix.platforms.map((p) => (
              <button type="button" key={p} class="chipbtn" aria-pressed={f.platforms.includes(p)} onClick={() => setF({ ...f, platforms: f.platforms.includes(p) ? f.platforms.filter((x) => x !== p) : [...f.platforms, p] })}>
                {p}
              </button>
            ))}
          </div>
        </fieldset>
        <label class="fld full">
          <span>Steps, expected and actual</span>
          <textarea id="bf-body" value={f.body} onInput={(e) => setF({ ...f, body: e.currentTarget.value })} />
        </label>
      </div>
      <div class="row">
        <button type="button" class="btn pri" id="bf-save" disabled={!!missing || busy} onClick={() => void save()}>
          File the bug
        </button>
        <button type="button" class="btn" onClick={close}>
          Cancel
        </button>
        {missing && <span class="reason">{missing}</span>}
      </div>
      {problem}
    </div>
  );
}

function Decision({ detail }: { detail: FeatureDetail }) {
  const slug = detail.state.slug;
  const openBugs = detail.state.bugs.filter((b) => b.status !== "closed" && b.status !== "rejected");
  const [returning, setReturning] = useState(false);
  const [reason, setReason] = useState("");
  const [bugs, setBugs] = useState<string[]>([]);
  const { run, busy, problem } = useAction();
  const pending = usePending(slug, "signoff").filter((s) => s.meta?.["step"] === "qa-final");
  if (pending.length) return <PendingList saves={pending} />;
  return (
    <div class="card" id="decision">
      <div class="row">
        <button type="button" class="btn pri" id="decide-pass" disabled={busy} onClick={() => void run("signoff", { slug, step: "qa-final", decision: "pass" })}>
          Pass to release
        </button>
        <button type="button" class="btn" id="decide-return" aria-expanded={returning} onClick={() => setReturning(!returning)}>
          Return to development…
        </button>
      </div>
      {returning && (
        <div class="returnform">
          <label class="k" for="decide-reason">
            Why it goes back
          </label>
          <textarea id="decide-reason" value={reason} onInput={(e) => setReason(e.currentTarget.value)} />
          <div class="fpick">
            {openBugs.map((b) => (
              <button type="button" key={b.id} class="chipbtn" data-decide-bug={b.id} aria-pressed={bugs.includes(b.id)} onClick={() => setBugs(bugs.includes(b.id) ? bugs.filter((x) => x !== b.id) : [...bugs, b.id])}>
                {b.id}
              </button>
            ))}
          </div>
          <div class="row">
            <button type="button" class="btn" id="decide-send" disabled={!reason.trim() || busy} onClick={() => void run("signoff", { slug, step: "qa-final", decision: "return", reason, bugs })}>
              Send back to verify
            </button>
            {!reason.trim() && <span class="reason">Write the reason first.</span>}
          </div>
        </div>
      )}
      {problem}
    </div>
  );
}
