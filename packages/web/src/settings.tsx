// Settings: what .hub/config.yaml says, and what the admin may change from the site. A change is a save, a merge
// request on config.yaml that only the admin role passes. Repositories, teams and the engine are set at install.

import { useState } from "preact/hooks";
import type { GuardCheck, Price, ProjectInfo } from "./api.ts";
import { GuidesCard } from "./guides.tsx";
import { PendingList, useAction } from "./saves.tsx";
import { roleOf } from "./text.ts";
import { Pill, useApp } from "./ui.tsx";

const CHECKS: [GuardCheck, string, string][] = [
  ["files", "Files by role", "Who may change which files, from roles.yaml. Off: anyone in roles.yaml may change any file."],
  ["signoffs", "Who signs a gate", "A sign-off or QA decision comes from the step's role. Off: anyone in roles.yaml may sign, in their own name."],
  ["pushers", "Everyone who pushed", "Judge every person who pushed to the branch. Off: only its author is judged."],
  ["members", "People not in roles.yaml", "Refuse a change from someone who is not in roles.yaml. Off: anyone with access to the repository may change files."],
];
const ASSISTANTS: [string, string][] = [
  ["claude", "Claude Code"],
  ["codex", "Codex"],
  ["cursor", "Cursor"],
];

type Form = { mode: "enforce" | "advisory"; checks: Record<GuardCheck, boolean>; codex: boolean; cursor: boolean; headless: boolean; confluence: string; figma: string };

const formOf = (p: ProjectInfo): Form => ({
  mode: p.settings.guard.mode,
  checks: { ...p.settings.guard.checks },
  codex: p.settings.assistants.includes("codex"),
  cursor: p.settings.assistants.includes("cursor"),
  headless: p.headless,
  confluence: p.settings.links.confluence ?? "",
  figma: p.settings.links.figma ?? "",
});

/** Only what differs from config.yaml, so a save names exactly what changed. */
function editOf(was: Form, f: Form): Record<string, unknown> {
  const edit: Record<string, unknown> = {};
  const guard: Record<string, unknown> = {};
  if (f.mode !== was.mode) guard["mode"] = f.mode;
  const checks = Object.fromEntries(CHECKS.filter(([k]) => f.checks[k] !== was.checks[k]).map(([k]) => [k, f.checks[k]]));
  if (Object.keys(checks).length) guard["checks"] = checks;
  if (Object.keys(guard).length) edit["guard"] = guard;
  const assistants = Object.fromEntries((["codex", "cursor"] as const).filter((k) => f[k] !== was[k]).map((k) => [k, f[k]]));
  if (Object.keys(assistants).length) edit["assistants"] = assistants;
  if (f.headless !== was.headless) edit["headless"] = f.headless;
  const links = Object.fromEntries((["confluence", "figma"] as const).filter((k) => f[k].trim() !== was[k]).map((k) => [k, f[k].trim()]));
  if (Object.keys(links).length) edit["links"] = links;
  return edit;
}

const KINDS = ["backend", "web", "android", "ios", "desktop", "other"] as const;

