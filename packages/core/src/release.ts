// The release of a feature on the site: release.yaml, field by field. Ops records the staging smoke check, ticks the
// checklist, records each team's version and sets the rollout stage; the PM records the go or no-go. Rollout at 100% starts the watch period.
// The guard checks the same split at merge (keys:go for the PM, keys:!go for Ops).

import { isMap, isSeq, parseDocument, type Document } from "yaml";
import type { Change } from "./access.ts";
import { parseFeature, parseRelease } from "./files.ts";
import type { Release } from "./schema/feature.ts";
import type { Flow } from "./schema/project.ts";
import type { FileSource } from "./source.ts";

export type ReleaseEdit =
  | { kind: "smoke"; value: "pending" | "passed" | "failed" }
  | { kind: "go"; value: "go" | "no-go" }
  | { kind: "check"; item: string; done: boolean }
  | { kind: "add-item"; item: string }
  | { kind: "rollout"; stage: number }
  /** The version a team shipped, such as v2.30.0; an empty value clears it. */
  | { kind: "version"; team: string; value: string };

export const releasePath = (slug: string) => `docs/features/${slug}/hub/release.yaml`;

/** What the Release screen shows: the file, with the flow's checklist until Ops first ticks it. */
export function releaseView(specs: FileSource, flow: Flow, slug: string): Release & { checklist: { item: string; done: boolean; user?: string; at?: string }[] } {
  const text = specs.read(releasePath(slug));
  const r = text ? (parseRelease(text, releasePath(slug)).value ?? {}) : {};
  return { ...r, checklist: r.checklist ?? (flow.release.checklist ?? []).map((item) => ({ item, done: false })) };
}

export function releaseChange(specs: FileSource, flow: Flow, slug: string, edit: ReleaseEdit, user: string, at: string): Change {
  const path = releasePath(slug);
  const base = specs.read(path);
  if (base !== undefined && !parseRelease(base, path).value) throw new Error(`${path} is not valid; fix it first`);
  const doc: Document = parseDocument(base?.trim() ? base : "{}");
  if (!base?.trim()) doc.contents = doc.createNode({});
  const current = releaseView(specs, flow, slug);

  switch (edit.kind) {
    case "smoke":
      doc.set("staging", doc.createNode({ smoke: edit.value, at }));
      break;
    case "go":
      doc.set("go", doc.createNode({ value: edit.value, user, at }));
      break;
    case "check":
    case "add-item": {
      const items = current.checklist.map((c) => ({ ...c }));
      if (edit.kind === "add-item") {
        if (!edit.item.trim()) throw new Error("Write the item");
        if (items.some((c) => c.item === edit.item.trim())) throw new Error("The checklist already has that item");
        items.push({ item: edit.item.trim(), done: false });
      } else {
        const it = items.find((c) => c.item === edit.item);
        if (!it) throw new Error(`The checklist has no item "${edit.item}"`);
        it.done = edit.done;
        if (edit.done) Object.assign(it, { user, at });
        else {
          delete it.user;
          delete it.at;
        }
      }
      const node = doc.createNode(items);
      if (isSeq(node)) for (const n of node.items) if (isMap(n)) n.flow = true;
      doc.set("checklist", node);
      break;
    }
    case "version": {
      if (!/^[a-z0-9][a-z0-9-]*$/.test(edit.team)) throw new Error("Name the team by its id, such as backend");
      const value = edit.value.trim();
      if (/[\r\n]/.test(value) || value.length > 100) throw new Error("Write the version on one line, up to 100 characters");
      if (value) {
        if (!doc.has("versions")) {
          const node = doc.createNode({});
          if (isMap(node)) node.flow = true;
          doc.set("versions", node);
        }
        doc.setIn(["versions", edit.team], value);
      } else if (doc.hasIn(["versions", edit.team])) {
        doc.deleteIn(["versions", edit.team]);
        const v = doc.get("versions");
        if (isMap(v) && !v.items.length) doc.delete("versions");
      }
      break;
    }
    case "rollout":
      if (!Number.isFinite(edit.stage) || edit.stage < 0 || edit.stage > 100) throw new Error("The rollout stage is 0 to 100 percent");
      doc.set("rollout", doc.createNode({ stage: edit.stage, at }));
      if (edit.stage >= 100 && !current.watch) doc.set("watch", doc.createNode({ started: at, days: flow.release.watch_days }));
      break;
  }
  const next = doc.toString({ lineWidth: 0 });
  const check = parseRelease(next, path);
  if (!check.value) throw new Error(check.issues.map((i) => i.message).join("; "));
  return { path, ...(base !== undefined ? { base } : {}), next };
}

