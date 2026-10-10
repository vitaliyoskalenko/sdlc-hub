// The GitLab REST API v4, the calls the install needs and nothing more. The token is a personal access token the
// admin pasted (scope api); it is held in memory and in the system keychain, never written to a file.

export class HostError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly detail?: unknown,
  ) {
    super(message);
  }
}

export interface GitLabUser {
  id: number;
  username: string;
  name: string;
  /** The public e-mail, when the person set one; the commit e-mail otherwise. */
  email?: string;
  commit_email?: string;
  is_admin?: boolean;
}

export interface GitLabGroup {
  id: number;
  full_path: string;
  visibility: string;
}

export interface GitLabProject {
  id: number;
  path_with_namespace: string;
  default_branch: string | null;
  empty_repo: boolean;
  forking_access_level: string;
  shared_runners_enabled: boolean;
  http_url_to_repo: string;
  web_url: string;
  ci_config_path?: string | null;
  only_allow_merge_if_pipeline_succeeds?: boolean;
  allow_merge_on_skipped_pipeline?: boolean | null;
}

export interface GitLabRunner {
  id: number;
  description: string;
  online?: boolean;
  status?: string;
  runner_type?: string;
}

export interface CommitAction {
  action: "create" | "update" | "delete";
  file_path: string;
  content?: string;
  encoding?: "text" | "base64";
}

export interface MergeRequest {
  iid: number;
  web_url: string;
  state: string;
  source_branch: string;
  target_branch?: string;
  author?: { username: string };
  created_at?: string;
  detailed_merge_status?: string;
  merge_when_pipeline_succeeds?: boolean;
  merged_by?: { username: string } | null;
  head_pipeline?: { id: number; status: string } | null;
}

export interface PushEvent {
  author_username: string;
  created_at: string;
  push_data?: { ref: string; ref_type: string };
}

const enc = encodeURIComponent;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
/** detailed_merge_status while GitLab is still checking a merge request. */
const CHECKING = ["unchecked", "checking", "preparing", "approvals_syncing"];

export interface Proposal {
  target: string;
  branch: string;
  title: string;
  description: string;
  actions: CommitAction[];
}

