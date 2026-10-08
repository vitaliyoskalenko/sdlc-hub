// Who may change which paths: "Roles and the paths they may change" and "Guard rules" in the specification.
// The site uses this to disable controls, and hub-guard runs the same code at merge (guard.ts adds the rules for the
// entries of signoffs.yaml).

import picomatch from "picomatch";
import { isDeepStrictEqual } from "node:util";
import { parse as parseYamlText } from "yaml";
import { checkRegionEdit, type Region } from "./content/structure.ts";
import { splitFrontMatter } from "./parse.ts";
import type { BuiltinRole } from "./schema/common.ts";
import { contractTeam, type Config, type Person, type Roles } from "./schema/project.ts";

export interface AccessContext {
  config: Config;
  roles: Roles;
}

/** One changed path. `base` is the version on main (absent for a new file); `next` is absent for a deletion. */
export interface Change {
  path: string;
  /** For a rename, the old path. A rename counts as a change to both paths. */
  from?: string;
  base?: string;
  next?: string;
}

export type AccessResult = { ok: true; rule: string } | { ok: false; reason: string; line?: number };

const F = "docs/features/*";

/** The path rules init writes for each built-in role. A `roles:` entry in roles.yaml replaces the role's list. */
export const DEFAULT_ROLE_RULES: Record<BuiltinRole, string[]> = {
  admin: ["**"],
  po: [
    `${F}/spec.md`,
    `${F}/.size`,
    `${F}/.route`,
    "CONTEXT.md",
    `${F}/CONTEXT.md`,
    `${F}/hub/feature.yaml`,
    `${F}/hub/validation/**`,
    `${F}/sad.md#front:feature_size`,
    `${F}/hub/signoffs.yaml`,
  ],
  pm: ["docs/roadmap.md", `${F}/hub/feature.yaml`, `${F}/hub/release.yaml#keys:go`, `${F}/hub/signoffs.yaml`],
  designer: ["docs/design-system.md", `${F}/ux-flows.md`, `${F}/screens.md`, `${F}/hub/signoffs.yaml`],
  dev: [`${F}/hub/bugs/*.md#front:status`, `${F}/hub/signoffs.yaml`],
  qa: [`${F}/test-plan.md`, `${F}/spec.md#Test plan`, `${F}/hub/bugs/**`, `${F}/hub/verification.yaml`, `${F}/hub/signoffs.yaml`],
  ops: [`${F}/hub/release.yaml#keys:!go`, `${F}/hub/signoffs.yaml`],
};

/** Every lead: validation reports. */
export const LEAD_RULES = [`${F}/hub/validation/**`];
/** The contract team's lead: the only files of steps 5 to 7 that live in product-specs. */
export const CONTRACT_LEAD_RULES = [`${F}/sad.md`, `${F}/data-model.md`, `${F}/contracts/**`];

interface Rule {
  source: string;
  match: (path: string) => boolean;
  region?: Region;
  /** For a YAML data file: the top-level keys the rule allows (`#keys:go`), or all but these (`#keys:!go`). */
  keys?: { only: string[] } | { except: string[] };
}

function parseRule(source: string): Rule {
  const hash = source.indexOf("#");
  const glob = hash < 0 ? source : source.slice(0, hash);
  const fragment = hash < 0 ? undefined : source.slice(hash + 1);
  let region: Region | undefined;
  let keys: Rule["keys"];
  if (fragment?.startsWith("keys:")) {
    const list = fragment.slice("keys:".length);
    keys = list.startsWith("!") ? { except: list.slice(1).split(",") } : { only: list.split(",") };
  } else if (fragment?.startsWith("front:")) region = { kind: "front", key: fragment.slice("front:".length) };
  // `#Test plan` names a level-2 section, where SDD writes; `#### Title` gives the level explicitly.
  else if (fragment) region = { kind: "section", heading: fragment.startsWith("#") ? fragment : `## ${fragment}` };
  return { source, match: picomatch(glob, { dot: true }), region, ...(keys ? { keys } : {}) };
}

function rulesFor(person: Person, ctx: AccessContext): Rule[] {
  const sources: string[] = [];
  for (const role of person.roles) {
    const custom = ctx.roles.roles?.[role]?.write;
    sources.push(...(custom ?? DEFAULT_ROLE_RULES[role as BuiltinRole] ?? []));
  }
  if (person.lead && person.roles.includes("dev")) {
    sources.push(...LEAD_RULES);
    if (person.team && contractTeam(ctx.config)?.id === person.team) sources.push(...CONTRACT_LEAD_RULES);
  }
  return sources.map(parseRule);
}