/** The PM's token estimate of a feature, in millions: estimate.tokens_m in feature.yaml. */
export function estimateChange(specs: FileSource, slug: string, tokensM: [number, number]): Change {
  const path = `docs/features/${slug}/hub/feature.yaml`;
  const base = specs.read(path);
  if (base === undefined) throw new Error(`${slug} has no feature.yaml`);
  const [lo, hi] = tokensM;
  if (!(Number.isFinite(lo) && Number.isFinite(hi) && lo >= 0 && lo <= hi)) throw new Error("Give the low and the high estimate in millions of tokens, low first");
  const doc = parseDocument(base);
  const node = doc.createNode([lo, hi]);
  if (isSeq(node)) node.flow = true;
  doc.setIn(["estimate", "tokens_m"], node);
  const next = doc.toString({ lineWidth: 0 });
  const check = parseFeature(next, path);
  if (!check.value) throw new Error(check.issues.map((i) => i.message).join("; "));
  return { path, base, next };
}

export const LINK_KINDS = ["jira", "confluence", "figma", "staging"] as const;
export interface FeatureDetailsEdit {
  title?: string;
  /** An empty link is removed. */
  links?: Partial<Record<(typeof LINK_KINDS)[number], string>>;
}

/** The PM's light edits of a feature: its title and links in feature.yaml. The rest of the file stays as it is. */
/**
 * The Jira link of a feature: an issue key (SHOP-431) becomes a link on the project's Jira; a full link must be on
 * that Jira. Without Jira in config.yaml, any https link.
 */
export function jiraLink(value: string, jira?: { url?: string }): string {
  const v = value.trim();
  if (/^[A-Z][A-Z0-9]+-\d+$/.test(v)) {
    if (!jira?.url) throw new Error("Jira is not set up for this project: paste the full link to the issue");
    return `${jira.url.replace(/\/+$/, "")}/browse/${v}`;
  }
  if (!/^https:\/\/\S+$/.test(v)) throw new Error("The jira link must start with https://, or be an issue key such as SHOP-431");
  if (jira?.url && new URL(v).host !== new URL(jira.url).host) throw new Error(`The Jira link is on ${new URL(v).host}, not on this project's Jira (${new URL(jira.url).host})`);
  return v;
}

export function featureDetailsChange(specs: FileSource, slug: string, edit: FeatureDetailsEdit, jira?: { url?: string }): Change {
  const path = `docs/features/${slug}/hub/feature.yaml`;
  const base = specs.read(path);
  if (base === undefined) throw new Error(`${slug} has no feature.yaml`);
  const doc = parseDocument(base);
  if (edit.title !== undefined) {
    const title = edit.title.trim();
    if (!title || /[\r\n]/.test(title) || title.length > 120) throw new Error("Write the title on one line, up to 120 characters");
    doc.set("title", title);
  }
  for (const [k, v] of Object.entries(edit.links ?? {})) {
    if (!(LINK_KINDS as readonly string[]).includes(k)) throw new Error(`There is no ${k} link`);
    const url = k === "jira" && (v ?? "").trim() ? jiraLink(v!, jira) : (v ?? "").trim();
    if (url && !/^https:\/\/\S+$/.test(url)) throw new Error(`The ${k} link must start with https://, or be empty`);
    if (url) {
      if (!doc.has("links")) {
        const node = doc.createNode({});
        if (isMap(node)) node.flow = true;
        doc.set("links", node);
      }
      doc.setIn(["links", k], url);
    } else if (doc.hasIn(["links", k])) doc.deleteIn(["links", k]);
  }
  const links = doc.get("links");
  if (isMap(links) && !links.items.length) doc.delete("links");
  const next = doc.toString({ lineWidth: 0 });
  if (next === base) throw new Error("Nothing to change");
  const check = parseFeature(next, path);
  if (!check.value) throw new Error(check.issues.map((i) => i.message).join("; "));
  return { path, base, next };
}

/** A validation report from a read-only run: hub/validation/<yyyymmdd-hhmmss>.md, never changed afterwards. */
export function validationChange(slug: string, report: string, at: string): Change {
  if (!report.trim()) throw new Error("The report is empty");
  const stamp = at.replace(/\.\d+Z$/, "Z").replace(/[-:]/g, "").replace("T", "-").replace("Z", "");
  return { path: `docs/features/${slug}/hub/validation/${stamp}.md`, next: `# Validation of ${slug}, ${at}\n\n${report.trim()}\n` };
}
