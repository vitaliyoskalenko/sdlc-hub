// One parser per hub file. Each returns a Result with issues placed on lines.

import type { Issue, Result } from "./issues.ts";
import { parseJson, parseYaml, splitFrontMatter } from "./parse.ts";
import {
  bugFrontSchema,
  eventSchema,
  featureSchema,
  releaseSchema,
  signoffsSchema,
  teamSnapshotSchema,
  testRunSchema,
  type BugFront,
  type HubEvent,
} from "./schema/feature.ts";
import { configSchema, engineSchema, flowSchema, rolesSchema } from "./schema/project.ts";

export const parseConfig = (text: string, file: string) => parseYaml(configSchema, text, file);
export const parseRoles = (text: string, file: string) => parseYaml(rolesSchema, text, file);
export const parseFlow = (text: string, file: string) => parseYaml(flowSchema, text, file);
export const parseEngine = (text: string, file: string) => parseYaml(engineSchema, text, file);
export const parseFeature = (text: string, file: string) => parseYaml(featureSchema, text, file);
export const parseSignoffs = (text: string, file: string) => parseYaml(signoffsSchema, text, file);
export const parseRelease = (text: string, file: string) => parseYaml(releaseSchema, text, file);
export const parseTestRun = (text: string, file: string) => parseJson(testRunSchema, text, file);
export const parseTeamSnapshot = (text: string, file: string) => parseJson(teamSnapshotSchema, text, file);

export interface BugFile {
  front: BugFront;
  body: string;
}

export function parseBugFile(text: string, file: string): Result<BugFile> {
  const split = splitFrontMatter(text);
  if (!split) return { issues: [{ level: "error", file, line: 1, message: "A bug file starts with front matter between --- lines" }] };
  const front = parseYaml(bugFrontSchema, split.front, file, 1);
  return front.value ? { value: { front: front.value, body: split.body }, issues: front.issues } : { issues: front.issues };
}

/** Malformed lines are reported and skipped; the rest of the log is kept. */
export function parseEventsJsonl(text: string, file: string): Result<HubEvent[]> {
  const issues: Issue[] = [];
  const events: HubEvent[] = [];
  text.split("\n").forEach((line, i) => {
    if (!line.trim()) return;
    const r = parseJson(eventSchema, line, file, i + 1);
    issues.push(...r.issues);
    if (r.value) events.push(r.value);
  });
  return { value: events, issues };
}
