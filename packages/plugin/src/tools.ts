// The hub tools the plugin's skills call through MCP. Each answers in plain text the assistant can show as it is.
// They read the product-specs checkout directly and save through the same code as the site: a branch whose merge
// request merges itself when hub-guard passes.

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { checkChange, detectFeature, listFeatures, nextFor, parseSignoffs, platformsOf, releaseView, verificationMatrix, type FeatureState, type Project, type StepPlan } from "@sdlc-hub/core";
import type { OpenProject } from "@sdlc-hub/git";
import { localTests, saveBug, saveRelease, saveSignoff, saveStage, saveValidation, saveVerdicts, type Save, type SaveOutcome, type Saver } from "@sdlc-hub/save";

export type Assistant = "claude" | "codex" | "cursor";

export interface ToolContext {
  /** Opens product-specs again: the files may have changed since the last call. */
  open: () => OpenProject;
  /** The roles.yaml user of this machine's git identity. */
  user: () => string | undefined;
  assistant: Assistant;
  saver: (user: string) => Saver;
  now: () => Date;
  /** Records a stage event for hub-state (queued on the machine, pushed when it can be). */
  record?: (slug: string, e: { step: string; event: "started" | "finished"; role: string; assistant: Assistant; at: string }) => void;
}

export interface ToolResult {
  text: string;
  isError?: boolean;
}

const hubCmd = (a: Assistant, cmd: string, rest = "") => (a === "claude" ? `/hub:${cmd}` : a === "codex" ? `$hub-${cmd}` : `/hub-${cmd}`) + (rest ? ` ${rest}` : "");
const iso = (d: Date) => d.toISOString().replace(/\.\d+Z$/, "Z");
const fail = (text: string): ToolResult => ({ text, isError: true });
/** Ends a sentence once: a name such as "Olena K." already ends with a full stop. */
const end = (s: string) => (s.endsWith(".") ? s : `${s}.`);

interface Loaded {
  project: Project;
  open: OpenProject;
  user: string;
  state: (slug: string) => FeatureState | undefined;
  names: (users: string[]) => string;
}

function load(ctx: ToolContext): Loaded | ToolResult {
  const open = ctx.open();
  if (!open.project) return fail(`The hub files in .hub/ do not load:\n${open.issues.map((i) => `- ${i.file}${i.line ? `:${i.line}` : ""}: ${i.message}`).join("\n")}`);
  const project = open.project;
  const user = ctx.user();
  if (!user) return fail("Your git identity matches nobody in .hub/roles.yaml. Ask the admin to add you, or check git config user.email.");
  const slugs = new Set(listFeatures(open.view.specs));
  const cache = new Map<string, FeatureState>();
  const state = (slug: string) => {
    if (!slugs.has(slug)) return undefined;
    if (!cache.has(slug)) cache.set(slug, detectFeature(project, open.view, slug));
    return cache.get(slug);
  };
  const names = (users: string[]) => users.map((u) => project.roles.people.find((p) => p.user === u)?.name ?? u).join(", ");
  return { project, open, user, state, names };
}

const isResult = (x: Loaded | ToolResult): x is ToolResult => "text" in x;

function featureOrList(l: Loaded, slug: string | undefined): FeatureState | ToolResult {
  const all = listFeatures(l.open.view.specs);
  if (!slug) return fail(`Name the feature. The features are: ${all.join(", ") || "none yet"}.`);
  return l.state(slug) ?? fail(`There is no feature ${slug}. The features are: ${all.join(", ") || "none yet"}.`);
}

function stepLine(l: Loaded, s: FeatureState): string {
  if (s.current === "released") return "released";
  const i = l.project.flow.steps.findIndex((x) => x.id === s.current);
  const st = s.steps.find((x) => x.id === s.current)!;
  const label: Record<string, string> = { signoff: "waiting for sign-off", ready: "ready to start", todo: "not started", running: "running", returned: "returned", blocked: "blocked", missed: "missed" };
  const who = st.waitingOn?.length ? `, waiting on ${l.names(st.waitingOn)}` : st.by ? `, by ${l.names([st.by])}` : "";
  return `step ${i + 1} of ${l.project.flow.steps.length}, ${s.current}: ${label[st.status] ?? st.status}${who}`;
}

