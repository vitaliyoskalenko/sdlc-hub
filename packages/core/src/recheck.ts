// Documents built on an older version of what they depend on. A step's document landed on main, and later something
// it is built on changed: the spec's stories and criteria (by id: AC-04, US-2, SCR-02), the flows, the data model or
// the contract. Its owner runs the step again, or confirms that nothing needs to change (a `confirm` sign-off).
// Everything comes from git: the time each file last landed on main, and the text of a file at a time.

import type { Signoff } from "./schema/feature.ts";
import type { FileSource } from "./source.ts";

/** One document to check again, and what changed under it. */
export interface Recheck {
  step: string;
  /** The repository path of the document (a folder for the contract), or the team for the tasks of one team. */
  file: string;
  team?: string;
  because: RecheckCause[];
}

export interface RecheckCause {
  /** The repository path that changed. */
  file: string;
  /** The changed ids that the document refers to, or that were added or removed; empty when the whole file counts. */
  ids: string[];
  /** When the change landed on main, and who made it. */
  at: string;
  by?: string;
}

const ID = String.raw`(?:AC|US|SCR|FR|NFR)-\d+[a-z]?`;
const ID_ANY = new RegExp(String.raw`\b${ID}\b`, "g");
const HEADING = /^(#{1,6})\s/;
const STARTS_HEADING = new RegExp(String.raw`^(#{1,6})\s+\**(${ID})\b`);
const STARTS_ITEM = new RegExp(String.raw`^(\s*)(?:[-*+]|\d+\.)\s+\**(${ID})\b`);

/**
 * The text that defines each id of a markdown file: a heading that starts with the id owns the lines up to the next
 * heading of its level or above; a list item that starts with the id owns its line and the lines indented under it.
 * An id named inside a sentence is a reference, not a definition.
 */
export function idBlocks(md: string): Map<string, string> {
  const out = new Map<string, string[]>();
  let open: { id: string; level?: number; indent?: number } | undefined;
  for (const line of md.replace(/\r\n?/g, "\n").split("\n")) {
    const h = STARTS_HEADING.exec(line);
    const li = STARTS_ITEM.exec(line);
    const heading = HEADING.exec(line);
    if (h) open = { id: h[2]!, level: h[1]!.length };
    else if (li) open = { id: li[2]!, indent: li[1]!.length };
    else if (open && heading && (open.level === undefined || heading[1]!.length <= open.level)) open = undefined;
    else if (open?.indent !== undefined && line.trim() && line.length - line.trimStart().length <= open.indent) open = undefined;
    if (open) out.set(open.id, [...(out.get(open.id) ?? []), line]);
  }
  return new Map([...out].map(([id, lines]) => [id, lines.join(" ").replace(/\s+/g, " ").trim()]));
}

/** The ids whose definition differs between two versions, and those added or removed. */
export function changedIds(before: string, after: string): { changed: string[]; added: string[]; removed: string[] } {
  const a = idBlocks(before), b = idBlocks(after);
  return {
    changed: [...b.keys()].filter((id) => a.has(id) && a.get(id) !== b.get(id)),
    added: [...b.keys()].filter((id) => !a.has(id)),
    removed: [...a.keys()].filter((id) => !b.has(id)),
  };
}

/** Every id a text names. */
export const idsIn = (text: string): Set<string> => new Set(text.match(ID_ANY) ?? []);

type Basis = [file: string, by: "ids" | "file"];

/** What each step's document in product-specs is built on, relative to the feature's folder. */
export const RECHECK_DEPS: { step: string; doc: string; on: Basis[] }[] = [
  { step: "ux-flows", doc: "ux-flows.md", on: [["spec.md", "ids"]] },
  { step: "tech-design", doc: "sad.md", on: [["spec.md", "ids"]] },
  { step: "data-model", doc: "data-model.md", on: [["spec.md", "ids"]] },
  { step: "api", doc: "contracts", on: [["spec.md", "ids"], ["data-model.md", "file"]] },
  { step: "screens", doc: "screens.md", on: [["spec.md", "ids"], ["ux-flows.md", "file"]] },
  { step: "plan-tests", doc: "test-plan.md", on: [["spec.md", "ids"]] },
];

export interface RecheckInput {
  specs: FileSource;
  slug: string;
  /** The steps that are done: only a finished document can be built on an older version. */
  done: Set<string>;
  signoffs: Signoff[];
  /** Each team of the feature with its tasks, when known, and the contract team. */
  teams: { id: string; acs: string[] | null }[];
  contractTeam?: string;
  /** When the tasks stage last finished, from the stage events. */
  tasksFinished?: string;
  /** The team of a person, for a lead's confirmation of their team's tasks. */
  teamOf(user: string): string | undefined;
}

export function rechecksFor(x: RecheckInput): Recheck[] {
  const h = x.specs.history;
  if (!h) return [];
  const dir = `docs/features/${x.slug}`;
  const out: Recheck[] = [];
  /** The last time an owner confirmed the step still holds, for one team or for anyone. */
  const confirmed = (step: string, team?: string) =>
    x.signoffs
      .filter((e) => e.decision === "confirm" && e.step === step && (team === undefined || x.teamOf(e.user) === team))
      .map((e) => e.at)
      .sort()
      .at(-1);
  const causes = (on: Basis[], since: string, refs: Set<string> | null): RecheckCause[] =>
    on.flatMap(([rel, by]): RecheckCause[] => {
      const path = `${dir}/${rel}`;
      const at = h.changedAt(path);
      if (!at || at <= since) return [];
      const now = x.specs.read(path);
      // Not there yet at that time (a record dated before its file landed): compare with its first version, unless
      // that is the only one.
      const first = h.firstAt(path);
      const known = h.readAt(path, since);
      if (known === undefined && first === at) return [];
      const then = known ?? (first ? h.readAt(path, first) : undefined);
      if (now === undefined || then === undefined) return [];
      const who = x.specs.author?.(path);
      const cause = (ids: string[]): RecheckCause[] => [{ file: path, ids, at, ...(who ? { by: who } : {}) }];
      if (by === "file") return then.replace(/\s+/g, " ").trim() === now.replace(/\s+/g, " ").trim() ? [] : cause([]);
      const d = changedIds(then, now);
      // A new or removed story or criterion counts for every document; a changed one for those that name it (all of
      // them when the document's references are not known, as for tasks nobody published).
      const named = d.changed.filter((id) => !refs || refs.has(id));
      const ids = [...d.added, ...d.removed, ...named];
      return ids.length ? cause(ids) : [];
    });

  /** A folder changed since a time: a file in it now reads otherwise than then; nothing to compare if none existed. */
  const folderChanged = (folder: string, since: string): RecheckCause[] => {
    const at = h.changedAt(folder);
    if (!at || at <= since) return [];
    const files = x.specs.list(folder);
    const then = files.map((p) => h.readAt(p, since));
    if (then.every((t) => t === undefined)) return [];
    if (files.every((p, i) => then[i] !== undefined && then[i]!.replace(/\s+/g, " ").trim() === (x.specs.read(p) ?? "").replace(/\s+/g, " ").trim())) return [];
    return [{ file: folder, ids: [], at }];
  };

  for (const dep of RECHECK_DEPS) {
    if (!x.done.has(dep.step)) continue;
    const doc = `${dir}/${dep.doc}`;
    const landed = h.changedAt(doc);
    if (!landed) continue;
    const since = [landed, confirmed(dep.step)].filter((t): t is string => !!t).sort().at(-1)!;
    const text = dep.doc === "contracts" ? x.specs.list(doc).map((p) => x.specs.read(p) ?? "").join("\n") : (x.specs.read(doc) ?? "");
    const because = causes(dep.on, since, idsIn(text));
    if (because.length) out.push({ step: dep.step, file: doc, because });
  }

  // Each team's tasks are built on the spec, the screens and, for a client team, the contract. They live in the team's
  // repository: their time is when the tasks stage last finished, or when the leads signed the tasks off.
  const tasksSigned = x.signoffs.filter((e) => e.step === "tasks" && e.decision === "pass").map((e) => e.at).sort().at(-1);
  const tasksAt = [x.tasksFinished, tasksSigned].filter((v): v is string => !!v).sort().at(-1);
  if (x.done.has("tasks") && tasksAt)
    for (const t of x.teams) {
      const on: Basis[] = [["spec.md", "ids"], ["screens.md", "file"]];
      const since = [tasksAt, confirmed("tasks", t.id)].filter((v): v is string => !!v).sort().at(-1)!;
      const because = causes(on, since, t.acs ? new Set(t.acs) : null);
      if (t.id !== x.contractTeam && x.contractTeam) because.push(...folderChanged(`${dir}/contracts`, since));
      if (because.length) out.push({ step: "tasks", file: t.id, team: t.id, because });
    }
  return out;
}
