// The guides in docs/guides/, built into the site, so the admin reads them where the hub runs: installing on GitLab
// or GitHub with the tokens and permissions each needs, adding people, and Settings.

import MarkdownIt from "markdown-it";
import github from "../../../docs/guides/github.md?raw";
import gitlab from "../../../docs/guides/gitlab.md?raw";
import people from "../../../docs/guides/people.md?raw";
import settings from "../../../docs/guides/settings.md?raw";
import { Link, useApp } from "./ui.tsx";

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
  if (!g)
    return (
      <div class="lockbox">
        There is no such guide. <Link to="/settings">Back to Settings</Link>
      </div>
    );
  return (
    <>
      <nav class="crumb" aria-label="Breadcrumb">
        <Link to="/settings">Settings</Link>
        <span aria-hidden="true">›</span>
        <span>Guides</span>
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

/** The guides as a card, for Settings. */
export function GuidesCard() {
  return (
    <div class="card" id="set-guides">
      <h3>Guides</h3>
      <ul class="gates">
        {Object.entries(GUIDES).map(([k, g]) => (
          <li key={k}>
            <Link to={`/guides/${k}`}>{g.title}</Link>
            <span class="muted">{GUIDE_HINT[k]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const GUIDE_HINT: Record<string, string> = {
  gitlab: "the admin's token, what Install creates, renewing HUB_STATE_TOKEN and HUB_GUARD_TOKEN",
  github: "the organization settings, the fine-grained token and its permissions, the deploy key and the ruleset",
  people: "adding a person, the setup script, what each machine needs",
  settings: "how strict hub-guard is, and the other settings",
};
