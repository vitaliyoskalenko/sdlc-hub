# Install SDLC Hub on GitLab

For the admin who installs the hub for a team on GitLab, self-managed or gitlab.com. It takes about 15 minutes. Setup runs on your own machine and writes everything through the GitLab API and git; nothing is hosted.

## What you need

| | |
|---|---|
| GitLab | Self-managed, Free tier or higher (tested on GitLab CE 19.4.1). On gitlab.com you need Premium or Ultimate, because project access tokens are not available on gitlab.com Free. |
| Your role | **Owner** of the group that holds the repositories. You do not need to be an instance administrator. |
| Repositories | The specifications repository (usually `product-specs`; setup can create it) and one repository per team (backend, web, mobile and so on), all in the same group. |
| A CI runner | At least one runner online for the group: an instance, group or project runner. Without one, no change to `product-specs` can ever merge, because every merge waits for the `hub-guard` job. |
| On your machine | Node.js 22 or newer and git. |

## 1. Create your personal access token

Setup acts as you, so it needs a token of yours with the `api` scope.

1. In GitLab, open your avatar, then **Edit profile → Access tokens** (or go to `https://<your-gitlab>/-/user_settings/personal_access_tokens`). The setup site has a link that opens this page with the name and the scope already filled in.
2. Choose **Add new token**.
3. Name: `SDLC Hub setup`. Expiration: a few days is enough. You need it only while you run setup.
4. Scopes: tick **`api`** only.
5. Choose **Create personal access token** and copy it.

The token stays in your system keychain (through git's credential helper) and in the setup's memory. It is never written to a repository, to a setup script or to the site. You can revoke it once the install is done; you need a new one to run setup again, for example after an upgrade.

## 2. Run setup

```
npx sdlc-hub init
```

The setup site opens at `http://127.0.0.1:4173/setup`. It has five screens:

1. **Git host.** Choose GitLab, enter the address (`gitlab.example.com`, or `gitlab.com`), paste the token and sign in.
2. **Repositories.** The group, the specifications repository, and one row per team repository. Mark the team that publishes the API contract, if any.
3. **Project and tracker.** The project name, and Jira if you use it.
4. **Assistants and engine.** Which assistants people may use (Claude Code is always on), the engine, whether the site may start a read-only validation run, and how strict `hub-guard` is (see [Settings](settings.md)).
5. **Review and install.** Setup runs its checks first:
   - your Owner role;
   - a runner online;
   - the GitLab version;
   - forking of the specifications repository.

   **Install** stays disabled until the checks pass.

## 3. What Install does

| Step | What it does |
|---|---|
| Files | Writes `.hub/` (configuration, roles, flow, engine), the hub as one file `hub/cli.js`, the assistant plugin and skills, and the hub sections of `CLAUDE.md` and `AGENTS.md` into the specifications repository. You are the first person in `.hub/roles.yaml`, as admin. |
| Forking | Turns off forking of the specifications repository, so no change can come from a fork. |
| `hub-state` | Creates the branch `hub-state` for machine data: team snapshots, test results, stage events, encrypted usage. It is a display cache, never trusted for a gate. |
| `HUB_STATE_TOKEN` | Creates a project access token on `product-specs` (Developer role; `read_repository` and `write_repository`; expires in 364 days). Stores it as a **masked group variable** `HUB_STATE_TOKEN`, so every team pipeline can write `hub-state`. |
| `hub-ci` | Creates the project `hub-ci` with the `hub-guard` job configuration. Its `main` is protected; only Maintainers push and merge. |
| `HUB_GUARD_TOKEN` | Creates a read-only project access token (`read_api`, Reporter role, 364 days), stored as a **masked variable** of `product-specs`. The guard uses it to ask who opened a merge request and who pushed to it. |
| CI configuration | Points the CI configuration of `product-specs` at `ci/product-specs.yml@<group>/hub-ci`, so a merge request cannot change its own check. Turns on **Pipelines must succeed**. |
| Protect `main` | Protects `main` of `product-specs`: **no one pushes**; Developers and Maintainers merge. Every change, yours included, now arrives as a merge request that merges itself once `hub-guard` passes. |
| Team repositories | Opens one merge request per team repository that adds the `hub-report` job (`ci/hub-report.gitlab-ci.yml`, included from `.gitlab-ci.yml`). It publishes the team's tasks, tracker, review verdict and pipeline result to `hub-state`. |

Install can be run again at any time. Each step checks first, so a second run skips what is done and continues where it stopped. Once `main` is protected, its own changes arrive as a merge request too.

## 4. After Install

The setup page lists what is left for people:

- **Each team lead merges** the merge request that adds `hub-report` to their repository.
- **Renew the tokens before they expire.** The page names the day for each one:
  - When `HUB_STATE_TOKEN` expires, team pipelines stop publishing.
  - When `HUB_GUARD_TOKEN` expires, `hub-guard` fails and **nothing can merge into `product-specs`**.

  To renew, create a new project access token with the same name, role and scopes on `product-specs` (**Settings → Access tokens**), and replace the variable's value: the group's **Settings → CI/CD → Variables** for `HUB_STATE_TOKEN`, the project's for `HUB_GUARD_TOKEN`. Running setup again also creates a missing token.
- **Keep the people of the hub at the Developer role** in the group. On GitLab Free a protected branch cannot be limited to the Owner, so a Maintainer could change `hub-ci` or the protection of `main`.
- **Optional, self-managed only:** a pre-receive server hook, which needs access to the GitLab server.
- **Add each person** on People and roles, then send them their setup script (see [People](people.md)).

## Upgrade the hub

The hub's version is in `hub/package.json`. To upgrade, run the newer hub in your clone of `product-specs`, as the admin:

```
npx sdlc-hub@<version> upgrade
```

It proposes the newer `hub/cli.js`, its version, the plugin and the assistants' files as one merge request in your name. The merge request merges itself when `hub-guard` passes. `.hub/` stays as you wrote it, and the hub never goes back to an older version.

Everyone gets the upgrade with `node hub/cli.js sync`. A site still running the older hub turns read only, and says to sync and start it again.

`hub-ci` keeps its job configuration. If a release note says it changed, run setup again.

## What each person needs on GitLab

- Membership in the group with the **Developer** role.
- A way for git to reach GitLab over **HTTPS**. Setup scripts clone with `https://` addresses, and nothing secret is in the script. Either of these works:
  - Git Credential Manager, which signs in through the browser the first time;
  - a personal access token with **`read_repository`** and **`write_repository`**, stored by git's credential helper on first use (username: your GitLab username, password: the token).
- Saving from the site needs nothing more: a save is a git push with push options that open the merge request and set it to merge when the pipeline succeeds.

## Troubleshooting

| What you see | Why, and what to do |
|---|---|
| "GitLab refused the token" | The token lacks the `api` scope, has expired, or belongs to another instance. Make a new one. |
| "You need the Owner role" | Ask the group's Owner to install, or to make you Owner for the install. |
| "No runner is online" | Register a runner for the group, or ask the instance administrator to enable instance runners. |
| Every merge request into `product-specs` fails at `hub-guard` | Open the job log: it names each file and the rule it broke. If it says the token was refused, `HUB_GUARD_TOKEN` has expired. |
| A team's snapshot never appears | The team lead has not merged the `hub-report` merge request, or `HUB_STATE_TOKEN` has expired. |