function planText(ctx: ToolContext, l: Loaded, s: FeatureState, plan: StepPlan): string {
  const slug = s.slug;
  switch (plan.kind) {
    case "released":
      return `${slug} is released. Nothing is left to run.`;
    case "unknown-step":
      return `There is no step ${plan.step}. The steps are: ${l.project.flow.steps.map((x) => x.id).join(", ")}.`;
    case "done":
    case "skipped":
      return `${plan.step} of ${slug} is ${plan.kind === "done" ? "done" : "skipped on this route"}.`;
    case "not-yours": {
      const person = l.project.roles.people.find((p) => p.user === l.user);
      return `${plan.step} of ${slug} is not yours: it belongs to ${plan.role}${plan.waitingOn.length ? ` (${l.names(plan.waitingOn)})` : ""}. You are ${person?.roles.join(", ")}.`;
    }
    case "waiting":
      return `${plan.step} of ${slug} cannot start yet. It waits for: ${plan.on.map((x) => `${x.step} (${x.status})`).join(", ")}.`;
    case "signoff":
      return `The evidence for ${plan.step} of ${slug} is there and the gate waits for you. Ask the person to confirm, then call hub_signoff, or hub_return with a reason. (${hubCmd(ctx.assistant, "signoff", `${plan.step} ${slug}`)})`;
    case "hub-step":
      return `${plan.step} of ${slug} is a hub step with no engine stage (${plan.status}). Its result is recorded on the site or with the matching hub command.`;
    case "run": {
      const invoke = l.project.engine.invoke[ctx.assistant];
      const commands = plan.stages.map((stage) => invoke.replace("{stage}", stage).replace("{slug}", slug));
      const where = plan.where === "specs" ? "Run it here, in product-specs." : plan.where === "contract" ? `Run it in the repository of the team that publishes the API contract${s.contractTeam ? ` (${s.contractTeam})` : ""}.` : "Run it in each team repository of the feature.";
      const template = l.open.view.specs.read(`.hub/prompts/${plan.step}.md`);
      // A prompt template is plain Markdown; these placeholders are filled in, anything else stays as written.
      const fill: Record<string, string> = { slug, title: s.title ?? slug, step: plan.step, route: s.route, size: s.size ?? "not set" };
      const prompt = template?.replace(/\{(slug|title|step|route|size)\}/g, (_, k: string) => fill[k]!).trim();
      return [
        `${plan.returned ? "The step came back: run it again." : plan.running ? "The step is already running; continue it." : `Next for you in ${slug}: ${plan.step}.`} ${where}`,
        "",
        "Run this engine command unchanged:",
        ...commands.map((c) => `  ${c}`),
        ...(prompt ? ["", "With this from the hub's prompt template:", prompt] : []),
        ...(plan.thenSignoff ? ["", `When it is done, the gate needs your sign-off: ${hubCmd(ctx.assistant, "signoff", `${plan.step} ${slug}`)}.`] : []),
      ].join("\n");
    }
  }
}

function outcomeText(r: SaveOutcome, what: string): ToolResult {
  if (r.ok) return { text: `${what} is saved as ${r.save.mr ? `merge request !${r.save.mr.iid} (${r.save.mr.url})` : `branch ${r.save.branch}`}. It merges by itself when hub-guard passes.` };
  return fail([r.error, ...(r.findings ?? []).map((f) => `- ${f.path}${f.line ? `:${f.line}` : ""}: ${f.reason}`)].join("\n"));
}

