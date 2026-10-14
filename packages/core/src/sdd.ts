// Readers for what genkovich/sdd 2.3 writes, and the team snapshot that hub-report publishes.
// Formats checked against the SDD v2.3.0 skill files and templates (see docs/decisions.md), and against a real run
// from specify to tasks (9 October 2026; the output is in test/fixtures/sdd-2.3.0). What that run did not reach (the
// review record) is still tagged @assumed-sdd-format, here and nowhere else.

import { parse as parseYamlText } from "yaml";
import { z } from "zod";
import type { Issue, Result } from "./issues.ts";
import { parseJson, splitFrontMatter } from "./parse.ts";
import { ROUTES, SIZES, type Route, type Size } from "./schema/common.ts";
import { sddTaskSchema, TRACKER_STATUSES, type SddTask, type TeamSnapshot, type TrackerRow } from "./schema/feature.ts";
import type { FileSource } from "./source.ts";

// --- .size and .route: one bare word each

export function readSize(text: string): { value?: Size } {
  const word = text.trim();
  return (SIZES as readonly string[]).includes(word) ? { value: word as Size } : {};
}

export function readRoute(text: string): { value?: Route } {
  const word = text.trim();
  return (ROUTES as readonly string[]).includes(word) ? { value: word as Route } : {};
}

// --- sad.md: target_surfaces in the front matter, written by SDD's design stage

export const UI_SURFACES = ["web-frontend", "mobile-app", "desktop-app"] as const;

export function readTargetSurfaces(sad: string): string[] | undefined {
  const front = splitFrontMatter(sad)?.front;
  if (front === undefined) return undefined;
  try {
    const list = (parseYamlText(front) as { target_surfaces?: unknown } | null)?.target_surfaces;
    return Array.isArray(list) && list.every((x) => typeof x === "string") ? list : undefined;
  } catch {
    return undefined;
  }
}

// --- tasks.json

const tasksFileSchema = z.strictObject({ slug: z.string(), tasks: z.array(sddTaskSchema) });

export function parseTasksJson(text: string, file: string): Result<{ slug: string; tasks: SddTask[] }> {
  const r = parseJson(tasksFileSchema, text, file);
  if (!r.value) return r;
  const ids = new Set(r.value.tasks.map((t) => t.id));
  const issues = [...r.issues];
  r.value.tasks.forEach((t, i) => {
    for (const dep of t.deps)
      if (!ids.has(dep))
        issues.push({
          level: "error",
          file,
          path: `tasks.${i}.deps`,
          message: `Task ${t.id} depends on ${dep}, which is not in the same file. SDD reads ids of the same file only; write a wait on another team in the Blocked by column of tasks/tracker.md`,
        });
  });
  return { value: r.value, issues };
}

// --- tasks/tracker.md: the status table
// Checked against a real SDD 2.3.0 run (9 October 2026): the columns and states of skills/tasks/templates/tracker.md,
// one table per file, each id a link to its task file.

const CELL_SPLIT = /(?<!\\)\|/;
const TASK_REF = /\b(?:[a-z][a-z0-9]*(?:-[a-z0-9]+)*:)?T\d+\b/g;

export function parseTracker(text: string, file: string): Result<TrackerRow[]> {
  const lines = text.split("\n");
  const headerAt = lines.findIndex((l) => /^\s*\|/.test(l) && /\|\s*Status\s*\|/i.test(l) && /\|\s*#\s*\|/.test(l));
  if (headerAt < 0) return { issues: [{ level: "error", file, message: "No status table with # and Status columns" }] };
  const cols = cells(lines[headerAt]!).map((c) => c.toLowerCase());
  const col = (name: string) => cols.indexOf(name);
  const [iId, iTask, iBlocked, iStatus] = [col("#"), col("task"), col("blocked by"), col("status")];

  const rows: TrackerRow[] = [];
  const issues: Issue[] = [];
  for (let n = headerAt + 2; n < lines.length; n++) {
    const line = lines[n]!;
    if (!/^\s*\|/.test(line)) break;
    const c = cells(line);
    // SDD 2.3.0 links each id to its task file: [T05](./t05-implement-the-order-exports-repository.md).
    const id = (c[iId] ?? "").trim().replace(/^\[([^\]]+)\]\([^)]*\)$/, "$1");
    const status = c[iStatus]?.trim() ?? "";
    if (!(TRACKER_STATUSES as readonly string[]).includes(status)) {
      issues.push({ level: "error", file, line: n + 1, message: `Task ${id || "?"} has the status "${status}"; SDD uses ${TRACKER_STATUSES.join(", ")}` });
      continue;
    }
    rows.push({
      id,
      ...(iTask >= 0 && c[iTask] ? { title: c[iTask]!.trim() } : {}),
      status: status as TrackerRow["status"],
      blocked_by: iBlocked >= 0 ? [...(c[iBlocked] ?? "").matchAll(TASK_REF)].map((m) => m[0]) : [],
    });
  }
  return { value: rows, issues };
}

function cells(line: string): string[] {
  const parts = line.trim().split(CELL_SPLIT);
  return parts.slice(1, parts.length - 1).map((p) => p.trim());
}

// --- _review/review-<date>.md
// @assumed-sdd-format: <date> is YYYY-MM-DD, so the newest record sorts last.

