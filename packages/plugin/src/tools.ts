// The hub tools the plugin's skills call through MCP. Each answers in plain text the assistant can show as it is.
// They read the product-specs checkout directly and save through the same code as the site: a branch whose merge
// request merges itself when hub-guard passes.

import { detectFeature, listFeatures, nextFor, type FeatureState, type Project, type StepPlan } from "@sdlc-hub/core";
import type { OpenProject } from "@sdlc-hub/git";
import { saveBug, saveSignoff, type Save, type SaveOutcome, type Saver } from "@sdlc-hub/save";

export type Assistant = "claude" | "codex" | "cursor";

export interface ToolContext {
  /** Opens product-specs again: the files may have changed since the last call. */
  open: () => OpenProject;
  /** The roles.yaml user of this machine's git identity. */
  user: () => string | undefined;
  assistant: Assistant;
  saver: (user: string) => Saver;
  now: () => Date;
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
      const prompt = template?.replaceAll("{slug}", slug).replaceAll("{title}", s.title ?? slug).trim();
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
    return { text: planText(ctx, l, mine, nextFor(l.project, mine, l.user)) };
  }
  const s = featureOrList(l, slug);
  if ("text" in s) return s;
  const plan = nextFor(l.project, s, l.user, step);
  const ok = plan.kind === "run" || plan.kind === "signoff";
  return { text: planText(ctx, l, s, plan), ...(ok ? {} : { isError: true }) };
}

export function hubSignoff(ctx: ToolContext, step: string, slug: string, decision: "pass" | "return", reason?: string): ToolResult {
  const l = load(ctx);
  if (isResult(l)) return l;
  const r = saveSignoff({ saver: ctx.saver(l.user), project: l.project, state: l.state, user: l.user, slug, step, decision, reason, at: iso(ctx.now()) });
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

export function hubBug(ctx: ToolContext, a: BugArgs): ToolResult {
  const l = load(ctx);
  if (isResult(l)) return l;
  const s = l.state(a.slug);
  if (!s) return featureOrList(l, a.slug) as ToolResult;
  const foundIn = ["verify", "qa-final", "autotests"].includes(s.current) ? s.current : undefined;
  const r = saveBug({ saver: ctx.saver(l.user), project: l.project, user: l.user, slug: a.slug, bug: a, ...(foundIn ? { foundIn } : {}) });
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
