// The guides in docs/guides/, built into the site, so the admin reads them where the hub runs: installing on GitLab
// or GitHub with the tokens and permissions each needs, adding people, and Settings.

import MarkdownIt from "markdown-it";
import { useEffect } from "preact/hooks";
import github from "../../../docs/guides/github.md?raw";
import gitlab from "../../../docs/guides/gitlab.md?raw";
import people from "../../../docs/guides/people.md?raw";
import settings from "../../../docs/guides/settings.md?raw";
import { Fragment } from "preact";
import { Glossary } from "./guide.tsx";
import { COMMANDS, hubCmd, roleOf, STATUS, STEP } from "./text.ts";
import { Link, Pill, RoleChip, StatusPill, useApp } from "./ui.tsx";
import { hereSection } from "./where.ts";

export const GUIDES: Record<string, { title: string; text: string }> = {
  gitlab: { title: "Install on GitLab", text: gitlab },
  github: { title: "Install on GitHub", text: github },
  people: { title: "People", text: people },
  settings: { title: "Settings", text: settings },
};

/** Heading ids as GitHub makes them, so links such as gitlab.md#what-each-person-needs-on-gitlab work here too. */
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9 -]/g, "").trim().replace(/ /g, "-");

const md = new MarkdownIt({ html: false, linkify: false, typographer: false });
md.renderer.rules["heading_open"] = (tokens, i, opts, env, self) => {
  const text = tokens[i + 1]?.children?.map((c) => c.content).join("") ?? "";
  tokens[i]!.attrSet("id", slug(text));
  return self.renderToken(tokens, i, opts);
};
md.renderer.rules["link_open"] = (tokens, i, opts, env, self) => {
  const href = tokens[i]!.attrGet("href") ?? "";
  if (/^https?:\/\//.test(href)) {
    tokens[i]!.attrSet("target", "_blank");
    tokens[i]!.attrSet("rel", "noopener noreferrer");
  }
  return self.renderToken(tokens, i, opts);
};

