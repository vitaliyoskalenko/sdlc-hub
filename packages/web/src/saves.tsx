// Saving from the site: Sign off and Return on a gate, and what became of each save. A save is a merge request that
// merges by itself when hub-guard passes; until then it is pending, and a refusal shows the path and the rule.

import { Fragment } from "preact";
import { useState } from "preact/hooks";
import type { ActionResult } from "./api.ts";
import { api, type Finding, type Save } from "./api.ts";
import { Pill, useApp } from "./ui.tsx";

const STATE: Record<Save["state"], [string, string]> = { queued: ["warn", "queued: offline"], pending: ["warn", "waiting to merge"], merged: ["ok", "merged"], refused: ["bad", "refused"], conflict: ["bad", "conflicts"] };

/** Someone else's change to the same lines merged first: the person keeps their version or takes the newer one. */
function Conflict({ save }: { save: Save }) {
  const { me, session } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (save.state !== "conflict") return null;
  const choose = async (choice: "mine" | "newer") => {
    setBusy(true);
    setError("");
    const r = await api.resolve(session.demo ? me.user : undefined, save.branch, choice);
    setBusy(false);
    // The server announces the change; the list of saves reloads by itself.
    if (!r.ok) setError(r.error ?? "");
  };
  return (
    <div class="conflict" data-conflict={save.branch}>
      <p>
        Someone else changed the same lines of {(save.conflict ?? save.paths).map((p, i) => (
          <Fragment key={p}>
            {i > 0 && ", "}
            <code>{p}</code>
          </Fragment>
        ))} and it merged first. Choose which version stays.
      </p>
      <div class="row">
        <button type="button" class="btn" data-choose="mine" disabled={busy} onClick={() => void choose("mine")}>
          Keep mine
        </button>
        <button type="button" class="btn" data-choose="newer" disabled={busy} onClick={() => void choose("newer")}>
          Use the newer one
        </button>
        {busy && <span class="reason">Saving…</span>}
      </div>
      <p class="muted">Keep mine puts your version on the newest main as a new request; the newer one drops your save.</p>
      {error && <p class="bad-text">{error}</p>}
    </div>
  );
}

export function SaveState({ save }: { save: Save }) {
  const { session } = useApp();
  const [kind, label] = STATE[save.state];
  return (
    <span class="row">
      <Pill kind={kind}>{label}</Pill>
      {save.warnings?.length && save.state !== "refused" ? <Pill kind="warn">with warnings</Pill> : null}
      {save.mr?.url ? (
        <a href={save.mr.url} target="_blank" rel="noopener noreferrer">
          {session.demo ? "" : "!"}
          {save.mr.iid} ↗
        </a>
      ) : (
        <code>{save.branch}</code>
      )}
    </span>
  );
}

/** What hub-guard warned about in advisory mode: the save merges anyway. */
function Warnings({ save }: { save: Save }) {
  if (!save.warnings?.length || save.state === "refused") return null;
  return (
    <div class="warnings" data-warnings>
      <span class="muted">hub-guard is in advisory mode. In enforce mode it would refuse this:</span>
      <Findings findings={save.warnings} />
    </div>
  );
}

function Findings({ findings }: { findings: Finding[] }) {
  return (
    <ul class="findings">
      {findings.map((f, i) => (
        <li key={i}>
          <code>
            {f.path}
            {f.line ? `:${f.line}` : ""}
          </code>{" "}
          — {f.reason}
        </li>
      ))}
    </ul>
  );
}

