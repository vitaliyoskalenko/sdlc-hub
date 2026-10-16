// Shared pieces: the app context, navigation, pills, role chips and command boxes.

import { createContext, type ComponentChildren } from "preact";
import { useContext, useEffect, useRef, useState } from "preact/hooks";
import type { Assistant, Person, ProjectInfo, Save, Session, StepStatus, Summary } from "./api.ts";
import type { Seen } from "./attention.tsx";
import type { Action } from "./home.tsx";
import { roleOf, STATUS } from "./text.ts";
import { hereQuery, toAddress } from "./where.ts";

export interface AppState {
  session: Session;
  me: Person & { assistant: Assistant };
  /** The role a person with several works in now: the focus of Home and Your guide. */
  role: string;
  setRole: (role: string) => void;
  project: ProjectInfo;
  features: Summary[];
  assistant: Assistant;
  /** Bumped when the server says the files changed. */
  version: number;
  go: (path: string, params?: Record<string, string | undefined>) => void;
  help: (command: string) => void;
  /** Opens an action from Home as a task page over the current screen. */
  openTask: (action: Action) => void;
  /** My saves from the site, newest first. */
  saves: Save[];
  /** False when the server cannot save (no remote): controls that save are disabled with that reason. */
  savesEnabled: boolean;
  /** Why saving is off, when the server says (an older hub than the repository's). */
  savesWhy?: string;
  addSave: (save: Save) => void;
  /** The features that changed since this person last looked. */
  seen: Seen;
}

export const App = createContext<AppState | null>(null);
export const useApp = (): AppState => useContext(App)!;

/** The query parameters that follow the viewer from page to page in the demo. */
const KEEP = ["as", "asst"];

/** The page and its query, with the viewer's parameters kept, such as /features?as=iryna.s#section. */
export function pageUrl(path: string, params: Record<string, string | undefined> = {}): string {
  const now = hereQuery();
  const q = new URLSearchParams();
  for (const k of KEEP) if (now.get(k)) q.set(k, now.get(k)!);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") q.set(k, v);
  const s = q.toString();
  // The query comes before a #section, or the browser reads it as part of the section.
  const [page, hash] = path.split("#");
  return page + (s ? `?${s}` : "") + (hash ? `#${hash}` : "");
}

/** The address of a page, for a link. */
export function href(path: string, params: Record<string, string | undefined> = {}): string {
  return toAddress(pageUrl(path, params));
}

export function Link(props: { to: string; params?: Record<string, string | undefined>; class?: string; children: ComponentChildren; label?: string }) {
  const { go } = useApp();
  return (
    <a
      class={props.class}
      href={href(props.to, props.params)}
      aria-label={props.label}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        go(props.to, props.params);
      }}
    >
      {props.children}
    </a>
  );
}

/**
 * An "i" that opens a longer explanation beside a short text: on hover or focus, and on a tap on a touch screen.
 * The popup is placed on the screen, not in its box, so a table or a scrolled map does not cut it; scrolling closes it.
 */
export function Info({ label, id, children }: { label: string; id?: string; children: ComponentChildren }) {
  const [at, setAt] = useState<{ left: number; top: number; width: number; up: boolean } | null>(null);
  const pinned = useRef(false);
  const btn = useRef<HTMLButtonElement>(null);
  const open = () => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const width = Math.min(320, innerWidth - 32);
    // Above the "i" when there is no room for it below.
    const up = innerHeight - r.bottom < 260 && r.top > 260;
    setAt({ left: Math.min(Math.max(16, r.left - 12), innerWidth - 16 - width), top: up ? r.top - 6 : r.bottom + 6, width, up });
  };
  const close = () => ((pinned.current = false), setAt(null));
  useEffect(() => {
    if (!at) return;
    addEventListener("scroll", close, { passive: true, capture: true });
    return () => removeEventListener("scroll", close, { capture: true });
  }, [!!at]);
  return (
    // Inside a row that opens a feature, the "i" and its popup open nothing else.
    <span class="info" onMouseEnter={open} onMouseLeave={() => !pinned.current && setAt(null)} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        ref={btn}
        class="infobtn"
        aria-label={label}
        aria-expanded={!!at}
        aria-describedby={at ? id : undefined}
        onClick={() => (pinned.current ? close() : ((pinned.current = true), open()))}
        onFocus={open}
        onBlur={close}
        onKeyDown={(e) => e.key === "Escape" && close()}
      >
        i
      </button>
      {at && (
        <span class="infotip" role="tooltip" id={id} style={{ left: `${at.left}px`, top: `${at.top}px`, width: `${at.width}px`, ...(at.up ? { transform: "translateY(-100%)" } : {}) }}>
          {children}
        </span>
      )}
    </span>
  );
}

