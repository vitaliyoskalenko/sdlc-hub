// A sign-off or a return of a gate, saved: checked with the same guard that runs at merge, on main as it is on the
// remote, and only then pushed. The site's action and the plugin's hub_signoff and hub_return both use this.

import { awaitsSignoff, blocks, bugChange, featureDetailsChange, LINK_KINDS, settingsChange, settingsEdit, bugEditChange, estimateChange, guard, guardSettings, validationChange, loadProject, peopleChange, platformsOf, releaseChange, signoffChange, verdictChange, verificationMatrix, type BugEdit, type BugInput, type PeopleEdit, type ReleaseEdit, type VerdictInput, type Change, type FeatureState, type FileSource, type Finding, type Project, type SignoffAction } from "@sdlc-hub/core";
import { Pending, Unchanged, type Save, type Saver } from "./index.ts";

export type SaveOutcome =
  | { ok: true; save: Save }
  | { ok: false; code: "bad-input" | "no-feature" | "not-waiting" | "pending" | "unchanged" | "refused" | "failed"; error: string; findings?: Finding[] };

export interface SignoffInput {
  saver: Saver;
  project: Project;
  state: (slug: string) => FeatureState | undefined;
  user: string;
  slug: unknown;
  step: unknown;
  decision: unknown;
  reason?: unknown;
  /** For a return at the final check: the bugs it sends back. */
  bugs?: unknown;
  /** product-specs as this machine has it, for the checks before anything is fetched. */
  local?: FileSource;
  /** The time the entry records, ISO 8601 without fractions. */
  at: string;
}

class Refused extends Error {
  constructor(readonly findings: Finding[]) {
    super(findings.map((f) => f.reason).join("; "));
  }
}

const SLUG = /^[a-z0-9][a-z0-9-]*$/;

export async function saveSignoff(i: SignoffInput): Promise<SaveOutcome> {
  if (typeof i.slug !== "string" || !SLUG.test(i.slug) || typeof i.step !== "string" || (i.decision !== "pass" && i.decision !== "return"))
    return { ok: false, code: "bad-input", error: "Give slug, step and decision (pass or return)" };
  const reason = typeof i.reason === "string" ? i.reason.trim() : "";
  if (i.decision === "return" && !reason) return { ok: false, code: "bad-input", error: "A return needs a reason" };
  const { slug, step } = { slug: i.slug, step: i.step };
  const bugs = Array.isArray(i.bugs) && i.bugs.every((b) => typeof b === "string" && /^BUG-\d{4,}$/.test(b)) ? (i.bugs as string[]) : undefined;
  if (i.bugs !== undefined && !bugs) return { ok: false, code: "bad-input", error: "Name bugs as BUG-NNNN" };
  const action: SignoffAction = i.decision === "pass" ? { decision: "pass", step } : { decision: "return", step, reason, ...(bugs?.length ? { bugs } : {}) };

  const state = i.state(slug);
  if (!state) return { ok: false, code: "no-feature", error: `There is no feature ${slug}` };
  if (!awaitsSignoff(i.project, state, step)) return { ok: false, code: "not-waiting", error: `${step} of ${slug} does not wait for a sign-off now` };
  // The verify gate: every criterion passes or does not apply on every platform.
  if (step === "verify" && action.decision === "pass" && i.local) {
    const m = verificationMatrix(i.local, slug, platformsOf(i.project.config, state));
    if (!m.complete) return { ok: false, code: "not-waiting", error: m.criteria.length ? `Not every criterion passes yet: ${m.open.slice(0, 6).join("; ")}${m.open.length > 6 ? "; …" : ""}` : `The spec of ${slug} has no criteria to verify` };
  }
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
export async function saveBug(i: BugSaveInput): Promise<SaveOutcome> {
  if (typeof i.slug !== "string" || !SLUG.test(i.slug)) return { ok: false, code: "bad-input", error: "Give the feature's slug" };
  const b = i.bug;
  if (typeof b.title !== "string" || typeof b.team !== "string" || typeof b.severity !== "string") return { ok: false, code: "bad-input", error: "A bug needs a title, a team and a severity" };
  if (b.ac !== undefined && (typeof b.ac !== "string" || !/^AC-\d+[a-z]?$/.test(b.ac))) return { ok: false, code: "bad-input", error: "Write the criterion as AC-NN" };
  if (b.platforms !== undefined && (!Array.isArray(b.platforms) || !b.platforms.every((p) => typeof p === "string" && /^[a-z0-9-]+$/.test(p)))) return { ok: false, code: "bad-input", error: "Give the platforms as a list of names" };
  if (b.body !== undefined && typeof b.body !== "string") return { ok: false, code: "bad-input", error: "The description is text" };
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
export async function savePeople(i: PeopleSaveInput): Promise<SaveOutcome> {
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
    title: `${verb} ${who} on the Team page`,
    meta: { kind: "person", person: who, action: verb.toLowerCase() },
    build: (main, p) => peopleChange(main, p.config, edit),
    fallback: i.project,
  });
}