export class GitLab {
  readonly api: string;
  constructor(
    /** For example https://gitlab.example.com */
    readonly url: string,
    private readonly token: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    this.api = `${url.replace(/\/+$/, "")}/api/v4`;
  }

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.fetcher(`${this.api}${path}`, {
      // A request GitLab never answers fails after a minute instead of holding the install forever.
      signal: AbortSignal.timeout(60_000),
      method,
      headers: { "PRIVATE-TOKEN": this.token, ...(body === undefined ? {} : { "content-type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    const data = text ? (JSON.parse(text) as unknown) : undefined;
    if (!res.ok) {
      const msg = (data as { message?: unknown; error?: unknown } | undefined)?.message ?? (data as { error?: unknown } | undefined)?.error ?? res.statusText;
      throw new HostError(`GitLab answered ${res.status} to ${method} ${path}: ${typeof msg === "string" ? msg : JSON.stringify(msg)}`, res.status, data);
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

  /** The header git uses over HTTPS with this token. Passed to git through its environment, never its arguments. */
  gitAuthHeader = (): string => `Authorization: Basic ${Buffer.from(`oauth2:${this.token}`).toString("base64")}`;

  me = () => this.call<GitLabUser>("GET", "/user");
  version = () => this.call<{ version: string; revision: string }>("GET", "/version");
  group = (path: string) => this.maybe<GitLabGroup>(`/groups/${enc(path)}`);
  /** Usernames of everyone in the group, inherited members included. */
  async groupMembers(path: string): Promise<string[]> {
    const out: string[] = [];
    for (let page = 1; page <= 50; page++) {
      const list = await this.call<{ username: string }[]>("GET", `/groups/${enc(path)}/members/all?per_page=100&page=${page}`);
      out.push(...list.map((m) => m.username));
      if (list.length < 100) break;
    }
    return out;
  }
  /** The access level of a user in a group, inherited ones included (50 is Owner). */
  async groupAccess(groupId: number, userId: number): Promise<number> {
    return (await this.maybe<{ access_level: number }>(`/groups/${groupId}/members/all/${userId}`))?.access_level ?? 0;
  }
  project = (path: string) => this.maybe<GitLabProject>(`/projects/${enc(path)}`);
  createProject = (namespaceId: number, path: string) =>
    this.call<GitLabProject>("POST", "/projects", { namespace_id: namespaceId, path, name: path, visibility: "private", initialize_with_readme: true });
  setForking = (projectId: number, level: "disabled" | "private" | "enabled") => this.call<GitLabProject>("PUT", `/projects/${projectId}`, { forking_access_level: level });
  /** Runners the project can use: its own, its groups', and instance runners when shared runners are on. */
  runners = (projectId: number) => this.call<GitLabRunner[]>("GET", `/projects/${projectId}/runners?per_page=100`);
  file = (projectId: number, path: string, ref: string) => this.maybeText(`/projects/${projectId}/repository/files/${enc(path)}/raw?ref=${enc(ref)}`);
  private async maybeText(path: string): Promise<string | null> {
    const res = await this.fetcher(`${this.api}${path}`, { headers: { "PRIVATE-TOKEN": this.token }, signal: AbortSignal.timeout(60_000) });
    if (res.status === 404) return null;
    if (!res.ok) throw new HostError(`GitLab answered ${res.status} to GET ${path}`, res.status);
    return res.text();
  }
  branch = (projectId: number, name: string) => this.maybe<{ name: string; commit: { id: string } }>(`/projects/${projectId}/repository/branches/${enc(name)}`);
  commit = (projectId: number, branch: string, message: string, actions: CommitAction[], startBranch?: string) =>
    this.call<{ id: string; web_url: string }>("POST", `/projects/${projectId}/repository/commits`, { branch, commit_message: message, actions, ...(startBranch ? { start_branch: startBranch } : {}) });
  openMergeRequests = (projectId: number, source: string) =>
    this.call<MergeRequest[]>("GET", `/projects/${projectId}/merge_requests?state=opened&source_branch=${enc(source)}`);
  createMergeRequest = (projectId: number, source: string, target: string, title: string, description: string) =>
    this.call<MergeRequest>("POST", `/projects/${projectId}/merge_requests`, { source_branch: source, target_branch: target, title, description, remove_source_branch: true });
  mergeRequest = (projectId: number | string, iid: number) => this.call<MergeRequest>("GET", `/projects/${enc(String(projectId))}/merge_requests/${iid}`);
  updateMergeRequest = (projectId: number, iid: number, fields: Record<string, unknown>) => this.call<MergeRequest>("PUT", `/projects/${projectId}/merge_requests/${iid}`, fields);
  /** Sets a merge request to merge by itself when its pipeline succeeds. GitLab answers 405 or 422 until it has checked it. */
  mergeWhenPipelineSucceeds = (projectId: number, iid: number) =>
    this.call<MergeRequest>("PUT", `/projects/${projectId}/merge_requests/${iid}/merge`, { merge_when_pipeline_succeeds: true, should_remove_source_branch: true });
  /**
   * Sets a new merge request to merge by itself when its pipeline succeeds. GitLab first checks the merge request
   * and answers 405 or 422 until then, so this waits and retries for about a minute.
   */
  async autoMerge(projectId: number, iid: number, wait: (ms: number) => Promise<void> = sleep): Promise<MergeRequest> {
    for (let i = 0; i < 30; i++) {
      const mr = await this.mergeRequest(projectId, iid);
      // Already set: GitLab does not take the request a second time.
      if (mr.merge_when_pipeline_succeeds) return mr;
      if (!CHECKING.includes(mr.detailed_merge_status ?? "")) break;
      await wait(2000);
    }
    let last: unknown;
    for (let i = 0; i < 20; i++) {
      try {
        return await this.mergeWhenPipelineSucceeds(projectId, iid);
      } catch (e) {
        if (!(e instanceof HostError) || ![405, 406, 409, 422].includes(e.status)) throw e;
        last = e;
        await wait(3000);
      }
    }
    throw last;
  }
  /** A change to a protected branch: commit to a branch, open (or reuse) its merge request and set it to merge itself. */
  async propose(projectId: number, p: Proposal): Promise<MergeRequest> {
    const exists = await this.branch(projectId, p.branch);
    await this.commit(projectId, p.branch, p.title, p.actions, exists ? undefined : p.target);
    const mr = (await this.openMergeRequests(projectId, p.branch))[0] ?? (await this.createMergeRequest(projectId, p.branch, p.target, p.title, p.description));
    await this.autoMerge(projectId, mr.iid);
    return mr;
  }
  /** Everyone who pushed to a branch since a day (YYYY-MM-DD), from the project's push events, all pages. */
  async pushers(projectId: number | string, branch: string, since: string): Promise<string[]> {
    const users = new Set<string>();
    const day = new Date(Date.parse(since) - 86_400_000).toISOString().slice(0, 10);
    for (let page = 1; page <= 50; page++) {
      const list = await this.call<PushEvent[]>("GET", `/projects/${enc(String(projectId))}/events?action=pushed&after=${day}&per_page=100&page=${page}`);
      for (const e of list) if (e.push_data?.ref_type === "branch" && e.push_data.ref === branch && e.created_at >= since) users.add(e.author_username);
      if (list.length < 100) break;
    }
    return [...users].sort();
  }
  createProjectToken = (projectId: number, name: string, scopes: string[], accessLevel: number, expiresAt: string) =>
    this.call<{ id: number; token: string; expires_at: string }>("POST", `/projects/${projectId}/access_tokens`, { name, scopes, access_level: accessLevel, expires_at: expiresAt });
  projectTokens = (projectId: number) => this.call<{ id: number; name: string; active: boolean; revoked: boolean; expires_at: string }[]>("GET", `/projects/${projectId}/access_tokens`);
  /** Project settings the install changes: the CI configuration file and "Pipelines must succeed". */
  updateProject = (projectId: number, settings: Record<string, unknown>) => this.call<GitLabProject & Record<string, unknown>>("PUT", `/projects/${projectId}`, settings);
  protectedBranch = (projectId: number, name: string) =>
    this.maybe<{ name: string; push_access_levels: { access_level: number }[]; merge_access_levels: { access_level: number }[] }>(`/projects/${projectId}/protected_branches/${enc(name)}`);
  unprotectBranch = (projectId: number, name: string) => this.call<unknown>("DELETE", `/projects/${projectId}/protected_branches/${enc(name)}`);
  protectBranch = (projectId: number, name: string, push: number, merge: number) =>
    this.call<unknown>("POST", `/projects/${projectId}/protected_branches`, { name, push_access_level: push, merge_access_level: merge });
  projectVariable = (projectId: number, key: string) => this.maybe<{ key: string; masked: boolean; protected: boolean }>(`/projects/${projectId}/variables/${enc(key)}`);
  setProjectVariable = (projectId: number, key: string, value: string, opts: { masked: boolean; protected: boolean }) =>
    this.call<unknown>("POST", `/projects/${projectId}/variables`, { key, value, masked: opts.masked, protected: opts.protected, raw: true, variable_type: "env_var" });
  groupVariable = (groupId: number, key: string) => this.maybe<{ key: string; masked: boolean; protected: boolean }>(`/groups/${groupId}/variables/${enc(key)}`);
  setGroupVariable = (groupId: number, key: string, value: string, opts: { masked: boolean; protected: boolean }) =>
    this.call<unknown>("POST", `/groups/${groupId}/variables`, { key, value, masked: opts.masked, protected: opts.protected, raw: true, variable_type: "env_var" });
}
