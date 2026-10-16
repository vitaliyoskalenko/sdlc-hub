// A step whose document was built on an older version of what it depends on: whose it is to recheck, what changed,
// and the owner's two ways out, running the step again or confirming that nothing needs to change.

import type { Person, ProjectInfo, Recheck, SpecChange, Summary } from "./api.ts";
import { PendingList, useAction, usePending } from "./saves.tsx";
import { hubCmd, roleOf } from "./text.ts";
import { Cmd, Info, Link, personName, teamName, useApp } from "./ui.tsx";

/** "owner" may rerun or confirm the step; "team" is told, because their lead does it. */
export function recheckFor(me: Person, project: ProjectInfo, r: Recheck): "owner" | "team" | null {
  const step = project.flow.steps.find((s) => s.id === r.step);
  if (!step) return null;
  const contract = project.teams.find((t) => t.api_contract)?.id;
  const team = r.team ?? (step.role === "dev" ? contract : undefined);
  if (step.role === "dev") return me.roles.includes("dev") && me.team === team ? (me.lead ? "owner" : "team") : null;
  return me.roles.includes(step.role) ? "owner" : null;
}

/** "spec.md: AC-02, AC-03 changed on 2026-10-15 by Olena K." for each cause. */
export function causeText(project: ProjectInfo, slug: string, r: Recheck): string {
  const dir = `docs/features/${slug}/`;
  return r.because
    .map((c) => {
      const file = c.file.startsWith(dir) ? c.file.slice(dir.length) : c.file;
      const what = c.ids.length ? `${c.ids.join(", ")} changed in ${file}` : `${file} changed`;
      return `${what} on ${c.at.slice(0, 10)}${c.by ? ` by ${personName(project, c.by)}` : ""}`;
    })
    .join("; ");
}

/** A text as a sentence: one full stop at its end, also after a name that ends with one ("Olena K."). */
export const sentence = (t: string) => (t.endsWith(".") ? t : `${t}.`);

/** The documents to recheck in a few words: each file, and the teams' tasks together. */
export function recheckList(project: ProjectInfo, slug: string, rs: Recheck[]): string {
  const files = rs.filter((r) => !r.team).map((r) => recheckDoc(project, slug, r));
  const teams = rs.filter((r) => r.team);
  const tasks = teams.length === 1 ? [recheckDoc(project, slug, teams[0]!)] : teams.length ? [`the tasks of ${teams.length} teams`] : [];
  return [...files, ...tasks].join(", ");
}

/** What a step's document is: the screens, the test plan, Web's tasks. */
export function recheckDoc(project: ProjectInfo, slug: string, r: Recheck): string {
  if (r.team) return `${teamName(project, r.team)}'s tasks`;
  return r.file.slice(`docs/features/${slug}/`.length);
}

/** The next actions a feature's rechecks give this person. */
export function recheckActions(me: Person, project: ProjectInfo, f: Summary) {
  return f.rechecks.flatMap((r) => {
    const who = recheckFor(me, project, r);
    if (!who) return [];
    const doc = recheckDoc(project, f.slug, r);
    return [
      {
        slug: f.slug,
        step: r.step,
        kind: "recheck" as const,
        tag: "Recheck",
        title: who === "owner" ? `Recheck ${doc} in ${f.slug}` : `Your lead rechecks ${doc} in ${f.slug}`,
        text: `${sentence(causeText(project, f.slug, r))} ${who === "owner" ? "Run the step again, or confirm that nothing needs to change." : "Your tasks may change once they did."}`,
      },
    ];
  });
}

/** Each changed story or criterion once, from the rechecks of a feature: what the spec said and says now. */
export function specChanges(rs: Recheck[]): SpecChange[] {
  const seen = new Map<string, SpecChange>();
  for (const r of rs) for (const c of r.because) for (const t of c.texts ?? []) if (!seen.has(t.id)) seen.set(t.id, t);
  return [...seen.values()];
}

/** Before and after, per id: what a person reads to tell a new meaning from new words. */
export function SpecDiff({ changes, open }: { changes: SpecChange[]; open?: boolean }) {
  if (!changes.length) return null;
  return (
    <details class="more specdiff" open={open}>
      <summary>What changed in the spec ({changes.length})</summary>
      {changes.map((c) => (
        <div class="sd-change" key={c.id} data-change={c.id}>
          <code>{c.id}</code>
          {c.before === undefined ? <span class="pill plain ok">added</span> : c.after === undefined ? <span class="pill plain bad">removed</span> : null}
          {c.before !== undefined && (
            <p class="sd-was">
              <span class="k">Was</span> {c.before}
            </p>
          )}
          {c.after !== undefined && (
            <p class="sd-now">
              <span class="k">Now</span> {c.after}
            </p>
          )}
        </div>
      ))}
    </details>
  );
}

/** On the step's panel and the task page: what changed, the command, and "No change needed". */
export function RecheckCard({ slug, r }: { slug: string; r: Recheck }) {
  const { me, project, assistant, savesEnabled, savesWhy } = useApp();
  const { run, busy, problem } = useAction();
  const pending = usePending(slug, "signoff").filter((s) => s.meta?.["step"] === r.step && s.meta?.["decision"] === "confirm");
  const who = recheckFor(me, project, r);
  const step = project.flow.steps.find((s) => s.id === r.step)!;
  const owner = step.role === "dev" ? `the lead of ${teamName(project, r.team ?? project.teams.find((t) => t.api_contract)?.id ?? "")}` : roleOf(step.role).n;
  const why = !savesEnabled ? savesWhy : who !== "owner" ? `Only ${owner} confirms this.` : pending.length ? "Your confirmation is waiting to merge." : "";
  return (
    <div class="card recheck" id={`recheck-${r.step}${r.team ? `-${r.team}` : ""}`}>
      <span class="k">
        Recheck {recheckDoc(project, slug, r)}{" "}
        <Info label="Why a recheck" id={`recheck-info-${r.step}`}>
          <b>Built on an older version</b>
          <span>This step finished, and later something it is built on changed. The hub compares the stories and criteria by their ids (AC-04, US-2) and the other files as a whole, using the history of main.</span>
          <span>Run the step again to update the document, or, if it still holds, confirm that nothing needs to change. Either one clears the mark.</span>
        </Info>
      </span>
      <p>{sentence(causeText(project, slug, r))}</p>
      <SpecDiff changes={specChanges([r])} />
      {who === "owner" ? (
        <>
          <Cmd text={hubCmd(assistant, "run", `${r.step} ${slug}`)} />
          <div class="row">
            <button type="button" class="btn" data-confirm={r.step} disabled={!!why || busy} onClick={() => void run("signoff", { slug, step: r.step, decision: "confirm" })}>
              {busy ? "Saving…" : "No change needed"}
            </button>
            {why && <span class="reason">{why}</span>}
          </div>
        </>
      ) : (
        <p class="muted">{who === "team" ? `Your lead runs the step again or confirms it; your tasks may change.` : `${owner[0]!.toUpperCase()}${owner.slice(1)} runs the step again or confirms that nothing needs to change.`}</p>
      )}
      <p class="muted">
        <Link to="/guides/changes">How rechecks work</Link>
      </p>
      <PendingList saves={pending} />
      {problem}
    </div>
  );
}