export function hubStatus(ctx: ToolContext, slug?: string): ToolResult {
  const l = load(ctx);
  if (isResult(l)) return l;
  if (slug) {
    const s = featureOrList(l, slug);
    if ("text" in s) return s;
    const lines = [end(`${s.title ?? slug} (${slug}), size ${s.size ?? "not set"}, route ${s.route}: ${stepLine(l, s)}`)];
    const cur = s.steps.find((x) => x.id === s.current);
    if (cur?.reason) lines.push(`Why: ${cur.reason}`);
    for (const w of s.waits.filter((x) => !x.done)) lines.push(`${w.team}:${w.task} waits for ${w.on}.`);
    if (s.blockingBugs.length) lines.push(`Blocking bugs: ${s.blockingBugs.join(", ")}.`);
    if (s.current !== "released") lines.push(`For you: ${planText(ctx, l, s, nextFor(l.project, s, l.user)).split("\n")[0]}`);
    return { text: lines.join("\n") };
  }
  const all = listFeatures(l.open.view.specs).map((x) => l.state(x)!);
  if (!all.length) return { text: "There are no features yet." };
  const mine = all.filter((s) => s.current !== "released" && (s.steps.find((x) => x.id === s.current)?.waitingOn ?? []).includes(l.user));
  return {
    text: [
      ...all.map((s) => `- ${s.slug}: ${stepLine(l, s)}`),
      "",
      mine.length ? `Waiting for you: ${mine.map((s) => `${s.slug} (${s.current})`).join(", ")}.` : "Nothing is waiting for you.",
    ].join("\n"),
  };
}

export function hubNext(ctx: ToolContext, slug?: string, step?: string): ToolResult {
  const l = load(ctx);
  if (isResult(l)) return l;
  if (!slug) {
    // Without a feature: the first one that waits for this person.
    const all = listFeatures(l.open.view.specs).map((x) => l.state(x)!);
    const mine = all.find((s) => s.current !== "released" && (s.steps.find((x) => x.id === s.current)?.waitingOn ?? []).includes(l.user));
    if (!mine) return { text: `Nothing waits for you right now. Name a feature to see its next step: ${all.map((s) => s.slug).join(", ")}.` };
    const plan = nextFor(l.project, mine, l.user);
    started(ctx, l, mine.slug, plan);
    return { text: planText(ctx, l, mine, plan) };
  }
  const s = featureOrList(l, slug);
  if ("text" in s) return s;
  const plan = nextFor(l.project, s, l.user, step);
  started(ctx, l, s.slug, plan);
  const ok = plan.kind === "run" || plan.kind === "signoff";
  return { text: planText(ctx, l, s, plan), ...(ok ? {} : { isError: true }) };
}

/** A stage handed out to run starts now, unless it is running already. A failure to record never stops the work. */
function started(ctx: ToolContext, l: Loaded, slug: string, plan: StepPlan) {
  if (plan.kind !== "run" || plan.running || !ctx.record) return;
  const role = l.project.flow.steps.find((x) => x.id === plan.step)?.role ?? "";
  try {
    ctx.record(slug, { step: plan.step, event: "started", role, assistant: ctx.assistant, at: iso(ctx.now()) });
  } catch {
    /* the site shows the step as ready instead of running */
  }
}

/** The stage the person ran has finished: recorded for the Running status and lead time. */
/** The files changed in the checkout since its last commit: what an engine stage left there. */
function changedFiles(root: string): { path: string; next?: string; base?: string }[] {
  const out = execFileSync("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"], { cwd: root, encoding: "utf8" });
  const parts = out.split("\0").filter(Boolean);
  const files: { path: string; next?: string; base?: string }[] = [];
  for (let i = 0; i < parts.length; i++) {
    const code = parts[i]!.slice(0, 2);
    const path = parts[i]!.slice(3);
    // A rename lists the old path next; both count.
    const paths = /R|C/.test(code) ? [path, parts[++i]!] : [path];
    for (const p of paths) {
      const base = spawnSync("git", ["show", `HEAD:${p}`], { cwd: root, encoding: "utf8" });
      const next = existsSync(join(root, p)) ? readFileSync(join(root, p), "utf8") : undefined;
      files.push({ path: p, ...(base.status === 0 ? { base: base.stdout } : {}), ...(next !== undefined ? { next } : {}) });
    }
  }
  return files;
}