/** A team repository added after install: config.yaml by a save, then the admin connects it from their machine. */
function AddTeam({ host }: { host: { n: string; cr: string } }) {
  const { me, project, savesEnabled } = useApp();
  const { run, busy, problem } = useAction();
  const [open, setOpen] = useState(false);
  const [t, setT] = useState({ name: "", repo: "", kind: "backend" as string });
  const [sent, setSent] = useState(false);
  if (!me.roles.includes("admin")) return <p class="muted">Repositories, teams and the engine are set at install; the admin adds a team here.</p>;
  if (sent)
    return (
      <p class="note" id="team-next">
        When the change merges, run <code>node hub/cli.js connect-teams</code> in your clone of {project.project.repo}. It opens the hub-report {host.cr} in the new repository and sets up its fan-out, with your setup token.
      </p>
    );
  if (!open)
    return (
      <div class="row">
        <button type="button" class="btn" id="add-team" disabled={!savesEnabled} onClick={() => setOpen(true)}>
          Add a team
        </button>
        <span class="muted">The engine is set at install; run setup again to change it.</span>
      </div>
    );
  return (
    <div id="team-form">
      <div class="form">
        <label class="fld">
          <span>Team name</span>
          <input type="text" id="tf-name" value={t.name} placeholder="Desktop" onInput={(e) => setT({ ...t, name: (e.target as HTMLInputElement).value })} />
        </label>
        <label class="fld">
          <span>Repository in {project.project.namespace}</span>
          <input type="text" id="tf-repo" value={t.repo} placeholder="desktop-app" onInput={(e) => setT({ ...t, repo: (e.target as HTMLInputElement).value })} />
        </label>
        <label class="fld">
          <span>Kind</span>
          <select id="tf-kind" value={t.kind} onChange={(e) => setT({ ...t, kind: (e.target as HTMLSelectElement).value })}>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div class="row">
        <button type="button" class="btn pri" id="tf-save" disabled={!t.name.trim() || !t.repo.trim() || busy} onClick={() => void run("settings", { edit: { addTeam: { name: t.name.trim(), repo: t.repo.trim(), kind: t.kind } } }).then((ok) => ok && setSent(true))}>
          {busy ? "Saving…" : "Add the team"}
        </button>
        <button type="button" class="btn" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      {problem}
    </div>
  );
}

const PRICE_COLS: [keyof Price, string][] = [
  ["input", "Input"],
  ["cache_write_5m", "Cache write 5 min"],
  ["cache_write_1h", "Cache write 1 h"],
  ["cache_read", "Cache read"],
  ["output", "Output"],
];

