// The GitHub REST API (and the one GraphQL call auto-merge needs): what the install and the hub's saves use, and
// nothing more. From GitHub's documentation of 2026-10-09; see docs/open-items.md, claim 5, for what is verified.

import { sealedBox } from "./sealed-box.ts";
import { HostError } from "./gitlab.ts";

const enc = encodeURIComponent;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export interface GitHubUser {
  login: string;
  id: number;
  name: string | null;
  email?: string | null;
}

export interface GitHubOrg {
  login: string;
  id: number;
  plan?: { name: string };
  members_can_fork_private_repositories?: boolean;
  /** When false, no repository of the organization may take a deploy key (it was false in a new organization). */
  deploy_keys_enabled_for_repositories?: boolean;
}

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  default_branch: string;
  html_url: string;
  clone_url: string;
  allow_auto_merge?: boolean;
  delete_branch_on_merge?: boolean;
  allow_forking?: boolean;
}

export interface GitHubPull {
  number: number;
  node_id: string;
  html_url: string;
  state: string;
  merged?: boolean;
  user: { login: string };
  head: { ref: string; sha: string };
  base: { ref: string };
  auto_merge?: { enabled_by: { login: string } } | null;
}

export interface Ruleset {
  id?: number;
  name: string;
  target: "branch";
  enforcement: "active" | "disabled" | "evaluate";
  bypass_actors: unknown[];
  conditions: { ref_name: { include: string[]; exclude: string[] } };
  rules: { type: string; parameters?: Record<string, unknown> }[];
}

/** The ruleset on main of product-specs: pull requests only, hub-guard must pass, no deletion and no force push. */
export function hubRuleset(guardIntegrationId?: number): Ruleset {
  return {
    name: "sdlc-hub: main",
    target: "branch",
    enforcement: "active",
    bypass_actors: [],
    conditions: { ref_name: { include: ["~DEFAULT_BRANCH"], exclude: [] } },
    rules: [
      {
        type: "pull_request",
        parameters: { required_approving_review_count: 0, dismiss_stale_reviews_on_push: false, require_code_owner_review: false, require_last_push_approval: false, required_review_thread_resolution: false },
      },
      { type: "required_status_checks", parameters: { strict_required_status_checks_policy: false, required_status_checks: [{ context: "hub-guard", ...(guardIntegrationId ? { integration_id: guardIntegrationId } : {}) }] } },
      { type: "deletion" },
      { type: "non_fast_forward" },
    ],
  };
}

