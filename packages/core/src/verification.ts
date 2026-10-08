// QA's verdicts at verify: hub/verification.yaml in the feature, one record per criterion and platform. The newest
// record for a pair wins and earlier ones stay as history, so a retest in a new cycle adds records. The verify gate
// asks that every criterion passes or does not apply on every platform of the feature.

import { parse as parseYamlText } from "yaml";
import { z } from "zod";
import type { Change } from "./access.ts";
import type { FeatureState } from "./detect.ts";
import { parseYaml } from "./parse.ts";
import { isoTime } from "./schema/common.ts";
import type { Config } from "./schema/project.ts";
import { readCriteria } from "./sdd.ts";
import type { FileSource } from "./source.ts";

export const VERDICTS = ["pass", "fail", "na"] as const;
export type Verdict = (typeof VERDICTS)[number];

const record = z.strictObject({
  ac: z.string().regex(/^AC-\d+$/, "Write the criterion as AC-NN"),
  platform: z.string().min(1),
  verdict: z.enum(VERDICTS),
  bugs: z.array(z.string().regex(/^BUG-\d{4,}$/)).optional(),
  user: z.string().min(1),
  at: isoTime,
});
export const verificationSchema = z.strictObject({ verdicts: z.array(record) });
export type VerdictRecord = z.output<typeof record>;
export const parseVerification = (text: string, file: string) => parseYaml(verificationSchema, text, file);

export const verificationPath = (slug: string) => `docs/features/${slug}/hub/verification.yaml`;

/** The platforms a feature is verified on: the kinds of its client teams, or of all its teams when it has none. */
export function platformsOf(config: Config, state: FeatureState): string[] {
  const kinds = state.teams.map((t) => config.teams.find((c) => c.id === t.id)?.kind).filter((k): k is NonNullable<typeof k> => !!k);
  const clients = kinds.filter((k) => k !== "backend" && k !== "other");
  return [...new Set(clients.length ? clients : kinds.length ? kinds : ["other"])];
}

export interface Matrix {
  platforms: string[];
  criteria: { id: string; text: string; cells: Record<string, VerdictRecord | null> }[];
  /** Every criterion passes or does not apply on every platform. */
  complete: boolean;
  /** "AC-03 on ios: fail" for each cell that is not pass or na. */
  open: string[];
}

export function verificationMatrix(specs: FileSource, slug: string, platforms: string[]): Matrix {
  const spec = specs.read(`docs/features/${slug}/spec.md`) ?? "";
  const text = specs.read(verificationPath(slug));
  const records = text ? (parseVerification(text, verificationPath(slug)).value?.verdicts ?? []) : [];
  const latest = new Map<string, VerdictRecord>();
  for (const r of records) latest.set(`${r.ac}|${r.platform}`, r);
  const criteria = readCriteria(spec).map((c) => ({ ...c, cells: Object.fromEntries(platforms.map((p) => [p, latest.get(`${c.id}|${p}`) ?? null])) }));
  const open = criteria.flatMap((c) => platforms.flatMap((p) => (c.cells[p]?.verdict === "pass" || c.cells[p]?.verdict === "na" ? [] : [`${c.id} on ${p}: ${c.cells[p]?.verdict ?? "no verdict"}`])));
  return { platforms, criteria, complete: criteria.length > 0 && open.length === 0, open };
}

export interface VerdictInput {
  ac: string;
  platform: string;
  verdict: Verdict;
  bugs?: string[];
}

/** New verdicts appended to verification.yaml, checked against the spec's criteria and the feature's platforms. */
export function verdictChange(specs: FileSource, slug: string, platforms: string[], input: VerdictInput[], user: string, at: string): Change {
  if (!input.length) throw new Error("Give at least one verdict");
  const known = readCriteria(specs.read(`docs/features/${slug}/spec.md`) ?? "").map((c) => c.id);
  for (const v of input) {
    if (!known.includes(v.ac)) throw new Error(`${v.ac} is not a criterion of ${slug}`);
    if (!platforms.includes(v.platform)) throw new Error(`${v.platform} is not a platform of ${slug}; they are ${platforms.join(", ")}`);
    if (!(VERDICTS as readonly string[]).includes(v.verdict)) throw new Error(`A verdict is ${VERDICTS.join(", ")}`);
    if (v.verdict === "fail" && !v.bugs?.length) throw new Error(`${v.ac} on ${v.platform} fails: name the bug`);
  }
  const path = verificationPath(slug);
  const base = specs.read(path);
  const head = base?.trim() ? (base.endsWith("\n") ? base : `${base}\n`) : "verdicts:\n";
  if (base?.trim() && !(parseYamlText(base) as { verdicts?: unknown } | null)?.verdicts) throw new Error(`${path} is not valid`);
  const lines = input.map((v) => `  - { ac: ${v.ac}, platform: ${v.platform}, verdict: ${v.verdict}${v.bugs?.length ? `, bugs: [${v.bugs.join(", ")}]` : ""}, user: ${JSON.stringify(user)}, at: ${at} }`);
  const next = `${head}${lines.join("\n")}\n`;
  const check = parseVerification(next, path);
  if (!check.value) throw new Error(check.issues.map((i) => i.message).join("; "));
  return { path, ...(base !== undefined ? { base } : {}), next };
}
