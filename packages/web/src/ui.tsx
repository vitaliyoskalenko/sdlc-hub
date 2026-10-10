// Shared pieces: the app context, navigation, pills, role chips and command boxes.

import { createContext, type ComponentChildren } from "preact";
import { useContext } from "preact/hooks";
import type { Assistant, Person, ProjectInfo, Save, Session, StepStatus, Summary } from "./api.ts";
import type { Action } from "./home.tsx";
import { roleOf, STATUS } from "./text.ts";

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
}

export const App = createContext<AppState | null>(null);
export const useApp = (): AppState => useContext(App)!;

/** The query parameters that follow the viewer from page to page in the demo. */
const KEEP = ["as", "asst"];

export function href(path: string, params: Record<string, string | undefined> = {}): string {
  const now = new URLSearchParams(location.search);
  const q = new URLSearchParams();
  for (const k of KEEP) if (now.get(k)) q.set(k, now.get(k)!);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") q.set(k, v);
  const s = q.toString();
  return path + (s ? `?${s}` : "");
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

async function copy(text: string, el: HTMLButtonElement) {
  try {
    await navigator.clipboard.writeText(text);
    el.textContent = "copied";
  } catch {
    el.textContent = "select and copy";
  }
  setTimeout(() => (el.textContent = "copy"), 1500);
}

export function CopyButton({ text, label = "copy" }: { text: string; label?: string }) {
  return (
    <button type="button" class="copy" onClick={(e) => copy(text, e.currentTarget)}>
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