const daysLeft = (n: number) => `${n} day${n === 1 ? "" : "s"} left`;

/** The watch period after the rollout, in a few words, with what it means in the popup. */
export function WatchText({ w, short }: { w: NonNullable<Summary["watch"]>; short?: boolean }) {
  return (
    <span class="watchtext">
      {short ? daysLeft(w.left) : `Live for everyone \u00B7 Ops watches until ${w.until} \u00B7 ${daysLeft(w.left)}`}{" "}
      <Info label="What the watch period means" id="watch-info">
        <b>The watch period</b>
        <span>
          The rollout reached everyone on {w.from}. For {w.days} days Ops watches production: errors, metrics and what users report. If something breaks, Ops can roll back and a bug is filed as usual.
        </span>
        <span>On {w.until} the feature becomes Released by itself: nobody needs to do anything.</span>
        <span class="muted">
          The length is <code>release.watch_days</code> in <code>.hub/flow.yaml</code>.
        </span>
      </Info>
    </span>
  );
}

export const Pill = ({ kind, children, title }: { kind: string; children: ComponentChildren; title?: string }) => (
  <span class={`pill ${kind}`} title={title}>
    {children}
  </span>
);

export const StatusPill = ({ status }: { status: StepStatus }) => <Pill kind={STATUS[status][0]}>{STATUS[status][1]}</Pill>;

export function RoleChip({ role, text }: { role: string; text?: string }) {
  const r = roleOf(role);
  return <span class={`rc role-${r.css}`}>{text ?? r.s}</span>;
}

export function personName(project: ProjectInfo, user: string): string {
  return project.people.find((p) => p.user === user)?.name ?? user;
}

export function roleLabel(p: Person): string {
  const names = p.roles.map((r) => roleOf(r).n).join(" and ");
  return names + (p.team ? ` · ${p.team}${p.lead ? " lead" : ""}` : "");
}

export function names(project: ProjectInfo, users: string[] | undefined): string {
  return (users ?? []).map((u) => personName(project, u)).join(", ");
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
/** A short message at the bottom of the screen, read out by screen readers. */
export function showToast(text: string) {
  let el = document.getElementById("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    el.setAttribute("role", "status");
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el!.hidden = true), 2400);
}

async function copy(text: string, el: HTMLButtonElement, label: string) {
  const short = text.length > 48 ? `${text.slice(0, 45)}…` : text;
  let ok = false;
  try {
    await navigator.clipboard.writeText(text);
    ok = true;
  } catch {
    // Without the clipboard API: a hidden text area and the copy command.
    const t = document.createElement("textarea");
    t.value = text;
    t.style.position = "fixed";
    t.style.opacity = "0";
    document.body.appendChild(t);
    t.select();
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    t.remove();
  }
  el.textContent = ok ? "copied" : "not copied";
  showToast(ok ? `Copied: ${short}` : "Could not copy: select the text and copy it.");
  setTimeout(() => (el.textContent = label), 1500);
}

export function CopyButton({ text, label = "copy" }: { text: string; label?: string }) {
  return (
    <button type="button" class="copy" onClick={(e) => void copy(text, e.currentTarget, label)}>
      {label}
    </button>
  );
}

