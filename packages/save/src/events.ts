// Stage events: started and finished, for the Running status and lead time. The plugin queues them in the git
// directory and pushes them to hub-state at once, or at the next hub sync when the host cannot be reached. An event
// carries no username: the site names the person from the git author of the commit that added it.

import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { eventSchema, type HubEvent } from "@sdlc-hub/core";
import { writeHubState } from "./hub-state.ts";

export interface QueuedEvent extends HubEvent {
  slug: string;
}

function queueFile(root: string): string {
  const d = execFileSync("git", ["rev-parse", "--git-common-dir"], { cwd: root, encoding: "utf8" }).trim();
  return join(isAbsolute(d) ? d : resolve(root, d), "sdlc-hub", "events.jsonl");
}

/** Adds an event to this machine's queue. */
export function queueEvent(root: string, e: QueuedEvent): void {
  const { slug, ...event } = e;
  const checked = eventSchema.safeParse(event);
  if (!checked.success || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) throw new Error(`Not a valid event: ${JSON.stringify(e)}`);
  const file = queueFile(root);
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, `${JSON.stringify({ slug, ...checked.data })}\n`);
}

/** The events this machine has not pushed yet: those of a push that failed first. */
export function queuedEvents(root: string): QueuedEvent[] {
  const file = queueFile(root);
  return [`${file}.sending`, file]
    .filter((f) => existsSync(f))
    .flatMap((f) => readFileSync(f, "utf8").split("\n"))
    .filter(Boolean)
    .flatMap((l) => {
      try {
        return [JSON.parse(l) as QueuedEvent];
      } catch {
        return [];
      }
    });
}

/**
 * Pushes the queue to hub-state, each event appended to features/<slug>/events.jsonl, in one commit in the person's
 * name. Returns how many were pushed; the queue keeps them when the push fails.
 */
export function flushEvents(root: string, o: { url: string; author: { name: string; email: string }; env?: NodeJS.ProcessEnv }): number {
  const file = queueFile(root);
  const sending = `${file}.sending`;
  if (!existsSync(file) && !existsSync(sending)) return 0;
  // Events queued while this push runs go to a new queue file, not lost when this one is removed.
  if (!existsSync(sending)) renameSync(file, sending);
  else if (existsSync(file)) {
    appendFileSync(sending, readFileSync(file, "utf8"));
    rmSync(file);
  }
  const events = readFileSync(sending, "utf8").split("\n").filter(Boolean);
  if (!events.length) {
    rmSync(sending);
    return 0;
  }
  const bySlug = new Map<string, string[]>();
  for (const line of events) {
    const { slug, ...event } = JSON.parse(line) as QueuedEvent;
    bySlug.set(slug, [...(bySlug.get(slug) ?? []), JSON.stringify(event)]);
  }
  writeHubState({
    url: o.url,
    author: o.author,
    ...(o.env ? { env: o.env } : {}),
    message: `hub: ${events.length} stage event${events.length === 1 ? "" : "s"} (${[...bySlug.keys()].join(", ")})`,
    edit(dir) {
      for (const [slug, lines] of bySlug) {
        const path = join(dir, "features", slug, "events.jsonl");
        mkdirSync(dirname(path), { recursive: true });
        const before = existsSync(path) ? readFileSync(path, "utf8") : "";
        writeFileSync(path, `${before}${before && !before.endsWith("\n") ? "\n" : ""}${lines.join("\n")}\n`);
      }
      return true;
    },
  });
  rmSync(sending);
  return events.length;
}
