// People and roles, and the setup script for one person. Everyone reads; only the admin changes people, through a
// merge request on .hub/roles.yaml that only the admin role passes. A script carries nothing secret.

import { useEffect, useState } from "preact/hooks";
import { api, type Finding, type PersonInput, type PersonRow } from "./api.ts";
import { SaveState } from "./saves.tsx";
import { roleOf } from "./text.ts";
import { CopyButton, Link, Pill, RoleChip, teamName, useApp } from "./ui.tsx";

const ASSISTANTS: Record<string, string> = { claude: "Claude Code", codex: "Codex", cursor: "Cursor" };
const SYSTEMS: Record<string, string> = { macos: "macOS", linux: "Linux", windows: "Windows" };
const BUILTIN = ["po", "pm", "designer", "dev", "qa", "ops", "admin"];

function AdminNote() {
  const { me } = useApp();
  if (me.roles.includes("admin")) return null;
  return <p class="note warn">Only the admin changes people. As {me.roles.map((r) => roleOf(r).n).join(" and ")} you can read everything here.</p>;
}

function usePeople() {
  const { version, saves } = useApp();
  const [rows, setRows] = useState<PersonRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    api.people().then((r) => live && setRows(r.people), (e) => live && setError(String(e)));
    return () => {
      live = false;
    };
  }, [version, saves.filter((s) => s.state === "merged").length]);
  return { rows, error };
}