/** A command to copy, with the "i" button that opens its help. */
export function Cmd({ text }: { text: string }) {
  const { help } = useApp();
  const hasHelp = /^(\/hub:|\$hub-|\/hub-|node hub\/cli\.js )/.test(text);
  return (
    <div class="cmd">
      <code>{text}</code>
      {hasHelp && (
        <button type="button" class="ibtn" data-info={text} aria-label="How to use this command" title="How to use this command" onClick={() => help(text)}>
          i
        </button>
      )}
      <CopyButton text={text} />
    </div>
  );
}

export function Progress({ value }: { value: number }) {
  return (
    <div class="prog" style={{ "--p": `${value}%` }}>
      <i />
      <span>{value}%</span>
    </div>
  );
}

export function Kpi({ value, label, tone, onClick }: { value: string; label: string; tone?: string; onClick?: () => void }) {
  const body = (
    <>
      <b class={tone ?? ""}>{value}</b>
      <span>{label}</span>
    </>
  );
  return onClick ? (
    <button type="button" class="kpi" onClick={onClick}>
      {body}
    </button>
  ) : (
    <div class="kpi">{body}</div>
  );
}

// --- waits between teams, worded the same on every screen

export const teamName = (project: ProjectInfo, id: string): string => project.teams.find((t) => t.id === id)?.name ?? id;

export function listOf(items: string[]): string {
  return items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** "backend:T2" → "Backend T2" */
export function taskLabel(project: ProjectInfo, ref: string): string {
  const [team, task] = ref.split(":");
  return `${teamName(project, team!)} ${task}`;
}

/** "Web, Android and iOS wait for Backend T2" */
export function waitText(project: ProjectInfo, w: Summary["crossWaits"][number]): string {
  return `${listOf(w.teams.map((t) => teamName(project, t)))} wait${w.teams.length === 1 ? "s" : ""} for ${taskLabel(project, w.on)}`;
}

/** The teams of a feature that wait for another team. */
export const waitingTeams = (f: Summary): string[] => [...new Set(f.crossWaits.flatMap((w) => w.teams))];

/** The red marker with the count, the same on the list, the graph and the Now strip. */
export function WaitMark({ project, f }: { project: ProjectInfo; f: Summary }) {
  const n = waitingTeams(f).length;
  if (!n) return null;
  return (
    <span class="waitmark" title={f.crossWaits.map((w) => waitText(project, w)).join("; ")}>
      ⧗ {n} team{n === 1 ? "" : "s"} wait{n === 1 ? "s" : ""}
    </span>
  );
}

/** The issue key of a Jira link (…/browse/SHOP-431), for a button's label; undefined for any other link. */
export function jiraKey(url: string): string | undefined {
  return /\/browse\/([A-Z][A-Z0-9]+-\d+)\b/.exec(url)?.[1];
}

/**
 * A path rule of roles.yaml as people read it: a feature's file by its name, the part of a file it allows in words.
 * The feature's release.yaml with #keys:go is "release.yaml: only the go". The rule itself is the chip's tooltip.
 */
export function ruleText(rule: string): string {
  if (rule === "**") return "everything";
  const [path, part] = rule.split("#") as [string, string | undefined];
  const inFeature = path.startsWith("docs/features/*/");
  const file = (inFeature ? path.slice("docs/features/*/".length) : `project · ${path}`).replace(/\/\*\*$/, "/ (all in it)");
  if (!part) return file;
  if (part.startsWith("front:")) return `${file}: only ${part.slice(6).replace(/_/g, " ")} in its header`;
  if (part.startsWith("keys:!")) return `${file}: all but the ${part.slice(6).replace(/_/g, " ")}`;
  if (part.startsWith("keys:")) return `${file}: only the ${part.slice(5).replace(/_/g, " ")}`;
  return `${file}: the "${part}" section`;
}
