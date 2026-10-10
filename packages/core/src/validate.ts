// Whether a hub file a change writes is valid, by the same parsers the site reads it with. hub-guard refuses an
// invalid file in any guard mode: a broken roles.yaml or feature.yaml on main would break the site for everyone.

import picomatch from "picomatch";
import type { Change } from "./access.ts";
import { loadProject } from "./detect.ts";
import { removesHub } from "./uninstall.ts";
import { parseBugFile, parseConfig, parseEngine, parseFeature, parseFlow, parseRelease, parseRoles, parseSignoffs } from "./files.ts";
import type { Issue, Result } from "./issues.ts";
import type { FileSource } from "./source.ts";
import { parseVerification } from "./verification.ts";

const F = "docs/features/*/hub";
const PARSERS: [string, (text: string, file: string) => Result<unknown>][] = [
  [".hub/config.yaml", parseConfig],
  [".hub/roles.yaml", parseRoles],
  [".hub/flow.yaml", parseFlow],
  [".hub/engines/*.yaml", parseEngine],
  [`${F}/feature.yaml`, parseFeature],
  [`${F}/signoffs.yaml`, parseSignoffs],
  [`${F}/release.yaml`, parseRelease],
  [`${F}/verification.yaml`, parseVerification],
  [`${F}/bugs/*.md`, parseBugFile],
].map(([glob, parse]) => [glob as string, parse as (text: string, file: string) => Result<unknown>]);
const matchers = PARSERS.map(([glob, parse]) => [picomatch(glob, { dot: true }), parse] as const);
const KEY = picomatch(".hub/keys/*/*.pub", { dot: true });

export interface Invalid {
  path: string;
  reason: string;
  line?: number;
}

const errors = (issues: Issue[]) => issues.filter((i) => i.level === "error");

/** The problems of the files the changes write; a deletion is not checked here. */
export function invalidFiles(changes: Change[], main?: FileSource): Invalid[] {
  const out: Invalid[] = [];
  for (const c of changes) {
    if (c.next === undefined) continue;
    if (KEY(c.path)) {
      if (!/^age1[0-9a-z]{50,}\s*$/.test(c.next)) out.push({ path: c.path, reason: "Not a valid hub file: a key file holds one age public key (age1…)" });
      continue;
    }
    const parse = matchers.find(([m]) => m(c.path))?.[1];
    if (!parse) continue;
    const r = parse(c.next, c.path);
    for (const i of errors(r.issues).slice(0, 3)) out.push({ path: c.path, reason: `Not a valid hub file: ${i.message}`, ...(i.line ? { line: i.line } : {}) });
  }
  // .hub/ must still load as a whole, the files refer to each other, and the change brings no new problem.
  // Uninstall removes .hub/ as a whole: there is nothing left to load.
  if (main && !out.length && changes.some((c) => c.path.startsWith(".hub/")) && !removesHub(changes)) {
    const before = new Set(loadProject(main).issues.map((i) => `${i.file}\0${i.message}`));
    const added = loadProject(overlay(main, changes)).issues.filter((i) => i.level === "error" || !before.has(`${i.file}\0${i.message}`));
    for (const i of added.slice(0, 3)) out.push({ path: i.file, reason: `Not a valid hub file: ${i.message}`, ...(i.line ? { line: i.line } : {}) });
  }
  return out;
}

/** main with the changes applied. */
function overlay(main: FileSource, changes: Change[]): FileSource {
  const by = new Map<string, string | undefined>();
  for (const c of changes) {
    if (c.from && c.from !== c.path) by.set(c.from, undefined);
    by.set(c.path, c.next);
  }
  return {
    read: (p) => (by.has(p) ? by.get(p) : main.read(p)),
    list: (prefix) => [...new Set([...main.list(prefix), ...[...by.keys()].filter((p) => p.startsWith(`${prefix}/`))])].filter((p) => (by.has(p) ? by.get(p) !== undefined : true)).sort(),
  };
}
