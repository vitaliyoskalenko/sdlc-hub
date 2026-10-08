// The site's actions: a sign-off or a return of a gate, through the same save the plugin uses.

import { createSaver, saveSignoff, type Save, type SaveOutcome, type SaverOptions } from "@sdlc-hub/save";
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

const STATUS: Record<Exclude<SaveOutcome, { ok: true }>["code"], number> = { "bad-input": 400, "no-feature": 404, "not-waiting": 409, pending: 409, refused: 403, failed: 502 };
const iso = (d: Date) => d.toISOString().replace(/\.\d+Z$/, "Z");

export function actionHandler(o: ActionOptions): ActionHandler {
  const now = o.now ?? (() => new Date());
  const saver = (user: string) => createSaver({ root: o.root, identity: o.identity(user), now, ...(o.pushOptions ? { pushOptions: o.pushOptions } : {}) });

  return {
    async handle(method, path, user, body, ctx) {
      if (method === "GET" && path === "/saves") return { status: 200, body: { saves: saver(user).refresh().filter((s) => s.user === user), enabled: true } };
      if (method !== "POST" || path !== "/signoff") return { status: 404, body: { error: "No such action" } };
      const b = (body ?? {}) as Record<string, unknown>;
      const r = saveSignoff({ saver: saver(user), project: ctx.project, state: ctx.state, user, slug: b["slug"], step: b["step"], decision: b["decision"], reason: b["reason"], at: iso(now()) });
      if (!r.ok) return { status: STATUS[r.code], body: { error: r.error, ...(r.findings ? { findings: r.findings } : {}) } };
      ctx.emit("saves");
      o.afterPush?.(r.save);
      return { status: 202, body: { save: r.save } };
    },
  };
}