// A later review the same day carries a suffix: review-2026-10-14-2.md or review-2026-10-14-r2.md (seen in the
// full cycle). The newest is the latest date, then the highest round; no suffix is the first round.
export function latestReviewFile(featureFiles: string[]): string | undefined {
  const key = (f: string) => {
    const m = /^_review\/review-(\d{4}-\d{2}-\d{2})(.*)\.md$/.exec(f)!;
    return { date: m[1]!, round: m[2] ? Number(/\d+/.exec(m[2])?.[0] ?? 1) : 1, suffix: m[2]! };
  };
  return featureFiles
    .filter((f) => /^_review\/review-\d{4}-\d{2}-\d{2}[^/]*\.md$/.test(f))
    .sort((a, b) => {
      const x = key(a);
      const y = key(b);
      return x.date !== y.date ? (x.date < y.date ? -1 : 1) : x.round !== y.round ? x.round - y.round : x.suffix < y.suffix ? -1 : x.suffix > y.suffix ? 1 : 0;
    })
    .at(-1);
}

const VERDICTS = ["CHANGES REQUESTED", "PASS"] as const;
const hasVerdict = (s: string, v: string) => new RegExp(`\\b${v}\\b`).test(s);

/**
 * @assumed-sdd-format
 * SDD 2.3 writes the gate result in prose with no fixed line. Prefer a line that names the gate result or
 * verdict and carries exactly one literal; otherwise accept the only literal in the record.
 */
export function readReviewVerdict(text: string): "PASS" | "CHANGES REQUESTED" | undefined {
  for (const line of text.split("\n")) {
    if (!/gate result|verdict/i.test(line)) continue;
    const found = VERDICTS.filter((v) => hasVerdict(line, v));
    if (found.length === 1) return found[0];
  }
  const found = VERDICTS.filter((v) => hasVerdict(text, v));
  return found.length === 1 ? found[0] : undefined;
}

// --- the team snapshot

export interface SnapshotInput {
  team: string;
  slug: string;
  source: FileSource;
  commit: string | null;
  now: string;
  mr?: TeamSnapshot["mr"];
  pipeline?: TeamSnapshot["pipeline"];
}

/** What hub-report publishes to hub-state, and what the site builds from a local clone when there is none. */
export function buildTeamSnapshot(input: SnapshotInput): Result<TeamSnapshot> {
  const dir = `docs/features/${input.slug}`;
  const files = input.source.list(dir).map((p) => p.slice(dir.length + 1));
  const warnings: string[] = [];

  let tasks: SddTask[] | null = null;
  const tasksText = input.source.read(`${dir}/tasks.json`);
  if (tasksText !== undefined) {
    const r = parseTasksJson(tasksText, `${dir}/tasks.json`);
    tasks = r.value?.tasks ?? null;
    warnings.push(...r.issues.map((i) => `tasks.json: ${i.message}`));
  }

  let tracker: TrackerRow[] | null = null;
  const trackerText = input.source.read(`${dir}/tasks/tracker.md`);
  if (trackerText !== undefined) {
    const r = parseTracker(trackerText, `${dir}/tasks/tracker.md`);
    tracker = r.value ?? null;
    warnings.push(...r.issues.map((i) => `tasks/tracker.md${i.line ? ` line ${i.line}` : ""}: ${i.message}`));
  }

  let review: TeamSnapshot["review"] = null;
  const reviewFile = latestReviewFile(files);
  if (reviewFile) {
    const verdict = readReviewVerdict(input.source.read(`${dir}/${reviewFile}`) ?? "");
    if (verdict) review = { file: reviewFile, verdict };
    else warnings.push(`${reviewFile}: no single PASS or CHANGES REQUESTED found`);
  }

  const sad = input.source.read(`${dir}/sad.md`);

  return {
    value: {
      schema_version: 1,
      team: input.team,
      slug: input.slug,
      source_commit: input.commit,
      generated_at: input.now,
      files,
      target_surfaces: sad === undefined ? null : (readTargetSurfaces(sad) ?? null),
      tasks,
      tracker,
      review,
      mr: input.mr ?? null,
      pipeline: input.pipeline ?? null,
      warnings,
    },
    issues: [],
  };
}

// --- acceptance criteria in spec.md

// Checked against a real SDD 2.3.0 run (9 October 2026): SDD writes headings (CRITERION_HEADING). The list items
// "- AC-01: text" or "- **AC-01** text" are still read, for specs written by hand.
const CRITERION = /^\s*[-*]\s+\**(AC-\d+[a-z]?)\**[:.]?\**\s+(.+?)\s*$/;
/**
 * SDD 2.3.0 writes each criterion as a heading with Given/When/Then lines under it; clarify adds ids such as AC-02b
 * (seen in a real run, 9 October 2026): `### AC-01 (US-01, US-04) — happy path`.
 */
const CRITERION_HEADING = /^#{2,4}\s+(AC-\d+[a-z]?)\b\s*(?:\([^)]*\))?\s*[—–:-]?\s*(.*?)\s*$/;

/** The acceptance criteria of a spec, in order, each once. */
export function readCriteria(spec: string): { id: string; text: string }[] {
  const out: { id: string; text: string }[] = [];
  for (const line of spec.split("\n")) {
    const m = CRITERION.exec(line) ?? CRITERION_HEADING.exec(line);
    if (m && !out.some((c) => c.id === m[1])) out.push({ id: m[1]!, text: m[2]!.replace(/^[:–-]\s*/, "") });
  }
  return out;
}
