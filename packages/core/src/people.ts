// People on People and roles: one person added, changed or removed in .hub/roles.yaml, as a change the guard checks
// (only the admin passes). The file keeps its comments and its style; a new entry follows the style of the others.

import { isMap, isSeq, parseDocument, type YAMLMap } from "yaml";
import type { Change } from "./access.ts";
import { parseRoles } from "./files.ts";
import { BUILTIN_ROLES } from "./schema/common.ts";
import type { Config } from "./schema/project.ts";
import type { FileSource } from "./source.ts";
import { z } from "zod";
import { parseJson } from "./parse.ts";
import { isoTime } from "./schema/common.ts";

export interface PersonInput {
  user: string;
  name: string;
  roles: string[];
  team?: string;
  lead?: boolean;
  os?: "macos" | "linux" | "windows";
  assistant?: "claude" | "codex" | "cursor";
}

export type PeopleEdit = { kind: "set"; person: PersonInput } | { kind: "remove"; user: string };

const ROLES_FILE = ".hub/roles.yaml";
/** GitLab and GitHub usernames: letters, digits, dot, dash and underscore. */
const USERNAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function peopleChange(main: FileSource, config: Config, edit: PeopleEdit): Change {
  const base = main.read(ROLES_FILE);
  if (base === undefined) throw new Error(".hub/roles.yaml is missing on main");
  const current = parseRoles(base, ROLES_FILE).value;
  if (!current) throw new Error(".hub/roles.yaml on main is not valid; fix it first");
  const doc = parseDocument(base);
  const seq = doc.get("people", true);
  if (!isSeq(seq)) throw new Error(".hub/roles.yaml has no people list");
  const at = (user: string) => seq.items.findIndex((n) => isMap(n) && n.get("user") === user);

  if (edit.kind === "remove") {
    const i = at(edit.user);
    if (i < 0) throw new Error(`${edit.user} is not in roles.yaml`);
    const admins = current.people.filter((p) => p.roles.includes("admin"));
    if (admins.length === 1 && admins[0]!.user === edit.user) throw new Error(`${edit.user} is the last admin; add another admin first`);
    seq.items.splice(i, 1);
  } else {
    const p = edit.person;
    if (!USERNAME.test(p.user)) throw new Error(`"${p.user}" is not a valid username`);
    if (!p.name.trim()) throw new Error("Give the person's name");
    const known = [...BUILTIN_ROLES, ...Object.keys(current.roles ?? {})];
    for (const r of p.roles) if (!known.includes(r)) throw new Error(`There is no role ${r}; the roles are ${known.join(", ")}`);
    if (!p.roles.length) throw new Error("Give at least one role");
    if (p.team && !config.teams.some((t) => t.id === p.team)) throw new Error(`There is no team ${p.team}; the teams are ${config.teams.map((t) => t.id).join(", ")}`);
    if (p.lead && !p.team) throw new Error("A lead needs a team");
    const value: Record<string, unknown> = { user: p.user, name: p.name.trim(), ...(p.roles.length === 1 ? { role: p.roles[0] } : { roles: p.roles }) };
    if (p.team) value["team"] = p.team;
    if (p.lead) value["lead"] = true;
    if (p.os) value["os"] = p.os;
    if (p.assistant) value["assistant"] = p.assistant;
    const node = doc.createNode(value) as YAMLMap;
    const i = at(p.user);
    const like = (i >= 0 ? seq.items[i] : seq.items.at(-1)) as YAMLMap | undefined;
    if (like && isMap(like) && like.flow) node.flow = true;
    if (i >= 0) seq.items[i] = node;
    else seq.items.push(node);
  }
  const next = doc.toString({ lineWidth: 0 });
  const check = parseRoles(next, ROLES_FILE);
  if (!check.value) throw new Error(check.issues.map((x) => x.message).join("; "));
  return { path: ROLES_FILE, base, next };
}

/** hub-state `people/<user>.json`: written by `hub setup` on the person's machine, shown on People and roles. */
export const personStateSchema = z.strictObject({
  user: z.string().min(1),
  setup_at: isoTime,
  release: z.string(),
  assistant: z.enum(["claude", "codex", "cursor"]),
  platform: z.string(),
});
export type PersonState = z.output<typeof personStateSchema>;
export const parsePersonState = (text: string, file: string) => parseJson(personStateSchema, text, file);
export const personStatePath = (user: string) => `people/${user}.json`;