export interface SettingsSaveInput {
  saver: Saver;
  project: Project;
  user: string;
  edit: unknown;
}

/** Changes .hub/config.yaml from Settings. Only the admin passes the guard, in any guard mode. */
export async function saveSettings(i: SettingsSaveInput): Promise<SaveOutcome> {
  const edit = settingsEdit(i.edit);
  if (typeof edit === "string") return { ok: false, code: "bad-input", error: edit };
  if (!i.project.roles.people.find((p) => p.user === i.user)?.roles.includes("admin")) return { ok: false, code: "refused", error: "Only the admin changes Settings" };
  return checkedSave(i.saver, i.user, {
    label: "settings",
    title: "Change Settings",
    meta: { kind: "settings" },
    build: (main) => {
      const c = settingsChange(main.read(".hub/config.yaml") ?? "", edit);
      if (c === "Nothing to change") throw new Unchanged("Nothing to save: main already has these settings");
      if (typeof c === "string") throw new Error(c);
      return c;
    },
    fallback: i.project,
  });
}

export interface FeatureSaveInput {
  saver: Saver;
  project: Project;
  state: (slug: string) => FeatureState | undefined;
  local: FileSource;
  user: string;
  slug: unknown;
  at: string;
}

/** Checks the slug and returns the feature's state, or why not. */
function feature(i: FeatureSaveInput): { slug: string; state: FeatureState } | SaveOutcome {
  if (typeof i.slug !== "string" || !SLUG.test(i.slug)) return { ok: false, code: "bad-input", error: "Give the feature's slug" };
  const state = i.state(i.slug);
  return state ? { slug: i.slug, state } : { ok: false, code: "no-feature", error: `There is no feature ${i.slug}` };
}
const isOutcome = (x: unknown): x is SaveOutcome => typeof x === "object" && x !== null && "ok" in x;

/** QA's verdicts at verify, appended to hub/verification.yaml. */
export async function saveVerdicts(i: FeatureSaveInput & { verdicts: unknown }): Promise<SaveOutcome> {
  const f = feature(i);
  if (isOutcome(f)) return f;
  if (!Array.isArray(i.verdicts) || !i.verdicts.every((v) => v && typeof v === "object")) return { ok: false, code: "bad-input", error: "Give the verdicts" };
  const verdicts = i.verdicts as VerdictInput[];
  const platforms = platformsOf(i.project.config, f.state);
  try {
    verdictChange(i.local, f.slug, platforms, verdicts, i.user, i.at);
  } catch (e) {
    return { ok: false, code: "bad-input", error: (e as Error).message };
  }
  return checkedSave(i.saver, i.user, {
    label: `verdicts-${f.slug}`,
    title: `Verdicts for ${f.slug}: ${verdicts.map((v) => `${v.ac} ${v.platform} ${v.verdict}`).join(", ")}`.slice(0, 200),
    meta: { kind: "verdicts", slug: f.slug },
    build: (main) => verdictChange(main, f.slug, platforms, verdicts, i.user, i.at),
    fallback: i.project,
  });
}