function Problem({ error, findings }: { error: string; findings?: Finding[] }) {
  return (
    <div class="problem" role="alert">
      <p>{error}</p>
      {findings && (
        <ul class="findings">
          {findings.map((f, i) => (
            <li key={i}>
              <code>{f.path}</code> — {f.reason}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PersonForm({ editing, close }: { editing: PersonRow | null; close: () => void }) {
  const { project, me, session, addSave } = useApp();
  const roles = [...new Set([...BUILTIN, ...Object.keys(project.rules.roles)])];
  const [f, setF] = useState<PersonInput>(() =>
    editing ? { user: editing.user, name: editing.name, roles: editing.roles, ...(editing.team ? { team: editing.team } : {}), lead: editing.lead, ...(editing.os ? { os: editing.os } : {}), assistant: editing.assistant } : { user: "", name: "", roles: ["dev"], assistant: "claude", os: "macos" },
  );
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<{ error: string; findings?: Finding[] } | null>(null);
  const set = (k: keyof PersonInput, v: unknown) => setF((x) => ({ ...x, [k]: v }));
  const engineering = f.roles.includes("dev");
  const missing = !f.user.trim() ? "Give the username" : !f.name.trim() ? "Give the name" : !f.roles.length ? "Choose at least one role" : f.lead && !f.team ? "A lead needs a team" : "";

  const save = async () => {
    setBusy(true);
    setProblem(null);
    const person: PersonInput = { ...f, user: f.user.trim(), name: f.name.trim(), ...(engineering || f.lead ? {} : { team: undefined, lead: false }) };
    if (!person.team) delete person.team;
    const r = await api.person(session.demo ? me.user : undefined, { kind: "set", person });
    setBusy(false);
    if (r.ok) {
      addSave(r.save);
      close();
    } else setProblem({ error: r.error, ...(r.findings ? { findings: r.findings } : {}) });
  };

  return (
    <div class="card" id="person-form">
      <h3>{editing ? `Change ${editing.name}` : "New person"}</h3>
      <div class="form">
        <label class="fld">
          <span>{project.project.provider === "github" ? "GitHub" : "GitLab"} username</span>
          <input type="text" id="pf-user" value={f.user} disabled={!!editing} placeholder="name.s" autocomplete="off" onInput={(e) => set("user", (e.target as HTMLInputElement).value)} />
        </label>
        <label class="fld">
          <span>Name</span>
          <input type="text" id="pf-name" value={f.name} placeholder="Name S." autocomplete="off" onInput={(e) => set("name", (e.target as HTMLInputElement).value)} />
        </label>
        <fieldset class="fld full">
          <span>Roles</span>
          <div class="fpick">
            {roles.map((r) => (
              <button
                type="button"
                key={r}
                class="chipbtn"
                data-role={r}
                aria-pressed={f.roles.includes(r)}
                onClick={() => set("roles", f.roles.includes(r) ? f.roles.filter((x) => x !== r) : [...f.roles, r])}
              >
                {roleOf(r).n}
              </button>
            ))}
          </div>
        </fieldset>
        <label class="fld">
          <span>Team, for engineering</span>
          <select id="pf-team" value={f.team ?? ""} disabled={!engineering} onChange={(e) => set("team", (e.target as HTMLSelectElement).value || undefined)}>
            <option value="">none</option>
            {project.teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label class="fld">
          <span>Assistant</span>
          <select id="pf-asst" value={f.assistant} onChange={(e) => set("assistant", (e.target as HTMLSelectElement).value)}>
            {Object.entries(ASSISTANTS).map(([k, n]) => (
              <option key={k} value={k}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label class="fld">
          <span>System</span>
          <select id="pf-os" value={f.os ?? "macos"} onChange={(e) => set("os", (e.target as HTMLSelectElement).value)}>
            {Object.entries(SYSTEMS).map(([k, n]) => (
              <option key={k} value={k}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label class="switch full">
          <input type="checkbox" id="pf-lead" checked={!!f.lead} disabled={!engineering} onChange={(e) => set("lead", (e.target as HTMLInputElement).checked)} /> Team lead: signs the team's steps and edits its design documents
        </label>
      </div>
      <div class="row">
        <button type="button" class="btn pri" id="pf-save" disabled={!!missing || busy} onClick={() => void save()}>
          Save and open a merge request
        </button>
        <button type="button" class="btn" onClick={close}>
          Cancel
        </button>
        <span class="reason">{missing || (busy ? "Saving…" : "Written to .hub/roles.yaml. Add the person to the group on the host yourself.")}</span>
      </div>
      {problem && <Problem {...problem} />}
    </div>
  );
}

export function People() {
  const { me, project, go, saves, session, addSave } = useApp();
  const { rows, error } = usePeople();
  const [form, setForm] = useState<{ editing: PersonRow | null } | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [problem, setProblem] = useState<{ error: string; findings?: Finding[] } | null>(null);
  const admin = me.roles.includes("admin");
  // The admin sees who is missing from the group or organization; the host answers this machine's own credential.
  const [members, setMembers] = useState<{ users: string[] } | { error: string } | null>(null);
  useEffect(() => {
    if (admin) api.members(session.demo ? me.user : undefined).then(setMembers, () => setMembers(null));
  }, [admin, rows?.length]);
  const github = project.project.provider === "github";
  const hostName = github ? "GitHub" : "GitLab";
  const groupWord = github ? "organization" : "group";
  const pending = saves.filter((s) => s.meta?.["kind"] === "person" && s.state !== "merged");
  const pendingOf = (user: string) => pending.find((s) => s.meta?.["person"] === user && s.state === "pending");

  const remove = async (user: string) => {
    setProblem(null);
    const r = await api.person(session.demo ? me.user : undefined, { kind: "remove", user });
    setRemoving(null);
    if (r.ok) addSave(r.save);
    else setProblem({ error: r.error, ...(r.findings ? { findings: r.findings } : {}) });
  };

  return (
    <>
      <div class="ph">
        <div>
          <h1>People and roles</h1>
          <p class="sub">
            Stored in <code>.hub/roles.yaml</code>. Saving opens a merge request that only the admin role can pass. <Link to="/guides/people">How adding a person works</Link>
          </p>
        </div>
        {!form && (
          <span class="row">
            <button type="button" class="btn pri" id="add-person" disabled={!admin} onClick={() => setForm({ editing: null })}>
              Add a person
            </button>
            {!admin && <span class="reason">Only the admin adds people.</span>}
          </span>
        )}
      </div>
      <AdminNote />
      {admin && members && "error" in members && <p class="muted" id="members-note">Membership in the {groupWord} is not checked: {members.error}.</p>}
      {form && admin && <PersonForm editing={form.editing} close={() => setForm(null)} />}
      {problem && <Problem {...problem} />}
      {pending.length > 0 && (
        <div class="card" id="people-saves">
          <span class="k">Changes to people</span>
          {pending.map((s) => (
            <div class="row" key={s.branch} data-save={s.state}>
              <span>{s.title}</span>
              <SaveState save={s} />
              {s.findings?.map((f, i) => (
                <span key={i} class="reason">
                  {f.reason}
                </span>
              ))}
            </div>
          ))}
        </div>
      )}
      {error && <Problem error={error} />}
      {!rows ? (
        !error && <p class="muted">Loading people…</p>
      ) : (
        <div class="scroll">
          <table id="people">
            <thead>
              <tr>
                <th>Person</th>
                <th>Username</th>
                <th>Role</th>
                <th>Assistant</th>
                <th>System</th>
                <th>Setup</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const wait = pendingOf(p.user);
                return (
                  <tr key={p.user} data-user={p.user}>
                    <td class="nw">{p.name}</td>
                    <td class="nw">
                      <code>{p.user}</code>
                    </td>
                    <td class="nw">
                      {p.roles.map((r) => (
                        <RoleChip key={r} role={r} />
                      ))}{" "}
                      {p.team ? `${teamName(project, p.team)}${p.lead ? " lead" : ""}` : ""}
                    </td>
                    <td class="nw">{ASSISTANTS[p.assistant]}</td>
                    <td class="nw">{p.os ? SYSTEMS[p.os] : <span class="muted">not set</span>}</td>
                    <td class="nw">
                      {members && "users" in members && !members.users.includes(p.user) && (
                        <Pill kind="warn" title={`${p.user} is not in ${project.project.namespace} on ${hostName}: they cannot clone or save until the admin adds them there`}>
                          not in the {groupWord}
                        </Pill>
                      )}{" "}
                      {wait ? <SaveState save={wait} /> : p.setup ? <Pill kind="ok">set up {p.setup.setup_at.slice(0, 10)}</Pill> : <Pill kind="mute">not set up</Pill>}</td>
                    <td class="nw">
                      <span class="row">
                        <button type="button" class="btn sm" data-script={p.user} onClick={() => go(`/people/${p.user}/script`)}>
                          Setup script
                        </button>
                        {admin && !wait && !form && (
                          <>
                            <button type="button" class="btn sm" data-edit={p.user} onClick={() => setForm({ editing: p })}>
                              Change
                            </button>
                            {removing === p.user ? (
                              <button type="button" class="btn sm bad" data-confirm-remove={p.user} onClick={() => void remove(p.user)}>
                                Remove {p.name}?
                              </button>
                            ) : (
                              <button type="button" class="btn sm" data-remove={p.user} disabled={p.user === me.user} title={p.user === me.user ? "You cannot remove yourself" : undefined} onClick={() => setRemoving(p.user)}>
                                Remove
                              </button>
                            )}
                          </>
                        )}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <section>
        <h2>What each role may change</h2>
        <div class="scroll">
          <table>
            <thead>
              <tr>
                <th>Role</th>
                <th>Paths in product-specs</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(project.rules.roles).map(([r, paths]) => (
                <tr key={r}>
                  <td class="nw">
                    <RoleChip role={r} text={roleOf(r).n} />
                  </td>
                  <td>
                    <div class="chips">
                      {paths.map((x) => (
                        <code key={x}>{x}</code>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p class="muted">
          Everyone can read everything. The <code>hub-guard</code> job enforces these rules at merge on protected <code>main</code>; the site only follows them.
        </p>
      </section>
    </>
  );
}

export function SetupScript({ user, params }: { user: string; params: URLSearchParams }) {
  const { me, project, go, session } = useApp();
  const { rows } = usePeople();
  const shell = params.get("shell") === "powershell" ? "powershell" : params.get("shell") === "bash" ? "bash" : undefined;
  const p = rows?.find((x) => x.user === user);
  const sh: "bash" | "powershell" = shell ?? (p?.os === "windows" ? "powershell" : "bash");
  const [script, setScript] = useState<{ name: string; text: string; release: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setScript(null);
    api.script(user, sh, session.demo ? me.user : undefined).then((x) => live && setScript(x), (e) => live && setError(String(e)));
    return () => {
      live = false;
    };
  }, [user, sh]);
  const admin = me.roles.includes("admin");
  const download = () => {
    if (!script) return;
    const url = URL.createObjectURL(new Blob([script.text], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = script.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const repos = p ? (p.roles.some((r) => ["qa", "ops", "admin"].includes(r)) ? project.teams : p.roles.includes("dev") ? project.teams.filter((t) => t.id === p.team) : []) : [];

  return (
    <>
      <nav class="crumb" aria-label="Breadcrumb">
        <button type="button" onClick={() => go("/people")}>
          People and roles
        </button>
        <span aria-hidden="true">›</span>
        <span>Setup script for {p?.name ?? user}</span>
      </nav>
      <div class="ph">
        <div>
          <h1>Setup script</h1>
          <p class="sub">One script per person. It carries who they are and where the repositories live, and nothing secret.</p>
        </div>
      </div>
      <AdminNote />
      <div class="row">
        <label class="fld">
          <span>Person</span>
          <select id="sc-user" value={user} onChange={(e) => go(`/people/${(e.target as HTMLSelectElement).value}/script`)}>
            {rows?.map((x) => (
              <option key={x.user} value={x.user}>
                {x.name} · {x.roles.map((r) => roleOf(r).n).join(" and ")}
              </option>
            ))}
          </select>
        </label>
        <div class="fld">
          <span>System</span>
          <div class="fpick">
            <button type="button" class="chipbtn" data-shell="bash" aria-pressed={sh === "bash"} onClick={() => go(`/people/${user}/script`, { shell: "bash" })}>
              macOS and Linux · bash
            </button>
            <button type="button" class="chipbtn" data-shell="powershell" aria-pressed={sh === "powershell"} onClick={() => go(`/people/${user}/script`, { shell: "powershell" })}>
              Windows · PowerShell
            </button>
          </div>
        </div>
      </div>
      {error && <Problem error={error} />}
      <div class="grid2">
        <div class="card">
          <div class="row sp">
            <code>
              <b>{script?.name ?? "…"}</b>
            </code>
            <span class="row">
              <button type="button" class="btn sm pri" id="sc-download" disabled={!script} onClick={download}>
                Download
              </button>
              {script && <CopyButton text={script.text} label="copy script" />}
            </span>
          </div>
          <pre id="sc-text">{script?.text ?? "Generating…"}</pre>
          {!admin && <p class="muted">Only the admin sends scripts; this one is shown so you can see what it does.</p>}
        </div>
        <div class="stack">
          <div class="card">
            <h3>What this script carries</h3>
            <div class="kv">
              <span class="k">Git host</span>
              <code>{project.project.host}</code>
              <span class="k">Hub repository</span>
              <code>
                {project.project.namespace}/{project.project.repo}
              </code>
              <span class="k">Person</span>
              <span>
                <code>{user}</code> · {p?.roles.map((r) => roleOf(r).n).join(" and ")}
              </span>
              <span class="k">Repositories</span>
              <span class="row">
                <span class="rl">{project.project.repo}</span>
                {repos.map((t) => (
                  <span class="rl" key={t.id}>
                    {t.repo.split("/").pop()}
                  </span>
                ))}
              </span>
              <span class="k">Assistant</span>
              <span>{p ? ASSISTANTS[p.assistant] : ""}</span>
              <span class="k">Hub release</span>
              <code>{script?.release ?? ""}</code>
              <span class="k">Secrets</span>
              <span>none: no token, key or password</span>
            </div>
          </div>
          <div class="card">
            <h3>What it does on their machine</h3>
            <ol>
              <li>Checks git, Node.js 22 or newer and the assistant, and says how to install what is missing.</li>
              <li>Signs in to the git host with their own credential manager or SSH key.</li>
              <li>Clones the repositories of the role.</li>
              <li>
                Confirms on <code>main</code> that <code>{user}</code> really has the roles in the script, and stops if not. Then it writes the local path rules and sets up the hub plugin of their assistant.
              </li>
              <li>Runs the health check.</li>
              <li>Opens the site on Your guide.</li>
            </ol>
          </div>
        </div>
      </div>
    </>
  );
}