/**
 * The stage has run to its end: records the event, then saves what the stage left in this checkout as one merge
 * request in the person's name, the files their role may change. A stage run in a team repository leaves nothing
 * here; the team's own merge request carries it.
 */
export async function hubRecord(ctx: ToolContext, slug: string, step: string): Promise<ToolResult> {
  const l = load(ctx);
  if (isResult(l)) return l;
  const s = featureOrList(l, slug);
  if ("text" in s) return s;
  const flowStep = l.project.flow.steps.find((x) => x.id === step);
  if (!flowStep) return fail(`There is no step ${step}.`);
  let done = `Recorded: ${step} of ${slug} finished.`;
  try {
    ctx.record?.(slug, { step, event: "finished", role: flowStep.role, assistant: ctx.assistant, at: iso(ctx.now()) });
  } catch (e) {
    done = `Could not record that ${step} of ${slug} finished: ${(e as Error).message}.`;
  }
  const access = { config: l.project.config, roles: l.project.roles };
  const files = changedFiles(l.open.root);
  const mine = files.filter((f) => checkChange(l.user, f, access).ok);
  const others = files.filter((f) => !mine.includes(f)).map((f) => f.path);
  const notMine = others.length ? `\nNot saved, because your role may not change them: ${others.join(", ")}.` : "";
  if (!mine.length) return { text: `${done} No file of yours changed here, so there is nothing to save.${notMine}` };
  const r = await saveStage({ saver: ctx.saver(l.user), project: l.project, state: l.state, local: l.open.view.specs, user: l.user, slug, step, at: iso(ctx.now()), files: mine.map(({ path, next }) => ({ path, ...(next !== undefined ? { next } : {}) })) });
  if (!r.ok && r.code === "unchanged") return { text: `${done} main has these files already, so there is nothing to save.${notMine}` };
  if (!r.ok) return fail(`${done} The files were not saved: ${outcomeText(r, "").text}${notMine}`);
  const where = r.save.mr ? `merge request !${r.save.mr.iid} (${r.save.mr.url})` : `branch ${r.save.branch}`;
  return { text: `${done} Saved ${mine.length} file${mine.length === 1 ? "" : "s"} as ${where}. It merges by itself when hub-guard passes.${notMine}` };
}

export async function hubSignoff(ctx: ToolContext, step: string, slug: string, decision: "pass" | "return", reason?: string): Promise<ToolResult> {
  const l = load(ctx);
  if (isResult(l)) return l;
  const r = await saveSignoff({ saver: ctx.saver(l.user), project: l.project, state: l.state, user: l.user, slug, step, decision, reason, at: iso(ctx.now()) });
  return outcomeText(r, decision === "pass" ? `Your sign-off of ${step}` : `Your return of ${step}`);
}

export interface BugArgs {
  slug: string;
  title: string;
  team: string;
  severity: string;
  ac?: string;
  platforms?: string[];
  body?: string;
}

export async function hubBug(ctx: ToolContext, a: BugArgs): Promise<ToolResult> {
  const l = load(ctx);
  if (isResult(l)) return l;
  const s = l.state(a.slug);
  if (!s) return featureOrList(l, a.slug) as ToolResult;
  const foundIn = ["verify", "qa-final", "autotests"].includes(s.current) ? s.current : undefined;
  const r = await saveBug({ saver: ctx.saver(l.user), project: l.project, user: l.user, slug: a.slug, bug: a, ...(foundIn ? { foundIn } : {}) });
  return outcomeText(r, `The bug "${a.title}"`);
}

/** My saves that are not merged yet. */
export function hubSaves(ctx: ToolContext): Save[] {
  const user = ctx.user();
  return user ? ctx.saver(user).refresh().filter((s) => s.user === user && s.state !== "merged") : [];
}