/** The prices the hub uses for API-equivalent cost: its own table, and the project's overrides in config.yaml. */
function Prices() {
  const { me, project, savesEnabled } = useApp();
  const { run, busy, problem } = useAction();
  const admin = me.roles.includes("admin");
  const { asOf, defaults, overrides } = project.settings.prices;
  const models = [...new Set([...Object.keys(defaults), ...Object.keys(overrides)])].sort();
  const [editing, setEditing] = useState<{ model: string; p: Price } | null>(null);
  const save = (model: string, p: Price | null) => void run("settings", { edit: { prices: { [model]: p } } }).then((ok) => ok && setEditing(null));
  return (
    <div class="card" id="set-prices">
      <h3>Prices, USD per million tokens</h3>
      <p class="muted">
        The hub's table is from the provider's price list as read on {asOf}. Costs are what the same work would cost at these prices; on seats it is not billed per token. An override in <code>config.yaml</code> wins for that model and every model id it starts.
      </p>
      <div class="scroll">
        <table>
          <thead>
            <tr>
              <th>Model</th>
              {PRICE_COLS.map(([, l]) => (
                <th key={l} class="num">
                  {l}
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {models.map((m) => {
              const p = overrides[m] ?? defaults[m]!;
              const mine = editing?.model === m;
              return (
                <tr key={m} data-model={m}>
                  <td class="nw">
                    <code>{m}</code> {overrides[m] && <Pill kind="info">override</Pill>}
                  </td>
                  {PRICE_COLS.map(([k]) => (
                    <td key={k} class="num">
                      {mine ? (
                        <input type="number" min="0" step="0.01" class="price" aria-label={`${m} ${k}`} value={editing!.p[k]} onInput={(e) => setEditing({ model: m, p: { ...editing!.p, [k]: Number((e.target as HTMLInputElement).value) } })} />
                      ) : (
                        `$${p[k]}`
                      )}
                    </td>
                  ))}
                  <td class="nw">
                    {admin && !mine && (
                      <button type="button" class="btn sm" data-edit-price={m} disabled={!savesEnabled || busy} onClick={() => setEditing({ model: m, p: { ...p } })}>
                        Edit
                      </button>
                    )}
                    {mine && (
                      <>
                        <button type="button" class="btn sm pri" data-save-price={m} disabled={busy} onClick={() => save(m, editing!.p)}>
                          Save
                        </button>{" "}
                        <button type="button" class="btn sm" onClick={() => setEditing(null)}>
                          Cancel
                        </button>
                      </>
                    )}
                    {admin && !mine && overrides[m] && defaults[m] && (
                      <button type="button" class="btn sm" data-reset-price={m} disabled={!savesEnabled || busy} onClick={() => save(m, null)}>
                        Use the hub's
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {problem}
    </div>
  );
}

export function Settings() {
  const { me, project, saves, savesEnabled } = useApp();
  const admin = me.roles.includes("admin");
  const was = formOf(project);
  const [f, setF] = useState<Form>(was);
  const { run, busy, problem } = useAction();
  const pending = saves.filter((s) => s.meta?.["kind"] === "settings" && s.state !== "merged");
  const edit = editOf(was, f);
  const changed = Object.keys(edit).length > 0;
  const dis = !admin || busy;
  const why = !admin ? `Only the admin changes Settings. As ${me.roles.map((r) => roleOf(r).n).join(" and ")} you can read them.` : !savesEnabled ? "This checkout has no remote to save to." : !changed ? "Change something first." : pending.length ? "Your earlier change to Settings is still waiting to merge." : "";
  const host = project.project.provider === "github" ? { n: "GitHub", cr: "pull request" } : { n: "GitLab", cr: "merge request" };
  const g = project.settings.guard;
  const off = CHECKS.filter(([k]) => !g.checks[k]).map(([, t]) => t.toLowerCase());

  return (
    <>
      <div class="ph">
        <div>
          <h1>Settings</h1>
          <p class="sub">
            Stored in <code>.hub/config.yaml</code>. Saving opens a {host.cr} that only the admin role can pass.
          </p>
        </div>
      </div>
      {!admin && <p class="note warn">{why}</p>}
      <div class="grid2">
        <div class="card" id="set-guard">
          <h3>How strict hub-guard is</h3>
          <p>
            Now: {g.mode === "enforce" ? <Pill kind="ok">enforce</Pill> : <Pill kind="warn">advisory</Pill>} {off.length ? `· off: ${off.join(", ")}` : "· every check on"}
          </p>
          <fieldset class="fld" disabled={dis}>
            <span>Mode</span>
            <label class="check">
              <input type="radio" name="guard-mode" id="set-mode-enforce" checked={f.mode === "enforce"} onChange={() => setF({ ...f, mode: "enforce" })} />
              <div>
                <b>Enforce</b>
                <span>A change that breaks a rule does not merge.</span>
              </div>
            </label>
            <label class="check">
              <input type="radio" name="guard-mode" id="set-mode-advisory" checked={f.mode === "advisory"} onChange={() => setF({ ...f, mode: "advisory" })} />
              <div>
                <b>Advisory</b>
                <span>hub-guard lists what breaks a rule on the {host.cr}, in hub-state and here, and the change merges anyway.</span>
              </div>
            </label>
          </fieldset>
          <fieldset class="fld" disabled={dis}>
            <span>Checks</span>
            {CHECKS.map(([k, t, s]) => (
              <label class="check" key={k}>
                <input type="checkbox" id={`set-check-${k}`} checked={f.checks[k]} onChange={(e) => setF({ ...f, checks: { ...f.checks, [k]: (e.target as HTMLInputElement).checked } })} />
                <div>
                  <b>{t}</b>
                  <span>{s}</span>
                </div>
              </label>
            ))}
          </fieldset>
          <p class="muted">
            Whatever these say, even in advisory mode, only the admin changes <code>.hub/</code>, <code>hub/</code>, the assistants' files (<code>.claude/</code>, <code>.agents/</code>, <code>CLAUDE.md</code> and the like) and CI files: they run on every machine. The settings on <code>main</code> judge each change, so a {host.cr} cannot loosen its own check.
          </p>
          {!project.settings.autoMerge && <p class="muted">This project has no auto-merge on {host.n}: every {host.cr} waits for someone to merge it.</p>}
        </div>
        <div class="stack">
          <div class="card" id="set-assistants">
            <h3>Assistants</h3>
            <p>People choose from the assistants allowed here.</p>
            <div class="checks">
              {ASSISTANTS.map(([k, n]) => (
                <label key={k}>
                  <input type="checkbox" id={`set-asst-${k}`} checked={k === "claude" || f[k as "codex"]} disabled={k === "claude" || dis} onChange={(e) => setF({ ...f, [k]: (e.target as HTMLInputElement).checked })} /> {n}
                </label>
              ))}
            </div>
            <p class="muted">Claude Code is always on. A newly allowed assistant gets its files with the next install run.</p>
            <h3>Headless runs</h3>
            <label class="switch">
              <input type="checkbox" id="set-headless" checked={f.headless} disabled={dis} onChange={(e) => setF({ ...f, headless: (e.target as HTMLInputElement).checked })} /> Allow "Validate now" from the site
            </label>
            <p class="muted">Off by default. When on, the local server starts the person's own assistant, read-only, with a turn limit.</p>
          </div>
          <div class="card" id="set-links">
            <h3>Links</h3>
            <div class="form">
              <label class="fld full">
                <span>Confluence space</span>
                <input type="url" id="set-confluence" value={f.confluence} disabled={dis} placeholder="https://" onInput={(e) => setF({ ...f, confluence: (e.target as HTMLInputElement).value })} />
              </label>
              <label class="fld full">
                <span>Figma project</span>
                <input type="url" id="set-figma" value={f.figma} disabled={dis} placeholder="https://" onInput={(e) => setF({ ...f, figma: (e.target as HTMLInputElement).value })} />
              </label>
            </div>
          </div>
        </div>
      </div>
      <div class="row">
        <button type="button" class="btn pri" id="set-save" disabled={!!why || busy} onClick={() => void run("settings", { edit })}>
          {busy ? "Saving…" : "Save settings"}
        </button>
        {admin && changed && (
          <button type="button" class="btn" id="set-reset" disabled={busy} onClick={() => setF(was)}>
            Undo changes
          </button>
        )}
        {admin && why && <span class="reason">{why}</span>}
      </div>
      {problem}
      <PendingList saves={pending} />
      <Prices />
      <GuidesCard />
      <div class="card" id="set-project">
        <h3>Project</h3>
        <div class="kv">
          <span class="k">Name</span>
          <span>{project.project.name}</span>
          <span class="k">Specifications</span>
          <span>
            <code>
              {project.project.namespace}/{project.project.repo}
            </code>{" "}
            on {host.n} · <code>{project.project.host}</code>
          </span>
          <span class="k">Issue tracker</span>
          <span>{project.tracker.type === "jira" ? `Jira · project key ${project.tracker.project_key ?? ""}` : "None: tasks and bugs live in the repository"}</span>
          <span class="k">Engine</span>
          <span>
            <code>{project.engine.id}</code> {project.engine.version}
          </span>
        </div>
        <div class="scroll">
          <table>
            <thead>
              <tr>
                <th>Team</th>
                <th>Repository</th>
                <th>Kind</th>
              </tr>
            </thead>
            <tbody>
              {project.teams.map((t) => (
                <tr key={t.id}>
                  <td class="nw">
                    {t.name}
                    {t.api_contract ? " · API contract" : ""}
                  </td>
                  <td class="nw">
                    <code>{t.repo}</code>
                  </td>
                  <td class="nw">{t.kind}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <AddTeam host={host} />
      </div>
    </>
  );
}
