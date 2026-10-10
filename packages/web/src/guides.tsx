// The guides in docs/guides/, built into the site, so the admin reads them where the hub runs: installing on GitLab
// or GitHub with the tokens and permissions each needs, adding people, and Settings.

import MarkdownIt from "markdown-it";
import { useEffect } from "preact/hooks";
import github from "../../../docs/guides/github.md?raw";
import gitlab from "../../../docs/guides/gitlab.md?raw";
import people from "../../../docs/guides/people.md?raw";
import settings from "../../../docs/guides/settings.md?raw";
import { hubCmd, ROLE_CMDS, ROLE_SITE, roleOf } from "./text.ts";
import { Link, Pill, useApp } from "./ui.tsx";

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
    const id = decodeURIComponent(location.hash.slice(1));
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
  const { me, assistant } = useApp();
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
      <div class="grid2">
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
        <div class="grid2">
          {ordered.map((r) => (
            <div class="card" key={r} data-role-help={r}>
              <h3>
                {roleOf(r).n} {mine.includes(r) && <Pill kind="info">you</Pill>}
              </h3>
              <span class="k">In the assistant</span>
              <ul class="cmdlist">
                {(ROLE_CMDS[r] ?? []).map(([c, rest, what]) => (
                  <li key={c + rest}>
                    <code>{hubCmd(assistant, c, rest)}</code> <span class="muted">{what}</span>
                  </li>
                ))}
              </ul>
              <span class="k">On this site</span>
              <ul>
                {(ROLE_SITE[r] ?? []).map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
const GUIDE_HINT: Record<string, string> = {
  gitlab: "the admin's token, what Install creates, renewing HUB_STATE_TOKEN and HUB_GUARD_TOKEN",
  github: "the organization settings, the fine-grained token and its permissions, the deploy key and the ruleset",
  people: "adding a person, the setup script, what each machine needs",
  settings: "how strict hub-guard is, and the other settings",
};
