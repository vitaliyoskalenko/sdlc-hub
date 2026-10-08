// A sign-off or a return of a gate, saved: checked with the same guard that runs at merge, on main as it is on the
// remote, and only then pushed. The site's action and the plugin's hub_signoff and hub_return both use this.

import { awaitsSignoff, bugChange, guard, loadProject, peopleChange, signoffChange, type BugInput, type PeopleEdit, type Change, type FeatureState, type FileSource, type Finding, type Project, type SignoffAction } from "@sdlc-hub/core";
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

  return checkedSave(i.saver, i.user, {
    label: `${action.decision === "pass" ? "signoff" : "return"}-${step}-${slug}`,
    title: `${action.decision === "pass" ? "Sign off" : "Return"} ${step} of ${slug}`,
    meta: { kind: "signoff", slug, step, decision: action.decision },
    build: (main, p) => signoffChange(p, main, slug, i.user, action, i.at),
    fallback: i.project,
  });
}

export interface BugSaveInput {
  saver: Saver;
  project: Project;
  user: string;
  slug: unknown;
  bug: Partial<BugInput>;
  /** The step QA found it in, usually verify. */
  foundIn?: string;
}

/** Files a bug: `hub/bugs/BUG-NNNN.md` in the feature, through a merge request. */
export function saveBug(i: BugSaveInput): SaveOutcome {
  if (typeof i.slug !== "string" || !SLUG.test(i.slug)) return { ok: false, code: "bad-input", error: "Give the feature's slug" };
  const b = i.bug;
  if (typeof b.title !== "string" || typeof b.team !== "string" || typeof b.severity !== "string") return { ok: false, code: "bad-input", error: "A bug needs a title, a team and a severity" };
  const slug = i.slug;
  const input: BugInput = { title: b.title, team: b.team, severity: b.severity, ...(b.ac ? { ac: b.ac } : {}), ...(b.platforms ? { platforms: b.platforms } : {}), ...(b.body ? { body: b.body } : {}) };
  try {
    bugChange({ read: () => undefined, list: () => [] }, slug, input, i.user, i.foundIn, i.project.config.teams.map((t) => t.id));
  } catch (e) {
    return { ok: false, code: "bad-input", error: (e as Error).message };
  }
  return checkedSave(i.saver, i.user, {
    label: `bug-${slug}`,
    title: `Bug in ${slug}: ${input.title.trim()}`,
    meta: { kind: "bug", slug },
    build: (main, p) => bugChange(main, slug, input, i.user, i.foundIn, p.config.teams.map((t) => t.id)),
    fallback: i.project,
  });
}

export interface PeopleSaveInput {
  saver: Saver;
  project: Project;
  /** product-specs as this machine has it, to refuse a bad edit before anything is fetched. */
  local: FileSource;
  user: string;
  /** The request: { kind: "set", person } or { kind: "remove", user }. */
  edit: unknown;
}

const OS = ["macos", "linux", "windows"];
const ASSISTANTS = ["claude", "codex", "cursor"];

/** The edit a request asks for, or why it is not one. */
function peopleEdit(x: unknown): PeopleEdit | string {
  const b = (x ?? {}) as Record<string, unknown>;
  if (b["kind"] === "remove") return typeof b["user"] === "string" ? { kind: "remove", user: b["user"] } : "Name the person to remove";
  if (b["kind"] !== "set") return "Give kind: set or remove";
  const p = (b["person"] ?? {}) as Record<string, unknown>;
  const str = (k: string) => (typeof p[k] === "string" && (p[k] as string).trim() ? (p[k] as string).trim() : undefined);
  const user = str("user");
  const name = str("name");
  const roles = Array.isArray(p["roles"]) && p["roles"].every((r) => typeof r === "string") ? (p["roles"] as string[]) : undefined;
  if (!user || !name || !roles?.length) return "A person needs a username, a name and at least one role";
  const os = str("os");
  const assistant = str("assistant");
  if (os && !OS.includes(os)) return `The system is one of ${OS.join(", ")}`;
  if (assistant && !ASSISTANTS.includes(assistant)) return `The assistant is one of ${ASSISTANTS.join(", ")}`;
  const team = str("team");
  return {
    kind: "set",
    person: { user, name, roles, ...(team ? { team } : {}), ...(p["lead"] === true ? { lead: true } : {}), ...(os ? { os: os as "macos" } : {}), ...(assistant ? { assistant: assistant as "claude" } : {}) },
  };
}

/** Adds, changes or removes a person in .hub/roles.yaml. Only the admin passes the guard. */
export function savePeople(i: PeopleSaveInput): SaveOutcome {
  const edit = peopleEdit(i.edit);
  if (typeof edit === "string") return { ok: false, code: "bad-input", error: edit };
  try {
    peopleChange(i.local, i.project.config, edit);
  } catch (e) {
    return { ok: false, code: "bad-input", error: (e as Error).message };
  }
  const who = edit.kind === "set" ? edit.person.user : edit.user;
  const isNew = edit.kind === "set" && !i.project.roles.people.some((p) => p.user === who);
  const verb = edit.kind === "remove" ? "Remove" : isNew ? "Add" : "Change";
  return checkedSave(i.saver, i.user, {
    label: `people-${verb.toLowerCase()}-${who}`,
    title: `${verb} ${who} on People and roles`,
    meta: { kind: "person", person: who, action: verb.toLowerCase() },
    build: (main, p) => peopleChange(main, p.config, edit),
    fallback: i.project,
  });
}

/** Builds one change from main of the remote, checks it with the guard as the author, and pushes it. */
function checkedSave(saver: Saver, user: string, o: { label: string; title: string; meta: Record<string, string>; build: (main: FileSource, p: Project) => Change; fallback: Project }): SaveOutcome {
  try {
    const save = saver.save({
      user,
      label: o.label,
      title: o.title,
      meta: o.meta,
      build(main) {
        // Judge the change as hub-guard will: by the files on main of the remote, not this checkout.
        const p = loadProject(main).value ?? o.fallback;
        const change = o.build(main, p);
        const r = guard({ author: user, pushers: [user], changes: [change] }, { config: p.config, roles: p.roles, flow: p.flow, feature: (x) => main.read(`docs/features/${x}/hub/feature.yaml`) });
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
