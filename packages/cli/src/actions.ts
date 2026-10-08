// What the site saves: a sign-off or a return of a gate. Each one is checked here with the same guard that runs at
// merge, on main as it is on the remote, and only then pushed as a branch whose merge request merges itself.

import { awaitsSignoff, guard, loadProject, signoffChange, type Finding, type SignoffAction } from "@sdlc-hub/core";
import { createSaver, type Save, type SaverOptions } from "@sdlc-hub/save";
import type { ActionHandler } from "@sdlc-hub/server";

export interface ActionOptions {
  /** The product-specs checkout. */
  root: string;
  /** The git identity a person's commits carry. */
  identity: (user: string) => { name: string; email: string };
  pushOptions?: SaverOptions["pushOptions"];
  now?: () => Date;
  /** Called after a push; the demo's stand-in for the git host uses it. */
  afterPush?: (save: Save) => void;
}

class Refused extends Error {
  constructor(readonly findings: Finding[]) {
    super(findings.map((f) => f.reason).join("; "));
  }
}

const SLUG = /^[a-z0-9][a-z0-9-]*$/;
const iso = (d: Date) => d.toISOString().replace(/\.\d+Z$/, "Z");

export function actionHandler(o: ActionOptions): ActionHandler {
  const now = o.now ?? (() => new Date());
  const saver = (user: string) => createSaver({ root: o.root, identity: o.identity(user), now, ...(o.pushOptions ? { pushOptions: o.pushOptions } : {}) });

  return {
    async handle(method, path, user, body, ctx) {
      if (method === "GET" && path === "/saves") return { status: 200, body: { saves: saver(user).refresh().filter((s) => s.user === user), enabled: true } };
      if (method !== "POST" || path !== "/signoff") return { status: 404, body: { error: "No such action" } };

      const b = (body ?? {}) as { slug?: unknown; step?: unknown; decision?: unknown; reason?: unknown };
      if (typeof b.slug !== "string" || !SLUG.test(b.slug) || typeof b.step !== "string" || (b.decision !== "pass" && b.decision !== "return"))
        return { status: 400, body: { error: "Give slug, step and decision (pass or return)" } };
      const reason = typeof b.reason === "string" ? b.reason.trim() : "";
      if (b.decision === "return" && !reason) return { status: 400, body: { error: "A return needs a reason" } };
      const action: SignoffAction = b.decision === "pass" ? { decision: "pass", step: b.step } : { decision: "return", step: b.step, reason };
      const { slug, step } = { slug: b.slug, step: b.step };

      const state = ctx.state(slug);
      if (!state) return { status: 404, body: { error: `There is no feature ${slug}` } };
      if (!awaitsSignoff(ctx.project, state, step)) return { status: 409, body: { error: `${step} of ${slug} does not wait for a sign-off now` } };
      const s = saver(user);
      if (s.list().some((x) => x.state === "pending" && x.user === user && x.meta?.["slug"] === slug && x.meta?.["step"] === step))
        return { status: 409, body: { error: `Your save for ${step} of ${slug} is still waiting to merge` } };

      const title = `${action.decision === "pass" ? "Sign off" : "Return"} ${step} of ${slug}`;
      try {
        const save = s.save({
          user,
          label: `${action.decision === "pass" ? "signoff" : "return"}-${step}-${slug}`,
          title,
          meta: { kind: "signoff", slug, step, decision: action.decision },
          build(main) {
            // Judge the change as hub-guard will: by the files on main of the remote, not this checkout.
            const p = loadProject(main).value ?? ctx.project;
            const change = signoffChange(p, main, slug, user, action, iso(now()));
            const r = guard({ author: user, pushers: [user], changes: [change] }, { config: p.config, roles: p.roles, flow: p.flow, feature: (x) => main.read(`docs/features/${x}/hub/feature.yaml`) });
            if (!r.ok) throw new Refused(r.findings);
            return [change];
          },
        });
        ctx.emit("saves");
        o.afterPush?.(save);
        return { status: 202, body: { save } };
      } catch (e) {
        if (e instanceof Refused) return { status: 403, body: { error: "hub-guard would refuse this", findings: e.findings } };
        return { status: 502, body: { error: (e as Error).message } };
      }
    },
  };
}
