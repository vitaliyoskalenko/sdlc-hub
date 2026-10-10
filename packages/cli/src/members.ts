// Who is in the group (GitLab) or the organization (GitHub), for the Team page: a person in roles.yaml who is not
// a member cannot clone or save. It asks the host with this machine's own git credential, and keeps the answer for ten
// minutes. Without a credential that may list members, it says so instead.

import type { Config } from "@sdlc-hub/core";
import { GitHub, GitLab } from "@sdlc-hub/host";
import { githubApi, githubWeb, hostUrl } from "@sdlc-hub/install";
import { credentialFill } from "./host-saves.ts";

export type Members = { users: string[] } | { error: string };

export function membersOf(config: Config, o: { fill?: (web: string) => string | undefined; fetcher?: typeof fetch; now?: () => number } = {}): () => Promise<Members> {
  let cached: { at: number; value: Members } | undefined;
  const now = o.now ?? Date.now;
  return async () => {
    if (cached && now() - cached.at < 600_000) return cached.value;
    const github = config.git.provider === "github";
    const web = github ? githubWeb(config.git.host) : hostUrl(config.git.host);
    const token = (o.fill ?? credentialFill)(web);
    let value: Members;
    if (!token) value = { error: `This machine has no token for ${new URL(web).host} to list the ${github ? "organization's" : "group's"} members` };
    else
      try {
        value = { users: github ? await new GitHub(token, githubApi(web), o.fetcher).orgMembers(config.git.namespace) : await new GitLab(web, token, o.fetcher).groupMembers(config.git.namespace) };
      } catch (e) {
        value = { error: `Could not list the members: ${(e as Error).message.split("\n")[0]}` };
      }
    cached = { at: now(), value };
    return value;
  };
}