/** A link to another guide (people.md#x) becomes a page of the site (/guides/people#x). */
const local = (text: string) => text.replace(/\]\((gitlab|github|people|settings)\.md(#[^)]*)?\)/g, "](/guides/$1$2)");

export function GuideDoc({ name }: { name: string }) {
  const { go } = useApp();
  const g = GUIDES[name];
  // Opened at a section (/guides/people#every-day): go to that heading once the guide is on the page.
  useEffect(() => {
    const id = hereSection();
    if (id) setTimeout(() => document.getElementById(id)?.scrollIntoView(), 30);
  }, [name]);
  if (!g)
    return (
      <div class="lockbox">
        There is no such guide. <Link to="/help">Back to Help</Link>
      </div>
    );
  return (
    <>
      <nav class="crumb" aria-label="Breadcrumb">
        <Link to="/help">Help</Link>
        <span aria-hidden="true">›</span>
        <span>{g.title}</span>
      </nav>
      <div class="row guides-nav">
        {Object.entries(GUIDES).map(([k, x]) => (
          <Link key={k} to={`/guides/${k}`} class={`chipbtn${k === name ? " on" : ""}`}>
            {x.title}
          </Link>
        ))}
      </div>
      <article
        class="card md guide"
        id="guide"
        // Raw HTML is off in the renderer, so a guide cannot put markup on the page.
        dangerouslySetInnerHTML={{ __html: md.render(local(g.text)) }}
        onClick={(e) => {
          const a = (e.target as HTMLElement).closest("a");
          const href = a?.getAttribute("href") ?? "";
          if (!href.startsWith("/guides/")) return;
          e.preventDefault();
          const [path, hash] = href.split("#");
          go(path!);
          if (hash) setTimeout(() => document.getElementById(hash)?.scrollIntoView(), 50);
        }}
      />
    </>
  );
}

/** Help: the guides, by who needs them, and what each role does in the assistant and on the site. */
export function Help() {
  const { me } = useApp();
  const roles = ["po", "pm", "designer", "dev", "qa", "ops"];
  const mine = roles.filter((r) => me.roles.includes(r));
  const ordered = [...mine, ...roles.filter((r) => !mine.includes(r))];
  return (
    <>
      <div class="ph">
        <div>
          <h1>Help</h1>
          <p class="sub">How to set up the hub and work with it, by role. The same guides are in the repository of the hub, in docs/guides/.</p>
        </div>
      </div>
      <nav class="rolepick" aria-label="On this page">
        {[["help-guides", "Guides"], ["help-roles", "By role"], ["help-flow", "The flow"], ["help-commands", "Commands"], ["help-statuses", "Statuses"], ["words", "Words"], ["help-keys", "Shortcuts"], ["help-trouble", "When something goes wrong"]].map(([id, label]) => (
          <a key={id} class="chipbtn" href={`#${id}`} onClick={(e) => (e.preventDefault(), document.getElementById(id!)?.scrollIntoView())}>
            {label}
          </a>
        ))}
      </nav>
      <div class="grid2" id="help-guides">
        <div class="card" id="help-everyone">
          <h3>For everyone</h3>
          <ul class="helplist">
            <li>
              <Link to="/guide">Your guide</Link>
              <span class="muted">what you type in the assistant and look at on this site, for your role</span>
            </li>
            <li>
              <Link to="/guides/people#the-person-runs-the-script">Set up your machine</Link>
              <span class="muted">the setup script, and what it needs: git, Node.js and your assistant</span>
            </li>
            <li>
              <Link to="/guides/people#every-day">Every day</Link>
              <span class="muted">start the site, sync, and check your setup</span>
            </li>
          </ul>
        </div>
        <div class="card" id="help-admin">
          <h3>For the admin</h3>
          <ul class="helplist">
            <li>
              <Link to="/guides/gitlab">Install on GitLab</Link>
              <span class="muted">{GUIDE_HINT["gitlab"]}</span>
            </li>
            <li>
              <Link to="/guides/github">Install on GitHub</Link>
              <span class="muted">{GUIDE_HINT["github"]}</span>
            </li>
            <li>
              <Link to="/guides/people#the-admin-adds-a-person">Add people</Link>
              <span class="muted">the Team page and each person's setup script</span>
            </li>
            <li>
              <Link to="/guides/settings">Settings</Link>
              <span class="muted">{GUIDE_HINT["settings"]}</span>
            </li>
          </ul>
        </div>
      </div>
      <section id="help-roles">
        <h2>By role</h2>
        <p class="muted">Each role's guide: the commands to type in the assistant, what to look at on this site, and what the role may change.</p>
        <nav class="rolepick" aria-label="Guide for each role">
          {ordered.map((r) => (
            <span key={r} data-role-help={r}>
              <Link class="chipbtn" to="/guide" params={{ role: r }}>
                {roleOf(r).n}
                {mine.includes(r) ? " · you" : ""}
              </Link>
            </span>
          ))}
        </nav>
      </section>
      <Flow />
      <Commands />
      <Statuses />
      <section id="words">
        <h2>Words</h2>
        <Glossary />
      </section>
      <Shortcuts />
      <Trouble />
    </>
  );
}

const KEYS: [string[], string][] = [
  [["g", "h"], "Home"],
  [["g", "f"], "Features"],
  [["g", "r"], "Releases"],
  [["g", "t"], "Team"],
  [["g", "s"], "Settings"],
  [["g", "g"], "Your guide"],
  [["/"], "Find a feature"],
  [["?"], "This help, at the shortcuts"],
  [["Esc"], "Close the open task or command help"],
];

/** The keyboard shortcuts, and what the site keeps in this browser. */
function Shortcuts() {
  return (
    <section id="help-keys">
      <h2>Keyboard shortcuts</h2>
      <div class="card">
        <dl class="gloss keys">
          {KEYS.map(([k, what]) => (
            <Fragment key={what}>
              <dt>
                {k.map((x, i) => (
                  <Fragment key={x}>
                    {i > 0 && " then "}
                    <kbd>{x}</kbd>
                  </Fragment>
                ))}
              </dt>
              <dd>{what}</dd>
            </Fragment>
          ))}
        </dl>
        <p class="muted">They work anywhere except while you type in a field.</p>
      </div>
      <p class="muted">
        This browser keeps a few things for you, and nothing leaves it: which features you have seen (a feature whose step moved since then is marked as changed), your choice of notifications (Notify me, on Home), and the role you work as.
      </p>
    </section>
  );
}

/** The twenty steps of this project's flow: who works on each and who signs its gate. */
function Flow() {
  const { project } = useApp();
  return (
    <section id="help-flow">
      <h2>The flow</h2>
      <p class="muted">Every feature goes through these steps. The hub reads where a feature is from its files; nobody types it. A step whose gate needs a sign-off waits for the person named there.</p>
      <div class="card scroll">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Step</th>
              <th>Who works on it</th>
              <th>Its gate</th>
            </tr>
          </thead>
          <tbody>
            {project.flow.steps.map((s, i) => (
              <tr key={s.id} data-flow-step={s.id}>
                <td class="nw">{i + 1}</td>
                <td>
                  <b>{STEP[s.id]?.title ?? s.id}</b> <code>{s.id}</code>
                  <br />
                  <span class="muted">{s.kind === "engine" ? `engine stage${s.stages.length > 1 ? "s" : ""}: ${s.stages.join(", ")}` : "a hub step"}</span>
                </td>
                <td class="nw">
                  <RoleChip role={s.role} text={roleOf(s.role).n} />
                </td>
                <td>{s.gate && s.gate.role !== "auto" ? `${roleOf(s.gate.role).n} signs: ${s.gate.text}` : <span class="muted">{s.gate ? "passes by itself when its evidence is there" : "none"}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Every hub command, written for the assistant this person uses; each opens its details. */
function Commands() {
  const { assistant, help } = useApp();
  return (
    <section id="help-commands">
      <h2>Commands</h2>
      <p class="muted">Type them in your assistant. They are written for {assistant === "claude" ? "Claude Code" : assistant === "codex" ? "Codex" : "Cursor"}; Your guide shows the ones of your role.</p>
      <div class="card scroll">
        <table>
          <tbody>
            {Object.entries(COMMANDS).map(([k, c]) => (
              <tr key={k} data-command={k}>
                <td class="nw">
                  <code>{hubCmd(assistant, c.syntax.split(" ")[0]!, c.syntax.split(" ").slice(1).join(" "))}</code>
                </td>
                <td>
                  <b>{c.title}</b>
                  <br />
                  <span class="muted">{c.what}</span>
                </td>
                <td class="nw">
                  <button type="button" class="btn sm" onClick={() => help(hubCmd(assistant, k))}>
                    Details
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const STATUS_TEXT: Record<string, string> = {
  done: "Its evidence is there and its gate, if any, is signed.",
  running: "Someone started it: a stage event with no finish yet, or part of its evidence.",
  signoff: "Its evidence is there; the gate waits for the person named on the step.",
  returned: "Its gate owner sent it back, with a reason; it runs again.",
  blocked: "It cannot move on: a team waits for another team's task, or a test run is red.",
  ready: "The steps before it are done; nothing has started it yet.",
  todo: "An earlier step is not done yet.",
  skipped: "The feature's route or its lack of a user interface leaves it out.",
  missed: "The route needs it, but it has no evidence while later steps do.",
};

function Statuses() {
  return (
    <section id="help-statuses">
      <h2>Statuses</h2>
      <div class="card">
        <ul class="helplist">
          {(Object.keys(STATUS) as (keyof typeof STATUS)[]).map((k) => (
            <li key={k} class="statusline">
              <StatusPill status={k} />
              <span class="muted">{STATUS_TEXT[k]}</span>
            </li>
          ))}
          <li class="statusline" id="help-recheck">
            <Pill kind="warn">{"\u21BB"} recheck</Pill>
            <span class="muted">Done, but something it is built on changed after it landed: the spec's stories or criteria it names, the flows, the data model or the contract. Its owner runs the step again, or confirms that nothing needs to change; the PO can say that only the wording of the spec changed, which clears every mark the spec caused.</span>
          </li>
        </ul>
      </div>
    </section>
  );
}

const TROUBLE: [string, string][] = [
  ["My save waits to merge", "hub-guard runs on its merge request first; it merges by itself when the check passes, usually within a minute. Open the link next to the save to see the pipeline."],
  ["My save was refused", "The site names each file and the rule it broke. Ask the admin if your role should allow it; in advisory mode a save goes through with warnings instead."],
  ["My save conflicts", "Someone changed the same lines first. Choose Keep mine to put your version on the newest main, or Use the newer one to drop yours."],
  ["My save is queued: offline", "The git host could not be reached. The site sends it when it can, at the next look or with node hub/cli.js sync."],
  ["The site says it is read only", "Either this checkout has no remote, or the hub in product-specs is newer than the one running: run node hub/cli.js sync and start the site again."],
  ["I am not in roles.yaml", "Ask the admin to add you on the Team page, then run your setup script again."],
  ["There is no Sign off button", "The step does not wait for you: another role or lead signs it, or its evidence is not there yet. A person with several roles signs only in the role the step needs."],
  ["A team's tasks are missing", "That team's hub-report job has not published yet: its lead merges the hub-report merge request, and the next pipeline publishes. Until then the site reads a local clone, when there is one."],
  ["Costs show nothing for a step", "A step shows only when three people or more worked on it, so no total names one person. Usage arrives with node hub/cli.js sync."],
  ["A step shows ↻ recheck", "The spec, the flows or the contract changed after the step's document landed. Open the step: it says what changed and by whom. Run the step again, or choose No change needed; either one clears the mark for everyone."],
  ["Help for a command", "Every command on the site has an i button: how to write it, the prompt it passes and an example of its output."],
];

function Trouble() {
  return (
    <section id="help-trouble">
      <h2>When something goes wrong</h2>
      <div class="card">
        <dl class="gloss">
          {TROUBLE.map(([q, a]) => (
            <Fragment key={q}>
              <dt>{q}</dt>
              <dd>{a}</dd>
            </Fragment>
          ))}
        </dl>
      </div>
    </section>
  );
}
const GUIDE_HINT: Record<string, string> = {
  gitlab: "the admin's token, what Install creates, renewing HUB_STATE_TOKEN and HUB_GUARD_TOKEN",
  github: "the organization settings, the fine-grained token and its permissions, the deploy key and the ruleset",
  people: "adding a person, the setup script, what each machine needs",
  settings: "how strict hub-guard is, and the other settings",
};