/** What a new assistant session is told: who the person is and what waits for them. Never fails the session. */
export function sessionContext(ctx: ToolContext): string {
  try {
    const l = load(ctx);
    if (isResult(l)) return `SDLC Hub: ${l.text.split("\n")[0]}`;
    const person = l.project.roles.people.find((p) => p.user === l.user)!;
    const all = listFeatures(l.open.view.specs).map((x) => l.state(x)!);
    const mine = all.filter((s) => s.current !== "released" && (s.steps.find((x) => x.id === s.current)?.waitingOn ?? []).includes(l.user));
    return [
      `SDLC Hub: this is ${l.project.config.project.name}'s product-specs. The person is ${person.name} (${person.user}), role ${person.roles.join(", ")}${person.team ? `, team ${person.team}` : ""}.`,
      mine.length ? `Waiting for them: ${mine.map((s) => `${s.slug} (${s.current})`).join(", ")}.` : "Nothing waits for them right now.",
      `Use ${hubCmd(ctx.assistant, "status")} to see every feature and ${hubCmd(ctx.assistant, "next")} to run their next step. Never edit hub files (.hub/, hub/, signoffs.yaml) by hand: the hub tools save them through merge requests.`,
    ].join("\n");
  } catch (e) {
    return `SDLC Hub could not read the project: ${(e as Error).message}`;
  }
}

/** QA's view of a feature: the verdicts still open, the bugs, the latest CI run per team, and the decisions. */
export function hubQa(ctx: ToolContext, slug: string): ToolResult {
  const l = load(ctx);
  if (isResult(l)) return l;
  const s = featureOrList(l, slug);
  if ("text" in s) return s;
  const m = verificationMatrix(l.open.view.specs, slug, platformsOf(l.project.config, s));
  const signoffs = parseSignoffs(l.open.view.specs.read(`docs/features/${slug}/hub/signoffs.yaml`) ?? "[]", "signoffs.yaml").value ?? [];
  const runs = s.teams.map((t) => ({ team: t.id, run: s.testRuns.filter((r) => r.team === t.id && r.source === "ci").sort((a, b) => (a.at < b.at ? -1 : 1)).at(-1) }));
  const step = (id: string) => s.steps.find((x) => x.id === id)?.status ?? "todo";
  return {
    text: [
      `${slug}, cycle ${s.cycle}: verify ${step("verify")}, autotests ${step("autotests")}, qa-final ${step("qa-final")}.`,
      `Criteria on ${m.platforms.join(", ")}: ${m.criteria.length} criteria, ${m.complete ? "every one passes or does not apply" : `open: ${m.open.join("; ") || "none recorded"}`}.`,
      ...m.criteria.map((c) => `- ${c.id} ${c.text} | ${m.platforms.map((p) => `${p}: ${c.cells[p]?.verdict ?? "—"}${c.cells[p]?.bugs?.length ? ` (${c.cells[p]!.bugs!.join(", ")})` : ""}`).join(", ")}`),
      `Bugs: ${s.bugs.length ? s.bugs.map((b) => `${b.id} ${b.severity} ${b.status} (${b.team}${b.ac ? `, ${b.ac}` : ""}): ${b.title}`).join("; ") : "none"}.`,
      `Latest CI: ${runs.map((r) => `${r.team} ${r.run?.result ?? "no run"}`).join(", ")}. Only CI runs count for autotests.`,
      `Final decisions: ${signoffs.filter((e) => e.step === "qa-final").map((e) => `${e.decision} by ${e.user} ${e.at.slice(0, 10)}${e.reason ? ` (${e.reason})` : ""}`).join("; ") || "none"}.`,
    ].join("\n"),
  };
}

export async function hubVerdicts(ctx: ToolContext, slug: string, verdicts: { ac: string; platform: string; verdict: "pass" | "fail" | "na"; bugs?: string[] }[]): Promise<ToolResult> {
  const l = load(ctx);
  if (isResult(l)) return l;
  const r = await saveVerdicts({ saver: ctx.saver(l.user), project: l.project, state: l.state, local: l.open.view.specs, user: l.user, slug, verdicts, at: iso(ctx.now()) });
  return outcomeText(r, `${verdicts.length} verdict${verdicts.length === 1 ? "" : "s"} for ${slug}`);
}