export class GitHub {
  readonly api: string;
  constructor(
    private readonly token: string,
    /** https://api.github.com, or a GitHub Enterprise Server's /api/v3. */
    api = "https://api.github.com",
    private readonly fetcher: typeof fetch = fetch,
  ) {
    this.api = api.replace(/\/+$/, "");
  }

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    // A request that failed on the way (a reset connection, a timeout) is tried twice more. GitHub answers a repeated
    // pull request that did reach it with 422, which the caller handles.
    let res: Response | undefined;
    for (let attempt = 1; !res; attempt++) {
      try {
        res = await this.fetcher(`${this.api}${path}`, {
          method,
          signal: AbortSignal.timeout(60_000),
          headers: { authorization: `Bearer ${this.token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", ...(body === undefined ? {} : { "content-type": "application/json" }) },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      } catch (e) {
        const cause = (e as { cause?: { code?: string; message?: string } }).cause;
        if (attempt >= 3) throw new Error(`Could not reach GitHub for ${method} ${path}: ${(e as Error).message}${cause ? ` (${cause.code ?? cause.message})` : ""}`);
        await new Promise((r) => setTimeout(r, attempt * 1500));
      }
    }
    const text = await res.text();
    const data = text ? (JSON.parse(text) as unknown) : undefined;
    if (!res.ok) {
      const msg = (data as { message?: string } | undefined)?.message ?? res.statusText;
      throw new HostError(`GitHub answered ${res.status} to ${method} ${path}: ${msg}`, res.status, data);
    }
    return data as T;
  }
  private async maybe<T>(path: string): Promise<T | null> {
    try {
      return await this.call<T>("GET", path);
    } catch (e) {
      if (e instanceof HostError && e.status === 404) return null;
      throw e;
    }
  }

  /** The header git uses over HTTPS with this token, passed through git's environment. */
  gitAuthHeader = (): string => `Authorization: Basic ${Buffer.from(`x-access-token:${this.token}`).toString("base64")}`;

  me = () => this.call<GitHubUser>("GET", "/user");
  org = (org: string) => this.maybe<GitHubOrg>(`/orgs/${enc(org)}`);
  /** The person's role in the organization: admin (owner) or member. */
  async orgRole(org: string): Promise<string | null> {
    return (await this.maybe<{ role: string; state: string }>(`/user/memberships/orgs/${enc(org)}`))?.role ?? null;
  }
  repo = (owner: string, name: string) => this.maybe<GitHubRepo>(`/repos/${enc(owner)}/${enc(name)}`);
  createRepo = (org: string, name: string, isPrivate: boolean) => this.call<GitHubRepo>("POST", `/orgs/${enc(org)}/repos`, { name, private: isPrivate, auto_init: true });
  updateRepo = (owner: string, name: string, settings: Record<string, unknown>) => this.call<GitHubRepo>("PATCH", `/repos/${enc(owner)}/${enc(name)}`, settings);
  branch = (owner: string, name: string, branch: string) => this.maybe<{ name: string; commit: { sha: string } }>(`/repos/${enc(owner)}/${enc(name)}/branches/${enc(branch)}`);
  /** A file's text at a ref, or null. */
  async file(owner: string, name: string, path: string, ref: string): Promise<string | null> {
    const res = await this.fetcher(`${this.api}/repos/${enc(owner)}/${enc(name)}/contents/${path.split("/").map(enc).join("/")}?ref=${enc(ref)}`, {
      signal: AbortSignal.timeout(60_000),
      headers: { authorization: `Bearer ${this.token}`, accept: "application/vnd.github.raw+json", "x-github-api-version": "2022-11-28" },
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new HostError(`GitHub answered ${res.status} to GET contents ${path}`, res.status);
    return res.text();
  }
  workflows = async (owner: string, name: string) => (await this.call<{ workflows: { name: string; path: string; state: string }[] }>("GET", `/repos/${enc(owner)}/${enc(name)}/actions/workflows?per_page=100`)).workflows;

  rulesets = (owner: string, name: string) => this.call<{ id: number; name: string }[]>("GET", `/repos/${enc(owner)}/${enc(name)}/rulesets`);
  ruleset = (owner: string, name: string, id: number) => this.call<Ruleset>("GET", `/repos/${enc(owner)}/${enc(name)}/rulesets/${id}`);
  createRuleset = (owner: string, name: string, r: Ruleset) => this.call<Ruleset>("POST", `/repos/${enc(owner)}/${enc(name)}/rulesets`, r);
  updateRuleset = (owner: string, name: string, id: number, r: Ruleset) => this.call<Ruleset>("PUT", `/repos/${enc(owner)}/${enc(name)}/rulesets/${id}`, r);

  /** A repository's Actions secret, sealed to the repository's public key. */
  async setRepoSecret(owner: string, name: string, secret: string, value: string): Promise<void> {
    const key = await this.call<{ key_id: string; key: string }>("GET", `/repos/${enc(owner)}/${enc(name)}/actions/secrets/public-key`);
    await this.call("PUT", `/repos/${enc(owner)}/${enc(name)}/actions/secrets/${enc(secret)}`, { encrypted_value: sealedBox(value, key.key), key_id: key.key_id });
  }
  repoSecret = (owner: string, name: string, secret: string) => this.maybe<{ name: string; updated_at: string }>(`/repos/${enc(owner)}/${enc(name)}/actions/secrets/${enc(secret)}`);

  deployKeys = (owner: string, name: string) => this.call<{ id: number; title: string; read_only: boolean }[]>("GET", `/repos/${enc(owner)}/${enc(name)}/keys`);
  addDeployKey = (owner: string, name: string, title: string, key: string, readOnly: boolean) => this.call<{ id: number }>("POST", `/repos/${enc(owner)}/${enc(name)}/keys`, { title, key, read_only: readOnly });

  openPulls = (owner: string, name: string, head: string) => this.call<GitHubPull[]>("GET", `/repos/${enc(owner)}/${enc(name)}/pulls?state=open&head=${enc(`${owner}:${head}`)}`);
  pull = (owner: string, name: string, n: number) => this.call<GitHubPull>("GET", `/repos/${enc(owner)}/${enc(name)}/pulls/${n}`);
  createPull = (owner: string, name: string, head: string, base: string, title: string, body: string) => this.call<GitHubPull>("POST", `/repos/${enc(owner)}/${enc(name)}/pulls`, { head, base, title, body });
  /** Lets the repository's workflows open pull requests with their own token ("Allow GitHub Actions to create pull requests"). */
  allowActionsPullRequests = (owner: string, name: string) => this.call<void>("PUT", `/repos/${enc(owner)}/${enc(name)}/actions/permissions/workflow`, { default_workflow_permissions: "read", can_approve_pull_request_reviews: true });
  /** Merges a pull request; GitHub refuses while a required check has not passed. */
  mergePull = (owner: string, name: string, n: number) => this.call<{ merged: boolean }>("PUT", `/repos/${enc(owner)}/${enc(name)}/pulls/${n}/merge`, { merge_method: "merge" });
  /** GitHub keeps a pull request open when its branch is deleted; this closes it. */
  closePull = (owner: string, name: string, n: number) => this.call<GitHubPull>("PATCH", `/repos/${enc(owner)}/${enc(name)}/pulls/${n}`, { state: "closed" });

  /** Who pushed to a branch: the repository's push and force-push activity, each with the authenticated actor. */
  async pushers(owner: string, name: string, branch: string): Promise<string[]> {
    const users = new Set<string>();
    // The first push to a new branch is recorded as its creation, not as a push.
    for (const type of ["branch_creation", "push", "force_push"]) {
      for (let page = 1; page <= 20; page++) {
        const list = await this.call<{ actor: { login: string } | null }[]>("GET", `/repos/${enc(owner)}/${enc(name)}/activity?ref=${enc(`refs/heads/${branch}`)}&activity_type=${type}&per_page=100&page=${page}`);
        for (const a of list) users.add(a.actor?.login ?? "(unknown)");
        if (list.length < 100) break;
      }
    }
    return [...users].sort();
  }

  /** Auto-merge has no REST call: GraphQL enablePullRequestAutoMerge. GitHub offers it only while the pull request waits. */
  async autoMerge(pull: GitHubPull, method: "MERGE" | "SQUASH" = "MERGE", wait: (ms: number) => Promise<void> = sleep): Promise<void> {
    const query = "mutation($id: ID!, $method: PullRequestMergeMethod!) { enablePullRequestAutoMerge(input: { pullRequestId: $id, mergeMethod: $method }) { clientMutationId } }";
    let last: unknown;
    for (let i = 0; i < 10; i++) {
      const r = await this.call<{ errors?: { message: string }[] }>("POST", "/graphql", { query, variables: { id: pull.node_id, method } });
      if (!r.errors?.length) return;
      last = r.errors.map((e) => e.message).join("; ");
      await wait(3000);
    }
    throw new HostError(`GitHub did not set the pull request to merge itself: ${last}`, 422);
  }
}
