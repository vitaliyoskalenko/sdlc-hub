// Validation after a spec change: the command to copy, and, when the admin turned headless runs on, a button that
// starts the person's own assistant read-only. The report is shown first; saving it is the person's choice.

import { useState } from "preact/hooks";
import { renderMarkdown } from "./markdown.ts";
import { PendingList, useAction, usePending } from "./saves.tsx";
import { hubCmd } from "./text.ts";
import { Cmd, Info, useApp } from "./ui.tsx";
import type { Recheck } from "./api.ts";
import { recheckList, SpecDiff, specChanges } from "./recheck.tsx";

export function ValidateCard({ slug, rechecks }: { slug: string; rechecks: Recheck[] }) {
  const { me, project, assistant, session, savesEnabled, savesWhy } = useApp();
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { run, busy, problem } = useAction();
  const pending = usePending(slug, "validation");
  const mayValidate = me.roles.includes("po") || me.roles.includes("admin") || (me.roles.includes("dev") && me.lead);
  // The PO's answer to a spec change that kept its meaning: every document it marked is cleared at once.
  const wording = useAction();
  const wordingPending = usePending(slug, "signoff").filter((x) => x.meta?.["step"] === "clarify" && x.meta?.["decision"] === "confirm");
  const fromSpec = rechecks.filter((r) => r.because.some((c) => c.file === `docs/features/${slug}/spec.md`)).length;

  const start = async () => {
    setRunning(true);
    setError(null);
    setReport(null);
    const r = await fetch(`/api/actions/validate${session.demo ? `?as=${encodeURIComponent(me.user)}` : ""}`, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug }) });
    const data = (await r.json().catch(() => ({}))) as { report?: string; error?: string };
    setRunning(false);
    if (r.ok && data.report) setReport(data.report);
    else setError(data.error ?? `The server answered ${r.status}`);
  };

  // The PO, the admin and the leads run it; the others need not see it.
  if (!mayValidate) return null;
  const docs = rechecks.length ? recheckList(project, slug, rechecks) : "";
  return (
    <div class={`card${docs.length ? " recheck" : " compact"}`} id="validate">
      <span class="k">
        Check the other documents{" "}
        <Info label="What a validation does" id="validate-info">
          <b>Validate after a spec change</b>
          <span>The assistant reads every document built on the spec (flows, screens, the contract, each team's tasks and the test plan) and reports, document by document: consistent, or what conflicts with a proposed fix. It edits nothing; you may save the report to hub/validation/.</span>
          <span>Who: the PO or a team lead. When: after you change the spec once other steps used it. The hub marks those documents needs validation, and each owner reruns their step or confirms it.</span>
        </Info>
      </span>
      <p class={docs.length ? undefined : "muted"}>
        {docs ? `The spec changed after ${rechecks.length === 1 ? "this document was" : `${rechecks.length} documents were`} built on it: ${docs}. Check that they still agree; it edits nothing.` : "After you change the spec: check that the other documents still agree. It edits nothing."}
      </p>
      <Cmd text={hubCmd(assistant, "validate", slug)} />
      {/* The PO reads what changed before saying that only the wording did. */}
      {fromSpec > 0 && <SpecDiff changes={specChanges(rechecks)} open={me.roles.includes("po")} />}
      {me.roles.includes("po") && fromSpec > 0 && (
        <div class="row">
          <button type="button" class="btn" id="validate-wording" disabled={!savesEnabled || wording.busy || wordingPending.length > 0} onClick={() => void wording.run("signoff", { slug, step: "clarify", decision: "confirm" })}>
            {wording.busy ? "Saving…" : "Only the wording changed"}
          </button>
          <span class="reason">{!savesEnabled ? savesWhy : wordingPending.length ? "Waiting to merge." : `Clears the mark on ${fromSpec === 1 ? "the document" : `all ${fromSpec}`}: use it when no criterion changed in meaning.`}</span>
        </div>
      )}
      <PendingList saves={wordingPending} />
      {wording.problem}
      {project.headless && (
        <div class="row">
          <button type="button" class="btn" id="validate-now" disabled={running} onClick={() => void start()}>
            {running ? "Validating… (a few minutes)" : "Validate now"}
          </button>
          <span class="reason">Runs your assistant here, read-only.</span>
        </div>
      )}
      {error && (
        <div class="problem" role="alert">
          <p>{error}</p>
        </div>
      )}
      {report && (
        <div id="validate-report">
          <div class="md" dangerouslySetInnerHTML={{ __html: renderMarkdown(report) }} />
          <div class="row">
            <button type="button" class="btn pri" id="validate-save" disabled={busy || pending.some((p) => p.state === "pending")} onClick={() => void run("validation", { slug, report })}>
              Save the report
            </button>
            <span class="muted">Saved as hub/validation/&lt;time&gt;.md through a merge request in your name.</span>
          </div>
          {problem}
        </div>
      )}
      <PendingList saves={pending} />
    </div>
  );
}
