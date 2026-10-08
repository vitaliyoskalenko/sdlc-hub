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
}

const enc = encodeURIComponent;

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
    const res = await this.fetcher(`${this.api}${path}`, { headers: { "PRIVATE-TOKEN": this.token } });
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
  createProjectToken = (projectId: number, name: string, scopes: string[], accessLevel: number, expiresAt: string) =>
    this.call<{ id: number; token: string; expires_at: string }>("POST", `/projects/${projectId}/access_tokens`, { name, scopes, access_level: accessLevel, expires_at: expiresAt });
  projectTokens = (projectId: number) => this.call<{ id: number; name: string; active: boolean; revoked: boolean; expires_at: string }[]>("GET", `/projects/${projectId}/access_tokens`);
  groupVariable = (groupId: number, key: string) => this.maybe<{ key: string; masked: boolean; protected: boolean }>(`/groups/${groupId}/variables/${enc(key)}`);
  setGroupVariable = (groupId: number, key: string, value: string, opts: { masked: boolean; protected: boolean }) =>
    this.call<unknown>("POST", `/groups/${groupId}/variables`, { key, value, masked: opts.masked, protected: opts.protected, raw: true, variable_type: "env_var" });
}