const SIGNOFFS = picomatch(`${F}/hub/signoffs.yaml`, { dot: true });
const BUG = picomatch(`${F}/hub/bugs/*.md`, { dot: true });

export function checkChange(user: string, change: Change, ctx: AccessContext): AccessResult {
  const person = ctx.roles.people.find((p) => p.user === user);
  if (!person) return { ok: false, reason: `${user} is not in roles.yaml` };
  if (change.from !== undefined && change.from !== change.path) {
    // A rename is a deletion of the old path and a new file at the new one, each checked in full.
    const old = checkPath(person, ctx, change.from, change.base, undefined);
    if (!old.ok) return old;
    return checkPath(person, ctx, change.path, undefined, change.next);
  }
  return checkPath(person, ctx, change.path, change.base, change.next);
}

function checkPath(person: Person, ctx: AccessContext, path: string, base: string | undefined, next: string | undefined): AccessResult {
  if (base === undefined && next !== undefined && ownKeyFile(person, path)) return { ok: true, rule: ".hub/keys/<own user>/<machine>.pub" };

  let refusal: AccessResult | undefined;
  for (const rule of rulesFor(person, ctx)) {
    if (!rule.match(path)) continue;
    if (rule.keys) {
      const r = checkKeys(base, next, rule.keys);
      if (r === true) return { ok: true, rule: rule.source };
      refusal ??= { ok: false, reason: r };
      continue;
    }
    if (!rule.region) {
      if (SIGNOFFS(path) && !person.roles.includes("admin")) {
        // Append-only: the file on main must stay as it is at the start of the new version.
        if (base !== undefined && (next === undefined || !next.startsWith(base))) {
          refusal ??= { ok: false, reason: "signoffs.yaml is append-only: existing entries cannot be edited or removed" };
          continue;
        }
      }
      return { ok: true, rule: rule.source };
    }
    if (next === undefined) {
      refusal ??= { ok: false, reason: `${rule.source} allows one part of the file, not deleting it` };
      continue;
    }
    if (rule.region.kind === "front" && rule.region.key === "status" && BUG(path) && !bugOfOwnTeam(person, base)) {
      refusal ??= { ok: false, reason: "A developer may change the status of a bug on their own team only" };
      continue;
    }
    const r = checkRegionEdit(base, next, rule.region);
    if (r.ok) return { ok: true, rule: rule.source };
    refusal ??= { ok: false, reason: r.reason, ...(r.line !== undefined ? { line: r.line } : {}) };
  }
  return refusal ?? { ok: false, reason: `No role of ${person.user} (${person.roles.join(", ")}) may change ${path}` };
}

/** Compares two YAML data files key by key: only the allowed top-level keys may differ. */
function checkKeys(base: string | undefined, next: string | undefined, keys: NonNullable<Rule["keys"]>): true | string {
  if (next === undefined) return "This rule allows some fields of the file, not deleting it";
  let a: Record<string, unknown>;
  let b: Record<string, unknown>;
  try {
    a = (base === undefined ? {} : (parseYamlText(base) ?? {})) as Record<string, unknown>;
    b = (parseYamlText(next) ?? {}) as Record<string, unknown>;
  } catch {
    return "The file is not valid YAML";
  }
  const changed = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => !isDeepStrictEqual(a[k], b[k]));
  const allowed = (k: string) => ("only" in keys ? keys.only.includes(k) : !keys.except.includes(k));
  const bad = changed.filter((k) => !allowed(k));
  return bad.length ? `Your role may not change ${bad.join(", ")} in this file` : true;
}

function ownKeyFile(person: Person, path: string): boolean {
  // A folder per person: with <user>-<machine>.pub, user "olena" could add a key named like "olena-k"'s.
  const prefix = `.hub/keys/${person.user}/`;
  return path.startsWith(prefix) && path.endsWith(".pub") && !path.slice(prefix.length).includes("/");
}

function bugOfOwnTeam(person: Person, base: string | undefined): boolean {
  if (base === undefined || !person.team) return false;
  const front = splitFrontMatter(base)?.front ?? "";
  return new RegExp(`^team:[ \\t]*["']?${person.team}["']?[ \\t]*$`, "m").test(front);
}
