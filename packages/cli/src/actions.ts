// The site's actions: a sign-off or a return of a gate, through the same save the plugin uses.

import { createSaver, saveBug, saveBugEdit, savePeople, saveRelease, saveSignoff, saveVerdicts, type Save, type SaveOutcome, type SaverOptions } from "@sdlc-hub/save";
import type { ActionHandler } from "@sdlc-hub/server";
import type { BugInput } from "@sdlc-hub/core";

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

const STATUS: Record<Exclude<SaveOutcome, { ok: true }>["code"], number> = { "bad-input": 400, "no-feature": 404, "not-waiting": 409, pending: 409, unchanged: 409, refused: 403, failed: 502 };
const iso = (d: Date) => d.toISOString().replace(/\.\d+Z$/, "Z");

export function actionHandler(o: ActionOptions): ActionHandler {
  const now = o.now ?? (() => new Date());
  const saver = (user: string) => createSaver({ root: o.root, identity: o.identity(user), now, ...(o.pushOptions ? { pushOptions: o.pushOptions } : {}) });

  return {
    async handle(method, path, user, body, ctx) {
      if (method === "GET" && path === "/saves") return { status: 200, body: { saves: saver(user).refresh().filter((s) => s.user === user), enabled: true } };
      if (method !== "POST") return { status: 404, body: { error: "No such action" } };
      const b = (body ?? {}) as Record<string, unknown>;
      const s = saver(user);
      const at = iso(now());
      const feature = { saver: s, project: ctx.project, state: ctx.state, local: ctx.specs, user, slug: b["slug"], at };
      const actions: Record<string, () => SaveOutcome> = {
        "/signoff": () => saveSignoff({ ...feature, step: b["step"], decision: b["decision"], reason: b["reason"], bugs: b["bugs"] }),
        "/person": () => savePeople({ saver: s, project: ctx.project, local: ctx.specs, user, edit: b }),
        "/verdicts": () => saveVerdicts({ ...feature, verdicts: b["verdicts"] }),
        "/bug": () => {
          const state = typeof b["slug"] === "string" ? ctx.state(b["slug"]) : undefined;
          const foundIn = state && ["verify", "autotests", "qa-final"].includes(state.current) ? state.current : undefined;
          return saveBug({ saver: s, project: ctx.project, user, slug: b["slug"], bug: (b["bug"] ?? {}) as Partial<BugInput>, ...(foundIn ? { foundIn } : {}) });
        },
        "/bug-edit": () => saveBugEdit({ ...feature, id: b["id"], edit: b["edit"] }),
        "/release": () => saveRelease({ ...feature, edit: b["edit"] }),
      };
      const act = actions[path];
      if (!act) return { status: 404, body: { error: "No such action" } };
      const r = act();
      if (!r.ok) return { status: STATUS[r.code], body: { error: r.error, ...(r.findings ? { findings: r.findings } : {}) } };
      ctx.emit("saves");
      o.afterPush?.(r.save);
      return { status: 202, body: { save: r.save } };
    },
  };
}
