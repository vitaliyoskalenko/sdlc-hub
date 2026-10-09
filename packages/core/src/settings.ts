// Settings: what the admin changes in .hub/config.yaml from the site. The file keeps its comments and order; the
// result must load, or the edit is refused. Repositories, teams and the engine are not edited here.

import { parseDocument } from "yaml";
import type { Change } from "./access.ts";
import { parseConfig } from "./files.ts";

export type GuardCheck = "files" | "signoffs" | "pushers" | "members";
const CHECKS: GuardCheck[] = ["files", "signoffs", "pushers", "members"];

export interface SettingsEdit {
  headless?: boolean;
  assistants?: { codex?: boolean; cursor?: boolean };
  links?: { confluence?: string; figma?: string };
  guard?: { mode?: "enforce" | "advisory"; checks?: Partial<Record<GuardCheck, boolean>> };
}

const PATH = ".hub/config.yaml";
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
  for (const k of Object.keys(x)) if (!["headless", "assistants", "links", "guard"].includes(k)) return `${k} is not changed in Settings`;
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
  const next = doc.toString({ lineWidth: 0 });
  const after = parseConfig(next, PATH);
  if (!after.value) return after.issues.map((i) => i.message).join("; ");
  if (JSON.stringify(after.value) === JSON.stringify(before)) return "Nothing to change";
  return { path: PATH, base, next };
}