/** A bug's status, severity, team or title. */
export async function saveBugEdit(i: FeatureSaveInput & { id: unknown; edit: unknown }): Promise<SaveOutcome> {
  const f = feature(i);
  if (isOutcome(f)) return f;
  if (typeof i.id !== "string" || !/^BUG-\d{4,}$/.test(i.id)) return { ok: false, code: "bad-input", error: "Name the bug as BUG-NNNN" };
  const raw = (i.edit ?? {}) as Record<string, unknown>;
  const edit: BugEdit = Object.fromEntries(["status", "severity", "team", "title"].filter((k) => typeof raw[k] === "string").map((k) => [k, raw[k]]));
  if (!Object.keys(edit).length) return { ok: false, code: "bad-input", error: "Change the status, severity, team or title" };
  const id = i.id;
  const teams = i.project.config.teams.map((t) => t.id);
  try {
    bugEditChange(i.local, f.slug, id, edit, teams);
  } catch (e) {
    return { ok: false, code: "bad-input", error: (e as Error).message };
  }
  return checkedSave(i.saver, i.user, {
    label: `bug-${id}`,
    title: `${id} in ${f.slug}: ${Object.entries(edit).map(([k, v]) => `${k} ${v}`).join(", ")}`,
    meta: { kind: "bug", slug: f.slug, bug: id },
    build: (main) => bugEditChange(main, f.slug, id, edit, teams),
    fallback: i.project,
  });
}

/** A field of release.yaml: the smoke check, the checklist and the rollout (Ops), the go or no-go (PM). */
export async function saveRelease(i: FeatureSaveInput & { edit: unknown }): Promise<SaveOutcome> {
  const f = feature(i);
  if (isOutcome(f)) return f;
  const e = (i.edit ?? {}) as Record<string, unknown>;
  const ok =
    (e["kind"] === "smoke" && ["pending", "passed", "failed"].includes(e["value"] as string)) ||
    (e["kind"] === "go" && ["go", "no-go"].includes(e["value"] as string)) ||
    (e["kind"] === "check" && typeof e["item"] === "string" && typeof e["done"] === "boolean") ||
    (e["kind"] === "add-item" && typeof e["item"] === "string") ||
    (e["kind"] === "rollout" && typeof e["stage"] === "number") ||
    (e["kind"] === "version" && typeof e["team"] === "string" && typeof e["value"] === "string");
  if (!ok) return { ok: false, code: "bad-input", error: "Not a release change the site knows" };
  const edit = e as ReleaseEdit;
  try {
    releaseChange(i.local, i.project.flow, f.slug, edit, i.user, i.at);
  } catch (err) {
    return { ok: false, code: "bad-input", error: (err as Error).message };
  }
  const what = edit.kind === "smoke" ? `staging smoke ${edit.value}` : edit.kind === "go" ? edit.value : edit.kind === "rollout" ? `rollout ${edit.stage}%` : edit.kind === "version" ? `${edit.team} version ${edit.value || "cleared"}` : edit.kind === "check" ? `${edit.done ? "done" : "not done"}: ${edit.item}` : `new item: ${edit.item}`;
  return checkedSave(i.saver, i.user, {
    label: `release-${edit.kind}-${f.slug}`,
    title: `Release of ${f.slug}: ${what}`,
    meta: { kind: "release", slug: f.slug, field: edit.kind },
    build: (main, p) => releaseChange(main, p.flow, f.slug, edit, i.user, i.at),
    fallback: i.project,
  });
}

/** The PM's token estimate of a feature, low and high, in millions. */
export async function saveEstimate(i: FeatureSaveInput & { tokensM: unknown }): Promise<SaveOutcome> {
  const f = feature(i);
  if (isOutcome(f)) return f;
  const t = i.tokensM;
  if (!Array.isArray(t) || t.length !== 2 || !t.every((x) => typeof x === "number")) return { ok: false, code: "bad-input", error: "Give the low and the high estimate in millions of tokens" };
  const range = t as [number, number];
  try {
    estimateChange(i.local, f.slug, range);
  } catch (e) {
    return { ok: false, code: "bad-input", error: (e as Error).message };
  }
  return checkedSave(i.saver, i.user, {
    label: `estimate-${f.slug}`,
    title: `Token estimate of ${f.slug}: ${range[0]} to ${range[1]} million`,
    meta: { kind: "estimate", slug: f.slug },
    build: (main) => estimateChange(main, f.slug, range),
    fallback: i.project,
  });
}

