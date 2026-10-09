// Validation after a spec change: the command to copy, and, when the admin turned headless runs on, a button that
// starts the person's own assistant read-only. The report is shown first; saving it is the person's choice.

import { useState } from "preact/hooks";
import { renderMarkdown } from "./markdown.ts";
import { PendingList, useAction, usePending } from "./saves.tsx";
import { hubCmd } from "./text.ts";
import { Cmd, useApp } from "./ui.tsx";

export function ValidateCard({ slug }: { slug: string }) {
  const { me, project, assistant, session } = useApp();
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { run, busy, problem } = useAction();
  const pending = usePending(slug, "validation");
  const mayValidate = me.roles.includes("po") || me.roles.includes("admin") || (me.roles.includes("dev") && me.lead);
  const reason = !project.headless ? "Off: the admin turns on headless runs (headless.enabled in .hub/config.yaml)." : !mayValidate ? "The PO and the team leads run a validation." : "";

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

  return (
    <div class="card" id="validate">
      <span class="k">Validate after a spec change</span>
      <p class="muted">Checks every document downstream of the spec against it and reports, document by document. It edits nothing.</p>
      <Cmd text={hubCmd(assistant, "validate", slug)} />
      <div class="row">
        <button type="button" class="btn" id="validate-now" disabled={!!reason || running} onClick={() => void start()}>
          {running ? "Validating… (a few minutes)" : "Validate now"}
        </button>
        {reason && <span class="reason">{reason}</span>}
      </div>
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
