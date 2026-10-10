# Install SDLC Hub on GitHub

For the admin who installs the hub for a team on GitHub (github.com, or GitHub Enterprise Server). It takes about 15 minutes. Setup runs on your own machine and writes everything through the GitHub API and git; nothing is hosted.

## What you need

| | |
|---|---|
| Your role | **Owner** of the organization that holds the repositories. |
| Plan | **Team** or higher for private repositories. On **Free**, public repositories work in full. Private repositories on Free have no rulesets and no auto-merge, so they install only in advisory mode: `hub-guard` warns instead of refusing, and every pull request waits for someone to merge it. |
| Repositories | The specifications repository (usually `product-specs`; setup can create it) and one repository per team, all in the same organization. Each team repository should have its CI workflow already; the hub reports after it. |
| GitHub Actions | Allowed for the organization's repositories. GitHub-hosted runners are enough. |
| Deploy keys | Allowed in the organization (see step 1). |
| On your machine | Node.js 22 or newer, git and `ssh-keygen` (it comes with OpenSSH). |

## 1. Prepare the organization

Three settings, all under the organization's **Settings**:

1. **Fine-grained personal access tokens may access the organization.** Under **Third-party Access → Personal access tokens → Settings**, allow access through fine-grained tokens. If you require administrator approval, you approve your own token after step 2 under **Pending requests**.
2. **Deploy keys are allowed.** A new organization may have them turned off, and team CI writes `hub-state` with a deploy key. Allow them in the organization's repository policies (the setting is named *Deploy keys*), or with the GitHub CLI:

   ```
   gh api -X PATCH /orgs/<org> -F deploy_keys_enabled_for_repositories=true
   ```

   Setup checks this and says so when it is off.
3. **GitHub Actions may open pull requests.** Under **Actions → General → Workflow permissions**, tick *Allow GitHub Actions to create and approve pull requests*. The `hub-fanout` workflow in each team repository needs it to propose the shared files. Without it, the files still reach the branch `hub/fanout`, but no pull request opens. Setup warns when it is off.

## 2. Create your fine-grained token

Setup acts as you, so it needs a fine-grained personal access token of yours that belongs to the organization.

1. Open https://github.com/settings/personal-access-tokens/new (on Enterprise Server, your server's address instead of github.com). The setup site has a link to this page.
2. **Token name:** `SDLC Hub setup`. **Expiration:** a few days is enough. You need it only while you run setup.
3. **Resource owner:** the **organization**, not your own account. If the organization is not in the list, step 1.1 is not done.
4. **Repository access:** **All repositories**. If that is not offered, create the specifications and team repositories first and choose **Only select repositories** with all of them.
5. **Permissions.** Under **Repositories**, add:

   | Permission | Access |
   |---|---|
   | Administration | Read and write |
   | Contents | Read and write |
   | Pull requests | Read and write |
   | Workflows | Read and write |
   | Secrets | Read and write |
   | Actions | Read-only |
   | Metadata | Read-only (added by GitHub) |

   Under **Organization** (the tab appears once the resource owner is the organization), add:

   | Permission | Access |
   |---|---|
   | Members | Read-only |
   | Administration | Read and write |

   Leave **Account** permissions empty.
6. **Generate token** and copy it (`github_pat_…`).

