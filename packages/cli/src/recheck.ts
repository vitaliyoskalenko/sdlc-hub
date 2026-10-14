// hub recheck: after .hub/ changes on main (a person's role, the guard settings), every open merge request into main
// is judged again by the new rules. A guard result that passed under the old roles is not left to merge.
// - GitLab: a job on main runs the hub-guard job of each open merge request again, in its latest pipeline, with
//   HUB_RECHECK_TOKEN (api, a protected variable: merge request pipelines never see it). Not a new pipeline: the
//   token's bot cannot read the CI configuration in hub-ci, so a pipeline it starts fails before any job runs.
// - GitHub: a workflow on main runs the hub-guard job of each open pull request again (its check run has the job's id).

import { GitHub, GitLab } from "@sdlc-hub/host";
import type { Line } from "@sdlc-hub/save";

export async function recheckGitLab(o: { gl: GitLab; project: string | number; target?: string }): Promise<{ ok: boolean; lines: Line[] }> {
  const lines: Line[] = [];
  const open = await o.gl.mergeRequestsInto(o.project, o.target ?? "main");
  for (const mr of open)
    try {
      const latest = (await o.gl.mergeRequestPipelines(o.project, mr.iid))[0];
      const job = latest ? (await o.gl.pipelineJobs(o.project, latest.id)).find((j) => j.name === "hub-guard") : undefined;
      if (!job) {
        lines.push({ ok: true, text: `!${mr.iid}: no hub-guard job in its latest pipeline; it runs when the merge request's pipeline runs again`, blocking: false });
        continue;
      }
      await o.gl.retryJob(o.project, job.id);
      lines.push({ ok: true, text: `!${mr.iid}: hub-guard runs again` });
    } catch (e) {
      lines.push({ ok: false, text: `!${mr.iid}: ${(e as Error).message.split("\n")[0]}`, blocking: false });
    }
  if (!open.length) lines.push({ ok: true, text: "No open merge request into main" });
  return { ok: true, lines };
}

export async function recheckGitHub(o: { gh: GitHub; owner: string; repo: string; base?: string }): Promise<{ ok: boolean; lines: Line[] }> {
  const lines: Line[] = [];
  const open = await o.gh.pullsInto(o.owner, o.repo, o.base ?? "main");
  for (const pr of open) {
    const run = (await o.gh.checkRuns(o.owner, o.repo, pr.head.sha, "hub-guard"))[0];
    if (!run) {
      lines.push({ ok: true, text: `#${pr.number}: no hub-guard check yet`, blocking: false });
      continue;
    }
    try {
      await o.gh.rerunJob(o.owner, o.repo, run.id);
      lines.push({ ok: true, text: `#${pr.number}: hub-guard runs again` });
    } catch (e) {
      lines.push({ ok: false, text: `#${pr.number}: ${(e as Error).message.split("\n")[0]}`, blocking: false });
    }
  }
  if (!open.length) lines.push({ ok: true, text: "No open pull request into main" });
  return { ok: true, lines };
}
