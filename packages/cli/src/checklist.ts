// The host checklist on Settings: what install set up, looked at on the host now, with the admin's own credential.
// It reads only. A token that expires within 30 days is a warning with the day; something missing says what to do.

import { fanoutTokenVariable, type Config } from "@sdlc-hub/core";
import { GitHub, GitLab } from "@sdlc-hub/host";
import { githubApi, githubWeb, hostUrl } from "@sdlc-hub/install";
import { credentialFill } from "./host-saves.ts";

export interface CheckItem {
  ok: boolean;
  text: string;
}
export type Checklist = { items: CheckItem[] } | { error: string };

const RENEW_DAYS = 30;

export function checklistOf(config: Config, o: { fill?: (web: string) => string | undefined; fetcher?: typeof fetch; now?: () => Date } = {}): () => Promise<Checklist> {
  return async () => {
    const github = config.git.provider === "github";
    const web = github ? githubWeb(config.git.host) : hostUrl(config.git.host);
    const token = (o.fill ?? credentialFill)(web);
    if (!token) return { error: `This machine has no token for ${new URL(web).host}; the admin's setup token can read these settings` };
    try {
      return { items: github ? await gitHubItems(config, new GitHub(token, githubApi(web), o.fetcher)) : await gitLabItems(config, new GitLab(web, token, o.fetcher), o.now?.() ?? new Date()) };
    } catch (e) {
      return { error: `Could not read the settings on ${new URL(web).host}: ${(e as Error).message.split("\n")[0]}` };
    }
  };
}

async function gitLabItems(c: Config, gl: GitLab, now: Date): Promise<CheckItem[]> {
  const ns = c.git.namespace;
  const items: CheckItem[] = [];
  const add = (ok: boolean, text: string) => items.push({ ok, text });
  const p = await gl.project(`${ns}/${c.git.repo}`);
  if (!p) return [{ ok: false, text: `There is no ${ns}/${c.git.repo}, or this token cannot see it` }];
  const main = await gl.protectedBranch(p.id, "main");
  add(!!main && main.push_access_levels.every((l) => l.access_level === 0), "main of product-specs takes no pushes: every change is a merge request");
  add(p.ci_config_path === `ci/product-specs.yml@${ns}/hub-ci`, `The CI configuration is ci/product-specs.yml@${ns}/hub-ci, so a merge request cannot change its own check`);
  add(p.only_allow_merge_if_pipeline_succeeds === true, '"Pipelines must succeed" is on');
  add(p.forking_access_level === "disabled", "Forking of product-specs is off");
  add(!!(await gl.branch(p.id, "hub-state")), "The branch hub-state exists");
  // Tokens: the variable, and the project access token behind it with its expiry.
  const expiry = async (projectId: number, name: string) => (await gl.projectTokens(projectId).catch(() => [])).find((t) => t.name === name && t.active && !t.revoked)?.expires_at;
  const token = async (label: string, has: boolean, expires: string | undefined, effect: string) => {
    if (!has) return add(false, `${label} is missing: run setup again. ${effect}`);
    if (!expires) return add(false, `${label} is set, but its token was not found: it may be revoked. ${effect}`);
    const days = Math.floor((Date.parse(expires) - now.getTime()) / 86_400_000);
    add(days > RENEW_DAYS, days > RENEW_DAYS ? `${label} is set; its token expires on ${expires}` : `${label} expires on ${expires}${days < 0 ? ", and has expired" : `, in ${days} days`}: renew it. ${effect}`);
  };
  const group = await gl.group(ns);
  await token("HUB_STATE_TOKEN", !!(group && (await gl.groupVariable(group.id, "HUB_STATE_TOKEN"))), await expiry(p.id, "hub-report"), "Without it, team pipelines publish nothing.");
  await token("HUB_GUARD_TOKEN", !!(await gl.projectVariable(p.id, "HUB_GUARD_TOKEN")), await expiry(p.id, "hub-guard"), "Without it, nothing merges into product-specs.");
  for (const t of c.teams) {
    const team = await gl.project(t.repo);
    const v = fanoutTokenVariable(t.id);
    await token(v, !!(await gl.projectVariable(p.id, v)), team ? await expiry(team.id, "hub-fanout") : undefined, `Without it, ${t.name} gets no shared files.`);
  }
  return items;
}

async function gitHubItems(c: Config, gh: GitHub): Promise<CheckItem[]> {
  const [org, name] = [c.git.namespace, c.git.repo];
  const items: CheckItem[] = [];
  const add = (ok: boolean, text: string) => items.push({ ok, text });
  const repo = await gh.repo(org, name);
  if (!repo) return [{ ok: false, text: `There is no ${org}/${name}, or this token cannot see it` }];
  const free = repo.private && c.git.auto_merge === false;
  if (!free) {
    add((await gh.rulesets(org, name).catch(() => [])).some((r) => r.name === "sdlc-hub: main"), 'The ruleset "sdlc-hub: main" protects main: pull requests only, hub-guard required');
    add(repo.allow_auto_merge === true, "Auto-merge is allowed");
  } else add(true, "GitHub Free with a private repository: no ruleset and no auto-merge, so hub-guard warns and each pull request waits for someone to merge it");
  add(!!(await gh.branch(org, name, "hub-state")), "The branch hub-state exists");
  const o = await gh.org(org);
  add(o?.deploy_keys_enabled_for_repositories !== false, "The organization allows deploy keys, which team CI writes hub-state with");
  add((await gh.orgWorkflowPermissions(org).catch(() => null))?.can_approve_pull_request_reviews !== false, "The organization lets GitHub Actions open pull requests, which hub-fanout does");
  for (const t of c.teams) {
    const [tOrg, tName] = t.repo.split("/") as [string, string];
    const r = await gh.repo(tOrg, tName);
    const secret = !!(await gh.repoSecret(tOrg, tName, "HUB_STATE_KEY").catch(() => null));
    const flows = r ? (await gh.file(tOrg, tName, ".github/workflows/hub-report.yml", r.default_branch)) !== null && (await gh.file(tOrg, tName, ".github/workflows/hub-fanout.yml", r.default_branch)) !== null : false;
    add(secret && flows, secret && flows ? `${t.name}: the secret HUB_STATE_KEY and the hub workflows are there` : `${t.name}: ${!secret ? "the secret HUB_STATE_KEY is missing; " : ""}${!flows ? "the hub workflows are not merged yet; " : ""}run hub connect-teams, and the team lead merges the pull request`);
  }
  return items;
}
