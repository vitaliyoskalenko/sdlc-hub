# Add people and set up their machines

For the admin who adds people to the hub, and for each person who sets it up on their own machine.

## The admin adds a person

1. Make sure the person can reach the repositories:
   - **GitLab:** member of the group with the Developer role.
   - **GitHub:** member of the organization with write access to `product-specs` and to their team's repository.
2. Open the hub's site, **Team**, then **Add a person**:
   - the username on the git host;
   - the name;
   - the roles (PO, PM, designer, Engineering, QA, Ops, admin);
   - for Engineering, the team, and whether they lead it;
   - the assistant they use (Claude Code, Codex or Cursor);
   - their system (macOS, Linux or Windows).
3. **Save.** The change is a merge request on `.hub/roles.yaml` that only the admin role passes; it merges by itself. The admin's view of the Team page marks anyone who is not in the group or organization on the host, asked with the admin's own git credential.
4. Open the person's **Setup script** on the same page and send it to them: a bash script for macOS and Linux, a PowerShell script for Windows. It contains no token, key or password, so it is safe to send by chat or email.

After a change of PM or admin, run `node hub/cli.js usage rekey` on your machine, so the new readers can read everyone's usage records (see [Settings](settings.md)).

## The person runs the script

What the machine needs first:

- **git**, and a way for git to reach the host over HTTPS. Both guides say how:
  - [GitLab](gitlab.md#what-each-person-needs-on-gitlab);
  - [GitHub](github.md#what-each-person-needs-on-github).
- **Node.js 22** or newer.
- **The assistant** named on the Team page: Claude Code, Codex or Cursor's CLI.

Then run the script:

```
bash setup-<you>.sh
```

On Windows, run `setup-<you>.ps1` in PowerShell instead.

It takes a few minutes and is safe to run again. It:

1. checks git, Node.js and the assistant;
2. signs in to the host through git (your credential manager, or the token you stored);
3. clones `product-specs` and the repositories of your role into one folder;
4. runs `node hub/cli.js setup`, which:
   - checks your role on `main`;
   - sets up the assistant with the hub plugin;
   - makes your usage key: the private half stays in your system keychain, the public half goes to `.hub/keys/<you>/` by a merge request that merges itself;
   - tells the admin it is done;
5. runs `node hub/cli.js doctor`;
6. opens Your guide.

## Every day

| Command | What it does |
|---|---|
| `node hub/cli.js serve` | Starts the site at `http://127.0.0.1:4173`, on your machine only. `/hub:start` in Claude Code does the same. |
| `node hub/cli.js sync` | Pulls `main` and `hub-state`, and refreshes Claude Code's copy of the hub plugin. Also sends what waited on this machine: saves made offline, stage events, and your usage (encrypted to you, the admins and the PMs). |
| `node hub/cli.js doctor` | Checks Node.js, `.hub/`, who you are, the git host and your assistant's plugin. |
| `/hub:status`, `/hub:next <slug>` | In Claude Code: where features are, and your next step. In Codex, `$hub-status`; in Cursor, `/hub-status`. |

On the site:

- **Changed since you last looked.** A feature whose step moved since your last visit is marked in the features table; opening it takes it as seen, and **Mark all as seen** clears the rest.
- **Notify me**, on Home: the browser tells you when a new action reaches you while the site's tab is in the background.
- **Keyboard:** `g` then `h`, `f`, `r`, `t`, `s` or `g` opens Home, Features, Releases, Team, Settings or Your guide; `/` finds a feature; `?` opens Help.

What you have seen, the notifications choice and the role you work as are kept in your browser only.

## Who you are

The hub matches your git identity (`user.name` and `user.email`, or `git config hub.user <username>`) to a person in `.hub/roles.yaml`. If the site says you are not in `roles.yaml`, ask the admin to add you, then run your setup script again.
