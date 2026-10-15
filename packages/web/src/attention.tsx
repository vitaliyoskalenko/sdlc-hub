// What needs a look: the features whose step moved since this person last looked, and a browser notification when
// a new action reaches them while the site is in the background. Both are kept in this browser only.

import { useEffect, useRef, useState } from "preact/hooks";
import type { ProjectInfo, Summary } from "./api.ts";
import type { Action } from "./home.tsx";
import { STATUS } from "./text.ts";
import { showToast } from "./ui.tsx";
import { SAMPLE } from "./where.ts";

const read = (k: string): string | null => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* kept for this visit only */
  }
};

export interface Seen {
  /** What changed in a feature since this person last looked, or null. */
  changed: (slug: string) => string | null;
  /** How many features changed. */
  count: number;
  mark: (slug: string) => void;
  markAll: () => void;
}

const stateOf = (f: Summary) => (f.released ? "released|done" : `${f.current}|${f.status}`);

/** The first visit takes everything as seen; later visits compare with what was seen. */
export function useSeen(project: ProjectInfo | null, user: string | undefined, features: Summary[] | null): Seen {
  const key = project && user ? `hub.seen.${project.project.namespace}/${project.project.repo}.${user}` : "";
  const [map, setMap] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    if (!key || !features) return;
    let m: Record<string, string> | null = null;
    try {
      m = JSON.parse(read(key) ?? "null") as Record<string, string> | null;
    } catch {
      m = null;
    }
    if (!m || typeof m !== "object") {
      m = Object.fromEntries(features.map((f) => [f.slug, stateOf(f)]));
      write(key, JSON.stringify(m));
    }
    setMap(m);
  }, [key, features === null]);
  const changed = (slug: string): string | null => {
    const f = features?.find((x) => x.slug === slug);
    if (!map || !f) return null;
    const was = map[slug];
    if (was === undefined) return "new";
    if (was === stateOf(f)) return null;
    if (f.released) return "released";
    return was.split("|")[0] !== f.current ? `moved to ${f.current}` : `now ${STATUS[f.status][1].toLowerCase()}`;
  };
  const save = (next: Record<string, string>) => {
    setMap(next);
    write(key, JSON.stringify(next));
  };
  const list = features ?? [];
  return {
    changed,
    count: list.filter((f) => changed(f.slug) !== null).length,
    mark: (slug) => {
      const f = list.find((x) => x.slug === slug);
      if (map && f && map[slug] !== stateOf(f)) save({ ...map, [slug]: stateOf(f) });
    },
    markAll: () => map && save(Object.fromEntries(list.map((f) => [f.slug, stateOf(f)]))),
  };
}

const notifyKey = (user: string) => `hub.notify.${user}`;
const actionKey = (a: Action) => `${a.slug}|${a.step}|${a.kind}|${a.title}`;
const canNotify = () => typeof Notification !== "undefined";

/** A notification for each new action, while the site is in the background and the person turned them on. */
export function useActionNotifications(acts: Action[] | null, user: string | undefined, open: (a: Action) => void) {
  const before = useRef<{ user: string; keys: Set<string> } | null>(null);
  const opener = useRef(open);
  opener.current = open;
  const keys = acts?.map(actionKey).join("\n") ?? "";
  useEffect(() => {
    if (!acts || !user) return;
    // Another person (the demo's picker) starts again: their actions are not new.
    const was = before.current?.user === user ? before.current.keys : null;
    before.current = { user, keys: new Set(acts.map(actionKey)) };
    if (!was || !canNotify() || Notification.permission !== "granted" || read(notifyKey(user)) !== "on" || !document.hidden) return;
    for (const a of acts.filter((x) => !was.has(actionKey(x)))) {
      const n = new Notification(a.title, { body: a.text, tag: actionKey(a) });
      n.onclick = () => {
        focus();
        opener.current(a);
        n.close();
      };
    }
  }, [keys, user]);
}

/** The switch for those notifications, on Home. */
export function NotifyToggle({ user }: { user: string }) {
  const [on, setOn] = useState(() => canNotify() && Notification.permission === "granted" && read(notifyKey(user)) === "on");
  const [blocked, setBlocked] = useState(() => canNotify() && Notification.permission === "denied");
  if (!canNotify() || SAMPLE) return null;
  if (blocked)
    return (
      <span class="notify-off">
        <span class="reason">Blocked in the browser's settings</span>
        <button type="button" class="btn sm" id="notify" disabled title="Notifications are blocked for this site in the browser's settings: allow them there to use this">
          Notify me
        </button>
      </span>
    );
  const toggle = async () => {
    if (on) {
      write(notifyKey(user), "off");
      setOn(false);
      return;
    }
    const p = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
    if (p !== "granted") return setBlocked(true);
    write(notifyKey(user), "on");
    setOn(true);
    showToast("The browser tells you when something new waits for you, while this tab is in the background.");
  };
  return (
    <button type="button" class="btn sm" id="notify" aria-pressed={on} title="A browser notification when a new action reaches you, while this tab is in the background" onClick={() => void toggle()}>
      {on ? "Notifications on" : "Notify me"}
    </button>
  );
}
