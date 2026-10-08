// A sign-off or a return of a gate, saved: checked with the same guard that runs at merge, on main as it is on the
// remote, and only then pushed. The site's action and the plugin's hub_signoff and hub_return both use this.

import { awaitsSignoff, guard, loadProject, signoffChange, type FeatureState, type Finding, type Project, type SignoffAction } from "@sdlc-hub/core";
import type { Save, Saver } from "./index.ts";

export type SaveOutcome =
  | { ok: true; save: Save }
  | { ok: false; code: "bad-input" | "no-feature" | "not-waiting" | "pending" | "refused" | "failed"; error: string; findings?: Finding[] };

export interface SignoffInput {
  saver: Saver;
  project: Project;
  state: (slug: string) => FeatureState | undefined;
  user: string;
  slug: unknown;
  step: unknown;
  decision: unknown;
  reason?: unknown;
  /** The time the entry records, ISO 8601 without fractions. */
  at: string;
}

class Refused extends Error {
  constructor(readonly findings: Finding[]) {
    super(findings.map((f) => f.reason).join("; "));
  }
}

const SLUG = /^[a-z0-9][a-z0-9-]*$/;

export function saveSignoff(i: SignoffInput): SaveOutcome {
  if (typeof i.slug !== "string" || !SLUG.test(i.slug) || typeof i.step !== "string" || (i.decision !== "pass" && i.decision !== "return"))
    return { ok: false, code: "bad-input", error: "Give slug, step and decision (pass or return)" };
  const reason = typeof i.reason === "string" ? i.reason.trim() : "";
  if (i.decision === "return" && !reason) return { ok: false, code: "bad-input", error: "A return needs a reason" };
  const { slug, step } = { slug: i.slug, step: i.step };
  const action: SignoffAction = i.decision === "pass" ? { decision: "pass", step } : { decision: "return", step, reason };

  const state = i.state(slug);
  if (!state) return { ok: false, code: "no-feature", error: `There is no feature ${slug}` };
  if (!awaitsSignoff(i.project, state, step)) return { ok: false, code: "not-waiting", error: `${step} of ${slug} does not wait for a sign-off now` };
  if (i.saver.list().some((x) => x.state === "pending" && x.user === i.user && x.meta?.["slug"] === slug && x.meta?.["step"] === step))
    return { ok: false, code: "pending", error: `Your save for ${step} of ${slug} is still waiting to merge` };

  try {
    const save = i.saver.save({
      user: i.user,
      label: `${action.decision === "pass" ? "signoff" : "return"}-${step}-${slug}`,
      title: `${action.decision === "pass" ? "Sign off" : "Return"} ${step} of ${slug}`,
      meta: { kind: "signoff", slug, step, decision: action.decision },
      build(main) {
        // Judge the change as hub-guard will: by the files on main of the remote, not this checkout.
        const p = loadProject(main).value ?? i.project;
        const change = signoffChange(p, main, slug, i.user, action, i.at);
        const r = guard({ author: i.user, pushers: [i.user], changes: [change] }, { config: p.config, roles: p.roles, flow: p.flow, feature: (x) => main.read(`docs/features/${x}/hub/feature.yaml`) });
        if (!r.ok) throw new Refused(r.findings);
        return [change];
      },
    });
    return { ok: true, save };
  } catch (e) {
    if (e instanceof Refused) return { ok: false, code: "refused", error: "hub-guard would refuse this", findings: e.findings };
    return { ok: false, code: "failed", error: (e as Error).message };
  }
}
