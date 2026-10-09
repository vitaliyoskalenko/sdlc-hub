// The site's actions: a sign-off or a return of a gate, through the same save the plugin uses.

import { createSaver, saveBug, saveBugEdit, saveEstimate, savePeople, saveSettings, saveValidation, saveRelease, saveSignoff, saveVerdicts, type Save, type SaveOutcome, type SaverOptions } from "@sdlc-hub/save";
import type { ActionHandler } from "@sdlc-hub/server";
import type { BugInput } from "@sdlc-hub/core";
import type { HeadlessRun } from "./headless.ts";

export interface ActionOptions {
  /** The product-specs checkout. */
  root: string;
  /** The git identity a person's commits carry. */
  identity: (user: string) => { name: string; email: string };
  pushOptions?: SaverOptions["pushOptions"];
  /** Opens the request after the push where the host takes no push options (GitHub). */
  propose?: SaverOptions["propose"];
  close?: SaverOptions["close"];
  nudge?: SaverOptions["nudge"];
  now?: () => Date;
  /** Called after a push; the demo's stand-in for the git host uses it. */
  afterPush?: (save: Save) => void;
  /** A read-only run of the person's assistant, for validation; only when the admin enabled headless runs. */
  headless?: HeadlessRun;
}

const STATUS: Record<Exclude<SaveOutcome, { ok: true }>["code"], number> = { "bad-input": 400, "no-feature": 404, "not-waiting": 409, pending: 409, unchanged: 409, refused: 403, failed: 502 };
const iso = (d: Date) => d.toISOString().replace(/\.\d+Z$/, "Z");

export function actionHandler(o: ActionOptions): ActionHandler {
  const now = o.now ?? (() => new Date());
  const saver = (user: string) => createSaver({ root: o.root, identity: o.identity(user), now, ...(o.pushOptions ? { pushOptions: o.pushOptions } : {}), ...(o.propose ? { propose: o.propose } : {}), ...(o.close ? { close: o.close } : {}), ...(o.nudge ? { nudge: o.nudge } : {}) });

  /** A read-only validation run, for the PO and the feature's leads, when the admin turned headless runs on. Saves nothing. */
  async function validate(user: string, slug: unknown, ctx: Parameters<ActionHandler["handle"]>[4]) {
    if (!ctx.project.config.headless.enabled) return { status: 409, body: { error: "Headless runs are off. Copy /hub:validate into your assistant, or ask the admin to turn them on." } };
    if (!o.headless) return { status: 409, body: { error: "This site cannot start an assistant" } };
    if (typeof slug !== "string" || !ctx.state(slug)) return { status: 404, body: { error: "There is no such feature" } };
    const person = ctx.project.roles.people.find((p) => p.user === user);
    if (!person || !(person.roles.includes("po") || person.roles.includes("admin") || (person.roles.includes("dev") && person.lead))) return { status: 403, body: { error: "The PO and the team leads run a validation" } };
    const r = await o.headless(o.root, `/hub:validate ${slug}`);
    return r.ok ? { status: 200, body: { report: r.text, ...(r.costUsd !== undefined ? { costUsd: r.costUsd } : {}) } } : { status: 502, body: { error: r.error ?? "The run failed" } };
  }

  return {
    async handle(method, path, user, body, ctx) {
      if (method === "GET" && path === "/saves") {
        const s = saver(user);
        await s.sendQueued();
        await s.nudge();
        return { status: 200, body: { saves: s.refresh().filter((x) => x.user === user), enabled: true } };
      }
      if (method !== "POST") return { status: 404, body: { error: "No such action" } };
      const b = (body ?? {}) as Record<string, unknown>;
      if (path === "/validate") return validate(user, b["slug"], ctx);
      if (path === "/resolve") {
        const choice = b["choice"];
        if (typeof b["branch"] !== "string" || (choice !== "mine" && choice !== "newer")) return { status: 400, body: { error: "Name the save and choose mine or newer" } };
        if (!saver(user).list().some((x) => x.branch === b["branch"] && x.user === user)) return { status: 404, body: { error: "There is no such save of yours" } };
        try {
          const save = await saver(user).resolve(b["branch"], choice);
          ctx.emit("saves");
          if (save) o.afterPush?.(save);
          return { status: 200, body: { save: save ?? null } };
        } catch (e) {
          return { status: 409, body: { error: (e as Error).message } };
        }
      }
      const s = saver(user);
      const at = iso(now());
      const feature = { saver: s, project: ctx.project, state: ctx.state, local: ctx.specs, user, slug: b["slug"], at };
      const actions: Record<string, () => Promise<SaveOutcome>> = {
        "/signoff": () => saveSignoff({ ...feature, step: b["step"], decision: b["decision"], reason: b["reason"], bugs: b["bugs"] }),
        "/person": () => savePeople({ saver: s, project: ctx.project, local: ctx.specs, user, edit: b }),
        "/settings": () => saveSettings({ saver: s, project: ctx.project, user, edit: b["edit"] }),
        "/verdicts": () => saveVerdicts({ ...feature, verdicts: b["verdicts"] }),
        "/bug": () => {
          const state = typeof b["slug"] === "string" ? ctx.state(b["slug"]) : undefined;
          const foundIn = state && ["verify", "autotests", "qa-final"].includes(state.current) ? state.current : undefined;
          return saveBug({ saver: s, project: ctx.project, user, slug: b["slug"], bug: (b["bug"] ?? {}) as Partial<BugInput>, ...(foundIn ? { foundIn } : {}) });
        },
        "/bug-edit": () => saveBugEdit({ ...feature, id: b["id"], edit: b["edit"] }),
        "/release": () => saveRelease({ ...feature, edit: b["edit"] }),
        "/estimate": () => saveEstimate({ ...feature, tokensM: b["tokens_m"] }),
        "/validation": () => saveValidation({ ...feature, report: b["report"] }),
      };
      const act = actions[path];
      if (!act) return { status: 404, body: { error: "No such action" } };
      const r = await act();
      if (!r.ok) return { status: STATUS[r.code], body: { error: r.error, ...(r.findings ? { findings: r.findings } : {}) } };
      ctx.emit("saves");
      o.afterPush?.(r.save);
      return { status: 202, body: { save: r.save } };
    },
  };
}
