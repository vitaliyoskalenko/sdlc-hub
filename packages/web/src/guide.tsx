// Your guide: what your role does in the assistant and on the site, and how to start next time.

import { RepoLabels } from "./home.tsx";
import { hubCmd, ROLE_CMDS, ROLE_SITE } from "./text.ts";
import { Cmd, roleLabel, useApp } from "./ui.tsx";

export function Guide() {
  const { me, project, assistant, go } = useApp();
  const roles = me.roles;
  const cmds = roles.flatMap((r) => ROLE_CMDS[r] ?? []);
  const site = roles.flatMap((r) => ROLE_SITE[r] ?? []);
  const rules = [...new Set([...roles.flatMap((r) => project.rules.roles[r] ?? []), ...(me.lead ? project.rules.lead : []), ...(me.lead && project.teams.find((t) => t.id === me.team)?.api_contract ? project.rules.contractLead : [])])];
  return (
    <>
      <div class="ph">
        <div>
          <h1>Your guide</h1>
          <p class="sub">How {roleLabel(me)} works with the hub: what to type in the assistant, what to look at on this site and how to start next time.</p>
        </div>
        <RepoLabels me={me} />
      </div>
      <div class="cols3">
        <div class="card">
          <span class="k">1 · In your assistant</span>
          <p>The LLM work happens here. Type a command; the hub checks the gate and runs the stage. The hub commands arrive with the plugin in phase 2.</p>
          <ul class="list">
            {cmds.map(([c, rest, what]) => (
              <li key={c + rest}>
                <Cmd text={hubCmd(assistant, c, rest)} />
                <span class="muted">{what}</span>
              </li>
            ))}
          </ul>
        </div>
        <div class="card">
          <span class="k">2 · On this site</span>
          <p>Where every feature is, who it waits on and why. Sign off or return a gate that waits for you; the site saves it through a merge request in your name. Light edits arrive later.</p>
          <ul>
            {site.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
          <div>
            <button type="button" class="btn pri" onClick={() => go("/")}>
              Open your home page
            </button>
          </div>
        </div>
        <div class="card">
          <span class="k">3 · Start next time</span>
          <p>Open the repository in your assistant and run:</p>
          <Cmd text={hubCmd(assistant, "start")} />
          <p>
            Or from a terminal in <code>{project.project.repo}</code>:
          </p>
          <Cmd text="node hub/cli.js serve" />
          <p class="muted">
            The site opens at <code>http://127.0.0.1:4173</code> and updates by itself when the files change.
          </p>
        </div>
      </div>
      <div class="grid2">
        <div class="card">
          <h3>What you may change</h3>
          <div class="chips">
            {rules.length ? rules.map((x) => <code key={x}>{x}</code>) : <span class="muted">Nothing directly: your sign-offs and confirmations only.</span>}
          </div>
          <p class="muted">
            Anything else is refused by the <code>hub-guard</code> job when your merge request tries to merge. A rule ending in <code>#Heading</code> allows one section of the file, and <code>#front:key</code> one front matter key. You can read everything.
          </p>
        </div>
        <div class="card">
          <h3>How a save works</h3>
          <ol>
            <li>You save on the site, or the assistant commits a stage result.</li>
            <li>The hub pushes a branch and opens a merge request that merges itself when the pipeline passes.</li>
            <li>Everyone else sees the change after their next sync.</li>
          </ol>
        </div>
      </div>
      <div class="card">
        <h3>Words used on this site</h3>
        <dl class="gloss">
          <dt>Step</dt>
          <dd>One of the 20 steps of the flow, named by its id, such as tech-design. Each step belongs to one role. Fix is the return path from verify, not a step.</dd>
          <dt>Engine stage, hub step</dt>
          <dd>An engine stage is run by the engine in your assistant. A hub step is run or recorded by the hub itself; some need no LLM at all.</dd>
          <dt>Gate, sign-off, return</dt>
          <dd>A gate is the condition for moving on. A sign-off is the recorded approval of the person the gate needs. A return sends the step back with a reason.</dd>
          <dt>Route</dt>
          <dd>Quick, standard or full. On quick and standard some steps may be skipped; a step the route requires but that has no evidence shows as missed.</dd>
          <dt>hub-state</dt>
          <dd>The branch where CI and the plugin publish machine data. The site shows it, but never trusts it for a gate.</dd>
          <dt>hub-guard</dt>
          <dd>The CI job that refuses a change outside the paths of your role.</dd>
          <dt>The i button</dt>
          <dd>Next to every command. It shows how to write the command, the prompt it passes and an example of its output.</dd>
        </dl>
      </div>
    </>
  );
}