/** A validation report, saved as a new file in hub/validation/. */
/** The PM's light edits of a feature: its title and links. */
export async function saveFeatureDetails(i: FeatureSaveInput & { edit: unknown }): Promise<SaveOutcome> {
  const f = feature(i);
  if (isOutcome(f)) return f;
  const e = (i.edit ?? {}) as Record<string, unknown>;
  const links = (e["links"] ?? {}) as Record<string, unknown>;
  const ok =
    (e["title"] === undefined || typeof e["title"] === "string") &&
    !!links && typeof links === "object" &&
    Object.entries(links).every(([k, v]) => (LINK_KINDS as readonly string[]).includes(k) && typeof v === "string") &&
    Object.keys(e).every((k) => k === "title" || k === "links");
  if (!ok) return { ok: false, code: "bad-input", error: "Change the title or the links" };
  const edit = e as { title?: string; links?: Record<string, string> };
  try {
    featureDetailsChange(i.local, f.slug, edit, i.project.config.tracker);
  } catch (err) {
    const msg = (err as Error).message;
    return { ok: false, code: msg === "Nothing to change" ? "unchanged" : "bad-input", error: msg };
  }
  return checkedSave(i.saver, i.user, {
    label: `details-${f.slug}`,
    title: `Details of ${f.slug}`,
    meta: { kind: "details", slug: f.slug },
    build: (main) => featureDetailsChange(main, f.slug, edit, i.project.config.tracker),
    fallback: i.project,
  });
}

export async function saveValidation(i: FeatureSaveInput & { report: unknown }): Promise<SaveOutcome> {
  const f = feature(i);
  if (isOutcome(f)) return f;
  if (typeof i.report !== "string" || !i.report.trim()) return { ok: false, code: "bad-input", error: "The report is empty" };
  const report = i.report;
  return checkedSave(i.saver, i.user, {
    label: `validation-${f.slug}`,
    title: `Validation report of ${f.slug}`,
    meta: { kind: "validation", slug: f.slug },
    build: () => validationChange(f.slug, report, i.at),
    fallback: i.project,
  });
}

/** Builds one change from main of the remote, checks it with the guard as the author, and pushes it. */
/** A file an engine stage left in the checkout: its content now, or absent when the stage deleted it. */
export interface StageFile {
  path: string;
  next?: string;
}

/** The result of an engine stage in product-specs, saved as one merge request in the person's name. */
export async function saveStage(i: FeatureSaveInput & { step: string; files: StageFile[] }): Promise<SaveOutcome> {
  const f = feature(i);
  if (isOutcome(f)) return f;
  if (!i.files.length) return { ok: false, code: "unchanged", error: "Nothing to save" };
  return checkedSave(i.saver, i.user, {
    label: `stage-${i.step}-${f.slug}`,
    title: `${i.step} of ${f.slug}`,
    meta: { kind: "stage", slug: f.slug, step: i.step },
    build: (main) => {
      const changes = i.files.map((x): Change => {
        const base = main.read(x.path);
        return { path: x.path, ...(base !== undefined ? { base } : {}), ...(x.next !== undefined ? { next: x.next } : {}) };
      });
      const changed = changes.filter((c) => c.base !== c.next);
      if (!changed.length) throw new Unchanged("main has these files already");
      return changed;
    },
    fallback: i.project,
  });
}

async function checkedSave(saver: Saver, user: string, o: { label: string; title: string; meta: Record<string, string>; build: (main: FileSource, p: Project) => Change | Change[]; fallback: Project }): Promise<SaveOutcome> {
  try {
    let warned: Finding[] | undefined;
    const save = await saver.save({
      warnings: () => warned,
      user,
      label: o.label,
      title: o.title,
      meta: o.meta,
      build(main) {
        // Judge the change as hub-guard will: by the files on main of the remote, not this checkout.
        const p = loadProject(main).value ?? o.fallback;
        const built = o.build(main, p);
        const changes = Array.isArray(built) ? built : [built];
        const r = guard({ author: user, pushers: [user], changes }, { config: p.config, roles: p.roles, flow: p.flow, feature: (x) => main.read(`docs/features/${x}/hub/feature.yaml`), main });
        // In advisory mode the guard only warns: the save goes ahead and carries the warnings.
        if (blocks(r, guardSettings(p.config).mode)) throw new Refused(r.findings);
        if (!r.ok) warned = r.findings;
        return changes;
      },
    });
    return { ok: true, save };
  } catch (e) {
    if (e instanceof Refused) return { ok: false, code: "refused", error: "hub-guard would refuse this", findings: e.findings };
    if (e instanceof Unchanged) return { ok: false, code: "unchanged", error: e.message };
    if (e instanceof Pending) return { ok: false, code: "pending", error: e.message };
    return { ok: false, code: "failed", error: (e as Error).message };
  }
}