The token stays in your system keychain (through git's credential helper) and in the setup's memory. It is never written to a repository, to a setup script or to the site. You can revoke it once the install is done; you need a new one to run setup again, for example after an upgrade.

## 3. Run setup

```
npx sdlc-hub init
```

The setup site opens at `http://127.0.0.1:4173/setup`. It has five screens:

1. **Git host.** Choose GitHub. The address is `github.com`, or your Enterprise Server. Paste the token and sign in.
2. **Repositories.** The organization, the specifications repository, and one row per team repository. Mark the team that publishes the API contract, if any.
3. **Project and tracker.** The project name, and Jira if you use it.
4. **Assistants and engine.** Which assistants people may use (Claude Code is always on), the engine, whether the site may start a read-only validation run, and how strict `hub-guard` is (see [Settings](settings.md)). Choose **Advisory** here if you install private repositories on GitHub Free.
5. **Review and install.** Setup runs its checks first:
   - your owner role;
   - the plan;
   - deploy keys allowed;
   - the team repositories;
   - `ssh-keygen`.

   **Install** stays disabled until the checks pass.

## 4. What Install does

| Step | What it does |
|---|---|
| Files | Writes `.hub/` (configuration, roles, flow, engine), the hub as one file `hub/cli.js`, the assistant plugin and skills, the `hub-guard` workflow (`.github/workflows/hub-guard.yml`), and the hub sections of `CLAUDE.md` and `AGENTS.md` into the specifications repository. You are the first person in `.hub/roles.yaml`, as admin. Once `main` is protected, these changes arrive as a pull request that setup merges as soon as `hub-guard` passes. |
| Recheck | The workflow `.github/workflows/hub-recheck.yml` runs when `.hub/` changes on the default branch. It runs the `hub-guard` job of every open pull request again, so a result under the old roles does not merge. |
| Settings | Allows auto-merge, deletes a branch once it merged, and turns forking off for a private repository. A public repository can always be forked; a pull request from a fork goes through `hub-guard` like any other. |
| `hub-state` | Creates the branch `hub-state` for machine data: team snapshots, test results, stage events, encrypted usage. It is a display cache, never trusted for a gate. |
| Deploy key | Makes a new SSH key pair. The public half becomes a deploy key with write access on `product-specs` (named `sdlc-hub hub-state <date>`). The private half becomes the repository secret **`HUB_STATE_KEY`** in each team repository. The private key is stored nowhere else. |
| Ruleset | Adds the ruleset **`sdlc-hub: main`** on the default branch: pull requests only, the status check **`hub-guard`** required (on github.com, only from GitHub Actions, so a status a person posts does not count), no deletion and no force push, with nobody allowed to bypass it. Skipped on Free with private repositories. |
| Team repositories | Opens one pull request per team repository that adds two workflows. `hub-report` (`.github/workflows/hub-report.yml`) runs after the team's own workflows and publishes the team's tasks, tracker, review verdict and workflow result to `hub-state`. `hub-fanout` (`.github/workflows/hub-fanout.yml`) runs every hour and on demand: it reads `product-specs` with the deploy key and opens a pull request on `hub/fanout` with the shared files of the team's features (spec, flows, screens, test plan, contracts). Install also lets the repository's workflows open pull requests (*Allow GitHub Actions to create pull requests*). |

`hub-guard` runs on `pull_request_target`, so the workflow and the hub it runs always come from the default branch: a pull request cannot change its own check. It reads the pull request only as data.

Install can be run again at any time. Each step checks first, so a second run skips what is done and continues where it stopped.

## 5. After Install

- **Each team lead merges** the pull request that adds the hub workflows to their repository, and later the `hub/fanout` pull requests with the shared files of their features. The copies are read-only there: they change in `product-specs`.
- If the organization's policy forbids workflows to open pull requests, allow it for the team repositories (organization **Settings → Actions → General**). Setup says so when it cannot.
- **Add each person** on the Team page, then send them their setup script (see [People](people.md)). Each person must be a member of the organization with **write** access to `product-specs` and to their team's repository.
- **A new team repository later** needs the `HUB_STATE_KEY` secret too. Run setup again: it makes a new deploy key for all team repositories. Remove older `sdlc-hub hub-state` keys from `product-specs` once team CI uses the newest.
- Nothing expires on its own: the deploy key and the secrets have no end date.

## Upgrade the hub

The hub's version is in `hub/package.json`. To upgrade, run the newer hub in your clone of `product-specs`, as the admin:

```
npx sdlc-hub@<version> upgrade
```

It proposes the newer `hub/cli.js`, its version, the plugin and the assistants' files as one pull request in your name. The pull request merges itself when `hub-guard` passes. `.hub/` stays as you wrote it, and the hub never goes back to an older version.

Everyone gets the upgrade with `node hub/cli.js sync`. A site still running the older hub turns read only, and says to sync and start it again.

The upgrade also carries the `hub-guard` workflow of the new version.

## Remove the hub

As the admin, in your clone of `product-specs`:

```
node hub/cli.js uninstall
```

It proposes one change that removes `hub/`, `.hub/` and the assistants' hub files; the feature documents stay. Then it lists what install set up on the host, to lift by hand once the change has merged.

## What each person needs on GitHub

- Membership in the organization, with write access to `product-specs` and their team's repository.
- A way for git to reach GitHub over **HTTPS** with a token. Setup scripts clone with `https://` addresses, and nothing secret is in the script. The site also uses that token to open each save's pull request, because GitHub, unlike GitLab, cannot open a pull request from a plain `git push`. The simplest way:

  ```
  gh auth login
  gh auth setup-git
  ```

  Or a fine-grained token of their own, with the organization as resource owner. On `product-specs` it needs **Contents** and **Pull requests**, read and write. On their team's repository it needs **Contents**, read and write. Git's credential helper stores it on first use.
- SSH alone is not enough for saving from the site; the site says how to sign in when no token is found.

## Troubleshooting

| What you see | Why, and what to do |
|---|---|
| "GitHub refused the token" | The resource owner is your account instead of the organization, the token has expired, or the organization has not approved it yet. |
| The organization is missing from *Resource owner* | The organization does not allow fine-grained tokens yet (step 1.1). |
| "Deploy keys are disabled for this repository" | Allow deploy keys in the organization (step 1.2). |
| "GitHub Free gives private repositories no rulesets" | Upgrade to Team, make the repositories public, or choose Advisory on screen 4. |
| A save stays "waiting to merge" | `hub-guard` has not passed yet, or it failed: open the pull request's checks. The site merges a save that auto-merge left open once the check passes. |
| A team's snapshot never appears | The team lead has not merged the `hub-report` pull request, or `HUB_STATE_KEY` is missing (run setup again). |
