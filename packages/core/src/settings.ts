// Settings: what the admin changes in .hub/config.yaml from the site. The file keeps its comments and order; the
// result must load, or the edit is refused. Repositories, teams and the engine are not edited here.

import { isMap, isSeq, parseDocument } from "yaml";
import type { Change } from "./access.ts";
import { parseConfig } from "./files.ts";
import { TEAM_KINDS } from "./schema/project.ts";

export type GuardCheck = "files" | "signoffs" | "pushers" | "members";
const CHECKS: GuardCheck[] = ["files", "signoffs", "pushers", "members"];

export interface SettingsEdit {
  headless?: boolean;
  assistants?: { codex?: boolean; cursor?: boolean };
  links?: { confluence?: string; figma?: string };
  guard?: { mode?: "enforce" | "advisory"; checks?: Partial<Record<GuardCheck, boolean>> };
  /** USD per million tokens by model id prefix, over the hub's table; null removes an override. */
  prices?: Record<string, { input: number; cache_write_5m: number; cache_write_1h: number; cache_read: number; output: number } | null>;
  /** A team repository added after install, in the same group or organization. */
  addTeam?: { name: string; repo: string; kind: string };
}

/** A team id from its name, as setup makes it: "Desktop App" is desktop-app. */
export const teamIdOf = (name: string) => name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "team";

const PATH = ".hub/config.yaml";
const PRICE_KEYS = ["input", "cache_write_5m", "cache_write_1h", "cache_read", "output"] as const;
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const bools = (x: unknown, keys: readonly string[], what: string): string | undefined => {
  if (!isObj(x)) return `${what} must be a list of switches`;
  for (const [k, v] of Object.entries(x)) {
    if (!keys.includes(k)) return `${what} has no ${k}`;
    if (typeof v !== "boolean") return `${what}.${k} must be on or off`;
  }
  return undefined;
};

/** Checks an edit that came from the site; the error says what is wrong. */
export function settingsEdit(x: unknown): SettingsEdit | string {
  if (!isObj(x)) return "Send the settings to change";
  for (const k of Object.keys(x)) if (!["headless", "assistants", "links", "guard", "addTeam", "prices"].includes(k)) return `${k} is not changed in Settings`;
  if (x["prices"] !== undefined) {
    if (!isObj(x["prices"])) return "prices must name models";
    for (const [model, p] of Object.entries(x["prices"])) {
      if (!/^[a-z0-9][a-z0-9.-]*$/.test(model)) return `"${model}" is not a model id, such as claude-opus-5-5`;
      if (p === null) continue;
      if (!isObj(p) || !PRICE_KEYS.every((k) => typeof p[k] === "number" && Number.isFinite(p[k]) && (p[k] as number) >= 0) || Object.keys(p).length !== PRICE_KEYS.length)
        return `A price of ${model} needs ${PRICE_KEYS.join(", ")}, each 0 or more, in USD per million tokens`;
    }
  }
  if (x["addTeam"] !== undefined) {
    const t = x["addTeam"];
    if (!isObj(t) || typeof t["name"] !== "string" || !t["name"].trim() || typeof t["repo"] !== "string" || !/^[A-Za-z0-9._-]+$/.test(t["repo"].trim())) return "A new team needs a name and a repository name in the group";
    if (typeof t["kind"] !== "string" || !(TEAM_KINDS as readonly string[]).includes(t["kind"])) return `A team's kind is one of ${TEAM_KINDS.join(", ")}`;
  }
  if (x["headless"] !== undefined && typeof x["headless"] !== "boolean") return "headless must be on or off";
  if (x["assistants"] !== undefined) {
    const e = bools(x["assistants"], ["codex", "cursor"], "assistants");
    if (e) return e;
  }
  if (x["links"] !== undefined) {
    if (!isObj(x["links"])) return "links must name confluence or figma";
    for (const [k, v] of Object.entries(x["links"])) {
      if (!["confluence", "figma"].includes(k)) return `links has no ${k}`;
      if (typeof v !== "string" || (v.trim() && !/^https:\/\/\S+$/.test(v.trim()))) return `The ${k} link must start with https://, or be empty`;
    }
  }
  if (x["guard"] !== undefined) {
    const g = x["guard"];
    if (!isObj(g)) return "guard must have a mode or checks";
    for (const k of Object.keys(g)) if (!["mode", "checks"].includes(k)) return `guard has no ${k}`;
    if (g["mode"] !== undefined && g["mode"] !== "enforce" && g["mode"] !== "advisory") return "guard mode is enforce or advisory";
    if (g["checks"] !== undefined) {
      const e = bools(g["checks"], CHECKS, "guard checks");
      if (e) return e;
    }
  }
  return x as SettingsEdit;
}

/** The new config.yaml for an edit, or why it cannot be made. */
export function settingsChange(base: string, edit: SettingsEdit): Change | string {
  const before = parseConfig(base, PATH).value;
  if (!before) return "config.yaml on main does not load; fix it by hand first";
  const doc = parseDocument(base);
  if (edit.headless !== undefined) doc.setIn(["headless", "enabled"], edit.headless);
  if (edit.assistants) {
    const on = new Set(before.assistants);
    for (const [k, v] of Object.entries(edit.assistants)) v ? on.add(k as "codex" | "cursor") : on.delete(k as "codex" | "cursor");
    const list = (["claude", "codex", "cursor"] as const).filter((a) => on.has(a));
    const node = doc.createNode(list);
    node.flow = true;
    doc.set("assistants", node);
  }
  for (const [k, v] of Object.entries(edit.links ?? {})) {
    if (v?.trim()) doc.setIn(["links", k], v.trim());
    else if (doc.hasIn(["links", k])) doc.deleteIn(["links", k]);
  }
  if (doc.hasIn(["links"]) && !Object.keys((doc.toJS() as { links?: object }).links ?? {}).length) doc.delete("links");
  if (edit.guard?.mode) doc.setIn(["guard", "mode"], edit.guard.mode);
  for (const [k, v] of Object.entries(edit.guard?.checks ?? {})) doc.setIn(["guard", "checks", k], v);
  // No folding: a long flow map such as git: { ... } stays on its line.
  for (const [model, p] of Object.entries(edit.prices ?? {})) {
    if (p) {
      const node = doc.createNode(p);
      if (isMap(node)) node.flow = true;
      doc.setIn(["prices", model], node);
    } else if (doc.hasIn(["prices", model])) doc.deleteIn(["prices", model]);
  }
  const prices = doc.get("prices");
  if (isMap(prices) && !prices.items.length) doc.delete("prices");
  if (edit.addTeam) {
    const team = doc.createNode({ id: teamIdOf(edit.addTeam.name), name: edit.addTeam.name.trim(), repo: `${before.git.namespace}/${edit.addTeam.repo.trim()}`, kind: edit.addTeam.kind });
    const teams = doc.get("teams");
    // In the style of the teams before it: one line each, when they are written so.
    if (isSeq(teams)) {
      if (isMap(teams.items[0]) && teams.items[0].flow && isMap(team)) team.flow = true;
      teams.add(team);
    }
  }
  const next = doc.toString({ lineWidth: 0 });
  const after = parseConfig(next, PATH);
  if (!after.value) return after.issues.map((i) => i.message).join("; ");
  if (JSON.stringify(after.value) === JSON.stringify(before)) return "Nothing to change";
  return { path: PATH, base, next };
}