/** The QA decision at the final check: pass to release, or return to verify with the reason and the bugs. */
export async function hubDecide(ctx: ToolContext, slug: string, decision: "pass" | "return", reason?: string, bugs?: string[]): Promise<ToolResult> {
  const l = load(ctx);
  if (isResult(l)) return l;
  const r = await saveSignoff({ saver: ctx.saver(l.user), project: l.project, state: l.state, local: l.open.view.specs, user: l.user, slug, step: "qa-final", decision, reason, ...(bugs?.length ? { bugs } : {}), at: iso(ctx.now()) });
  return outcomeText(r, decision === "pass" ? `Your decision to pass ${slug} to release` : `Your return of ${slug} to verify`);
}

/** The release as it stands: staging, acceptance and the go, the checklist, the rollout and the watch period. */
export function hubRelease(ctx: ToolContext, slug: string): ToolResult {
  const l = load(ctx);
  if (isResult(l)) return l;
  const s = featureOrList(l, slug);
  if ("text" in s) return s;
  const r = releaseView(l.open.view.specs, l.project.flow, slug);
  const step = (id: string) => s.steps.find((x) => x.id === id)?.status ?? "todo";
  return {
    text: [
      `${slug}: staging ${step("staging")}, accept ${step("accept")}, release ${step("release")}.`,
      `Smoke check on staging: ${r.staging?.smoke ?? "not run"}. Go or no-go: ${r.go ? `${r.go.value} by ${r.go.user}` : "not given"}.`,
      "Checklist:",
      ...r.checklist.map((c, i) => `${i + 1}. [${c.done ? "x" : " "}] ${c.item}`),
      `Rollout: ${r.rollout?.stage ?? 0}%.${r.watch ? ` Watch period: ${r.watch.days} days from ${r.watch.started.slice(0, 10)}.` : ` The watch period of ${l.project.flow.release.watch_days} days starts at 100%.`}`,
    ].join("\n"),
  };
}

export type ReleaseEditArgs =
  | { kind: "smoke"; value: "pending" | "passed" | "failed" }
  | { kind: "go"; value: "go" | "no-go" }
  | { kind: "check"; item: string; done: boolean }
  | { kind: "add-item"; item: string }
  | { kind: "rollout"; stage: number }
  | { kind: "version"; team: string; value: string };

export async function hubReleaseEdit(ctx: ToolContext, slug: string, edit: ReleaseEditArgs): Promise<ToolResult> {
  const l = load(ctx);
  if (isResult(l)) return l;
  const r = await saveRelease({ saver: ctx.saver(l.user), project: l.project, state: l.state, local: l.open.view.specs, user: l.user, slug, edit, at: iso(ctx.now()) });
  return outcomeText(r, `The release change for ${slug}`);
}

/** A local run of the team's autotests, recorded with the label local. */
export function hubTest(ctx: ToolContext, slug: string, team?: string): ToolResult {
  const open = ctx.open();
  const r = localTests({ root: open.root, slug, ...(team ? { team } : {}), now: ctx.now, quiet: true });
  return { text: r.lines.map((x) => `${x.ok ? "✓" : x.blocking === false ? "!" : "✗"} ${x.text}`).join("\n"), ...(r.ok ? {} : { isError: true }) };
}

/** Saves a validation report as a new file in the feature's hub/validation/. */
export async function hubValidation(ctx: ToolContext, slug: string, report: string): Promise<ToolResult> {
  const l = load(ctx);
  if (isResult(l)) return l;
  const r = await saveValidation({ saver: ctx.saver(l.user), project: l.project, state: l.state, local: l.open.view.specs, user: l.user, slug, report, at: iso(ctx.now()) });
  return outcomeText(r, `The validation report of ${slug}`);
}