/** Sign off or return a gate that waits for me; then its save until it merges. */
export function SignoffBox({ slug, step }: { slug: string; step: string }) {
  const { me, session, saves, savesEnabled, savesWhy, addSave } = useApp();
  const [returning, setReturning] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<{ error: string; findings?: Finding[] } | null>(null);
  const mine = saves.filter((x) => x.meta?.["slug"] === slug && x.meta?.["step"] === step);
  const pending = mine.find((x) => x.state === "pending");
  const refused = mine[0]?.state === "refused" ? mine[0] : undefined;

  if (pending)
    return (
      <div class="card savebox" data-save="pending">
        <span class="k">Your {pending.meta?.["decision"] === "return" ? "return" : "sign-off"}</span>
        <SaveState save={pending} />
        <p class="muted">It merges by itself when hub-guard passes, and the step moves on then. Nothing else is needed from you.</p>
      </div>
    );

  const send = async (decision: "pass" | "return") => {
    setBusy(true);
    setProblem(null);
    const r = await api.signoff(session.demo ? me.user : undefined, { slug, step, decision, ...(decision === "return" ? { reason } : {}) });
    setBusy(false);
    if (r.ok) {
      addSave(r.save);
      setReturning(false);
      setReason("");
    } else setProblem({ error: r.error, ...(r.findings ? { findings: r.findings } : {}) });
  };

  return (
    <div class="card savebox">
      {refused && (
        <div data-save="refused">
          <span class="row">
            <span class="k">Your last save was refused</span>
            <SaveState save={refused} />
          </span>
          {refused.findings && <Findings findings={refused.findings} />}
        </div>
      )}
      <div class="row">
        <button type="button" class="btn pri" id="signoff" disabled={!savesEnabled || busy} onClick={() => void send("pass")}>
          Sign off
        </button>
        <button type="button" class="btn" id="return" disabled={!savesEnabled || busy} aria-expanded={returning} onClick={() => setReturning(!returning)}>
          Return…
        </button>
        {!savesEnabled && <span class="reason">{savesWhy ?? "This checkout has no remote to save to."}</span>}
        {busy && <span class="reason">Saving…</span>}
      </div>
      {returning && (
        <div class="returnform">
          <label for="reason" class="k">
            What has to change
          </label>
          <textarea id="reason" value={reason} onInput={(e) => setReason((e.target as HTMLTextAreaElement).value)} placeholder="For example: AC-03 needs a time limit" />
          <div class="row">
            <button type="button" class="btn" id="send-return" disabled={!reason.trim() || busy} onClick={() => void send("return")}>
              Send back
            </button>
            {!reason.trim() && <span class="reason">Write the reason first: the owner of the step reads it.</span>}
          </div>
        </div>
      )}
      {problem && (
        <div class="problem" role="alert">
          <p>{problem.error}</p>
          {problem.findings && <Findings findings={problem.findings} />}
        </div>
      )}
      <p class="muted">The site records it in signoffs.yaml through a merge request in your name. It merges by itself when hub-guard passes.</p>
    </div>
  );
}

/** My saves that are not merged yet, or were refused, for Home. */
export function YourSaves() {
  const { saves, go } = useApp();
  const open = saves.filter((x) => x.state !== "merged");
  if (!open.length) return null;
  return (
    <section>
      <h2>Your saves</h2>
      <div class="card">
        <table>
          <tbody>
            {open.map((x) => (
              <tr key={x.branch} data-save={x.state}>
                <td class="wide">
                  {x.meta?.["slug"] ? (
                    <button type="button" class="linkbtn" onClick={() => go(`/features/${x.meta!["slug"]}`, { step: x.meta!["step"] })}>
                      {x.title}
                    </button>
                  ) : (
                    x.title
                  )}
                  {x.state === "refused" && x.findings && <Findings findings={x.findings} />}
                  <Warnings save={x} />
                  <Conflict save={x} />
                </td>
                <td class="nw">
                  <SaveState save={x} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Runs one save from the site: busy while it runs, the reason when it is refused, the save when it is made. */
export function useAction() {
  const { me, session, addSave } = useApp();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<{ error: string; findings?: Finding[] } | null>(null);
  const run = async (name: Parameters<typeof api.act>[0], body: unknown): Promise<boolean> => {
    setBusy(true);
    setProblem(null);
    const r: ActionResult = await api.act(name, session.demo ? me.user : undefined, body);
    setBusy(false);
    if (r.ok) addSave(r.save);
    else setProblem({ error: r.error, ...(r.findings ? { findings: r.findings } : {}) });
    return r.ok;
  };
  const view = problem ? (
    <div class="problem" role="alert">
      <p>{problem.error}</p>
      {problem.findings && <Findings findings={problem.findings} />}
    </div>
  ) : null;
  return { run, busy, problem: view };
}

/** My saves of one kind in a feature that are not merged yet. */
export function usePending(slug: string, kind: string) {
  const { saves } = useApp();
  return saves.filter((s) => s.meta?.["kind"] === kind && s.meta?.["slug"] === slug && s.state !== "merged");
}

export function PendingList({ saves }: { saves: Save[] }) {
  if (!saves.length) return null;
  return (
    <div class="pendinglist">
      {saves.map((s) => (
        <div class="row" key={s.branch} data-save={s.state}>
          <span class="muted">{s.title}</span>
          <SaveState save={s} />
          {s.findings && <Findings findings={s.findings} />}
          <Warnings save={s} />
          <Conflict save={s} />
        </div>
      ))}
    </div>
  );
}
