// The release of a feature on the site: release.yaml, field by field. Ops records the staging smoke check, ticks the
// checklist and sets the rollout stage; the PM records the go or no-go. Rollout at 100% starts the watch period.
// The guard checks the same split at merge (keys:go for the PM, keys:!go for Ops).

import { isMap, isSeq, parseDocument, type Document } from "yaml";
import type { Change } from "./access.ts";
import { parseRelease } from "./files.ts";
import type { Release } from "./schema/feature.ts";
import type { Flow } from "./schema/project.ts";
import type { FileSource } from "./source.ts";

export type ReleaseEdit =
  | { kind: "smoke"; value: "pending" | "passed" | "failed" }
  | { kind: "go"; value: "go" | "no-go" }
  | { kind: "check"; item: string; done: boolean }
  | { kind: "add-item"; item: string }
  | { kind: "rollout"; stage: number };

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
